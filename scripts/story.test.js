'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// the short-story rules from app.js, run on their own
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const from = app.indexOf('// ---- story rules:');
const to = app.indexOf('// ---- end of story rules ----');
const context = vm.createContext({});
vm.runInContext(app.slice(from, to), context);
vm.runInContext(`this.api = { ST_LINES, ST_HEAD, stPages, stRoundWords, stCategory, stSurname, stKeywords,
  stHeader, stHead, stLinesFromHeight, stPageAt, stPdfHtml, stDocxEntries };`, context);
const st = context.api;

test('a manuscript page holds 27 double-spaced lines; page one gives 14 to the title block', () => {
  assert.equal(st.ST_LINES, 27);
  assert.equal(st.ST_HEAD, 14);
  assert.deepEqual({ ...st.stPages(0) }, { pages: 1, last: 14 });
  assert.deepEqual({ ...st.stPages(13) }, { pages: 1, last: 27 });
  assert.deepEqual({ ...st.stPages(14) }, { pages: 2, last: 1 });
  assert.deepEqual({ ...st.stPages(40) }, { pages: 2, last: 27 });
  assert.deepEqual({ ...st.stPages(41) }, { pages: 3, last: 1 });
  assert.deepEqual({ ...st.stPages(139) }, { pages: 6, last: 18 });
});

test('the count on page one is rounded the way editors read it', () => {
  assert.equal(st.stRoundWords(0), 0);
  assert.equal(st.stRoundWords(73), 73, 'under a hundred: as it is');
  assert.equal(st.stRoundWords(120), 100);
  assert.equal(st.stRoundWords(149), 100);
  assert.equal(st.stRoundWords(150), 200);
  assert.equal(st.stRoundWords(4312), 4300);
  assert.equal(st.stRoundWords(14949), 14900);
  assert.equal(st.stRoundWords(16240), 16000, 'near novella length: to the nearest 500');
  assert.equal(st.stRoundWords(16260), 16500);
});

test('the length names the kind of story, on the SFWA lines', () => {
  assert.equal(st.stCategory(800), 'flash');
  assert.equal(st.stCategory(1000), 'short story');
  assert.equal(st.stCategory(7499), 'short story');
  assert.equal(st.stCategory(7500), 'novelette');
  assert.equal(st.stCategory(17500), 'novella');
  assert.equal(st.stCategory(40000), 'novel');
});

test('the running head: the byline\'s surname, a keyword or two, the page', () => {
  assert.equal(st.stSurname('William Shunn'), 'Shunn');
  assert.equal(st.stSurname('Martin Luther King, Jr.'), 'King');
  assert.equal(st.stSurname('J. A. Crow III'), 'Crow');
  assert.equal(st.stSurname('Cher'), 'Cher');
  assert.equal(st.stSurname(''), '');
  assert.equal(st.stKeywords('Rapture'), 'Rapture');
  assert.equal(st.stKeywords('The Harbor'), 'The Harbor');
  assert.equal(st.stKeywords('The Harbor at Night'), 'Harbor');
  assert.equal(st.stKeywords('A Song for Ice and Fire'), 'Song');
  assert.equal(st.stKeywords('Every Light in the House'), 'Every Light');
  assert.equal(st.stKeywords('Ships, Lights, and Water'), 'Ships Lights');
  assert.equal(st.stHeader('William Shunn', 'An Alternate History of the Mormons', 3), 'Shunn / Alternate History / 3');
  assert.equal(st.stHeader('', '', 2), '2');
  assert.equal(st.stHeader('William Shunn', 'Long Title', 4, 'Mormons'), 'Shunn / Mormons / 4', 'a keyword the writer chose');
});

test('lines are read back from the page\'s height, less the gaps between pages', () => {
  const gap = 7.65;
  assert.equal(st.stLinesFromHeight(0, 0, gap), 0);
  assert.equal(st.stLinesFromHeight(9, 0, gap), 9);
  assert.equal(st.stLinesFromHeight(20, 0, gap), 20, 'no gaps yet: all of it is lines');
  assert.equal(st.stLinesFromHeight(13 + gap + 5, 1, gap), 18);
  assert.equal(st.stLinesFromHeight(13 + gap + 27 + gap + 2, 2, gap), 42);
  // and the page a point lies on
  assert.equal(st.stPageAt(0.5, 2, gap), 1);
  assert.equal(st.stPageAt(12.9, 2, gap), 1);
  assert.equal(st.stPageAt(13 + 1, 2, gap), 2, 'in the gap: the page below');
  assert.equal(st.stPageAt(13 + gap + 26.9, 2, gap), 2);
  assert.equal(st.stPageAt(13 + gap + 27 + gap + 1, 2, gap), 3);
});

const sample = () => ({
  font: 'times',
  contact: 'Jo Writer\n1 Elm St\njo@example.com',
  words: 'about 4,300 words',
  title: 'The Harbor at Night',
  byline: 'by J. A. Crow',
  head: 'Crow / Harbor',
  end: 'END',
  paras: [
    { runs: [{ text: 'It was <late>.' }] },
    { sceneBreak: true, runs: [] },
    { runs: [{ text: 'Then ' }, { text: 'morning', i: true }, { text: ' came.' }], align: 'justify' },
    { runs: [{ text: 'A sign: CLOSED' }], align: 'center' }
  ]
});

test('the PDF: Shunn\'s page, the running head left off page one', () => {
  const html = st.stPdfHtml(sample(), '');
  assert.match(html, /@page \{ size: 8\.5in 11in; margin: 1in;/);
  assert.match(html, /@top-right \{ content: "Crow \/ Harbor \/ " counter\(page\)/);
  assert.match(html, /@page :first \{ @top-right \{ content: none; \} \}/);
  assert.match(html, /line-height: 24pt/);
  assert.match(html, /Jo Writer<br>1 Elm St<br>jo@example\.com/);
  assert.match(html, /<p>It was &lt;late&gt;\.<\/p><p class="brk">#<\/p>/, 'text escaped, the break a #');
  assert.match(html, /<p>Then <i>morning<\/i> came\.<\/p>/, 'justified prose goes out ragged right');
  assert.match(html, /<p style="text-align:center;text-indent:0">A sign: CLOSED<\/p>/);
  assert.match(html, /<p class="end">END<\/p><\/body>/);
  assert.match(st.stPdfHtml({ ...sample(), font: 'courier' }, ''), /font-family: 'Courier Prime'/);
});

test('the Word file: exact double spacing, a header with the page number, none on page one', () => {
  const files = Object.fromEntries(st.stDocxEntries(sample()).map((e) => [e.path, e.content]));
  const doc = files['word/document.xml'];
  assert.match(doc, /<w:titlePg\/>/);
  assert.match(doc, /<w:headerReference w:type="default" r:id="rId2"\/>/);
  assert.match(doc, /w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720"/);
  assert.match(doc, /Jo Writer<\/w:t><\/w:r><w:r><w:tab\/><\/w:r><w:r><w:t xml:space="preserve">about 4,300 words/, 'the count at the right of the first line');
  assert.match(doc, /w:before="4560"/, 'the title eleven lines down, less the three of the contact block');
  assert.match(doc, /w:line="480" w:lineRule="exact"\/><w:ind w:firstLine="720"\/><\/w:pPr><w:r><w:t xml:space="preserve">It was &lt;late&gt;\./);
  assert.match(doc, /<w:r><w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">morning/);
  assert.match(doc, /<w:jc w:val="center"\/><\/w:pPr><w:r><w:t xml:space="preserve">#<\/w:t>/);
  assert.ok(!/w:val="both"/.test(doc), 'nothing justified');
  assert.match(files['word/header1.xml'], /Crow \/ Harbor \/ <\/w:t>.*PAGE/);
  assert.match(files['word/styles.xml'], /w:ascii="Times New Roman"/);
  assert.match(files['word/styles.xml'], /<w:widowControl w:val="0"\/>/);
  assert.match(files['[Content_Types].xml'], /header1\.xml/);
  const courier = Object.fromEntries(st.stDocxEntries({ ...sample(), font: 'courier' }).map((e) => [e.path, e.content]));
  assert.match(courier['word/styles.xml'], /w:ascii="Courier New"/);
});

// the importer's reader of a manuscript's first page, from main.js
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const mctx = vm.createContext({});
vm.runInContext(mainSrc.slice(mainSrc.indexOf('// ---- manuscript reader:'), mainSrc.indexOf('// ---- end of manuscript reader ----')) + ';this.readManuscript = readManuscript;', mctx);
const P = (...texts) => texts.map((text) => ({ text }));

test('a Word file in manuscript format is read as a story', () => {
  // NEO's own export: the count's tab is lost, so it is glued to the name
  const ms = mctx.readManuscript(P('Jo Writerabout 4,300 words', '1 Elm St', 'jo@example.com', 'The Harbor at Night', 'by J. A. Crow', '', 'It was late.', '#', 'Morning came.', 'END'));
  assert.equal(ms.title, 'The Harbor at Night');
  assert.equal(ms.author, 'J. A. Crow');
  assert.equal(ms.contact, 'Jo Writer\n1 Elm St\njo@example.com');
  assert.deepEqual(ms.body.map((p) => p.text), ['It was late.', '#', 'Morning came.'], 'END left off');
  // the count on a line of its own, blank lines down to the title
  const b = mctx.readManuscript(P('Jo Writer', 'jo@example.com', 'Approx. 1,200 words', '', '', '', '*Rapture*', '', 'by William Shunn', '', 'Text.', 'THE END'));
  assert.equal(b.title, 'Rapture');
  assert.equal(b.contact, 'Jo Writer\njo@example.com');
  assert.deepEqual(b.body.map((p) => p.text), ['Text.']);
});

test('other files are not read as stories', () => {
  assert.equal(mctx.readManuscript(P('The Long Way Home', 'by Jo Writer', 'Chapter One', 'It was late.')), null, 'no count');
  assert.equal(mctx.readManuscript(P('Jo Writer', 'about 90,000 words', 'Notes on the plot', 'More notes.')), null, 'no byline');
  // a novel's first page reads the same, but its chapters start on new pages
  const novel = [...P('Jo Writer', 'about 90,000 words', 'The Long Book', 'by Jo Writer', 'One.'), { text: 'Two.', pageBreak: true }, { text: 'Three.', pageBreak: true }];
  assert.equal(mctx.readManuscript(novel), null, 'a novel stays a book');
});

test('an anonymous manuscript carries no name: no contact, no byline, a head of keywords alone', () => {
  assert.equal(st.stHead('', 'Every Light in the House', ''), 'Every Light');
  assert.equal(st.stHead('', 'Every Light in the House', 'Lights'), 'Lights');
  const anon = { ...sample(), contact: '', byline: '', head: st.stHead('', 'The Harbor at Night', '') };
  const html = st.stPdfHtml(anon, '');
  assert.ok(!/Crow|Jo Writer/.test(html));
  assert.match(html, /@top-right \{ content: "Harbor \/ " counter\(page\)/);
  const doc = Object.fromEntries(st.stDocxEntries(anon).map((e) => [e.path, e.content]));
  assert.ok(!/Crow|Jo Writer/.test(doc['word/document.xml'] + doc['word/header1.xml']));
  assert.match(doc['word/document.xml'], /about 4,300 words/, 'the count stays');
  assert.match(doc['word/document.xml'], /w:before="5040"/, 'the title still eleven lines down');
});

// the submission rules from app.js
const sctx = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('// ---- submission rules:'), app.indexOf('// ---- end of submission rules ----')) + ';this.api = { SUB_STATUSES, subOut, subDays, subSummary, subConflicts, subLibraryOrder, subCredit, subFirstAppearance, subChecks, subNamesIn, diffSeq, diffParas, subMarketStats, subOverdue, subLetter };', sctx);
const sb = sctx.api;

test('submissions: what is out, how long, and what the shelf shows', () => {
  assert.deepEqual([...sb.SUB_STATUSES], ['pending', 'shortlisted', 'rejected-form', 'rejected-personal', 'accepted', 'withdrawn']);
  assert.ok(sb.subOut({ status: 'pending' }) && sb.subOut({ status: 'shortlisted' }));
  assert.ok(!sb.subOut({ status: 'rejected-form' }) && !sb.subOut({ status: 'withdrawn' }));
  assert.equal(sb.subDays('2026-09-01', '2026-10-05'), 34);
  assert.equal(sb.subDays('2026-10-05', '2026-10-01'), 0, 'never negative');
  assert.equal(sb.subDays('', '2026-10-01'), 0);
  const list = [{ status: 'pending' }, { status: 'shortlisted' }, { status: 'accepted' }, { status: 'rejected-personal' }];
  assert.deepEqual({ ...sb.subSummary(list) }, { out: 2, accepted: 1 });
});

test('submissions: sending again while out names the markets that make it a problem', () => {
  const out = [{ market: 'A', status: 'pending', simultaneous: true }, { market: 'B', status: 'pending', simultaneous: false }, { market: 'C', status: 'rejected-form', simultaneous: false }];
  assert.deepEqual(sb.subConflicts(out, true).map((s) => s.market), ['B'], 'B takes no simultaneous submissions');
  assert.deepEqual(sb.subConflicts(out, false).map((s) => s.market), ['A', 'B'], 'the new market takes none');
  assert.deepEqual([...sb.subConflicts([{ status: 'withdrawn' }], false)], [], 'nothing out, nothing to say');
});

test('submissions: the library lists the longest out first, then the answers newest first', () => {
  const rows = [
    { sub: { market: 'A', status: 'pending', sent: '2026-09-20' } },
    { sub: { market: 'B', status: 'pending', sent: '2026-06-01' } },
    { sub: { market: 'C', status: 'rejected-form', sent: '2026-05-01', responded: '2026-07-01' } },
    { sub: { market: 'D', status: 'accepted', sent: '2026-04-01', responded: '2026-09-01' } }
  ];
  const { out, back } = sb.subLibraryOrder(rows, '2026-10-05');
  assert.deepEqual(out.map((r) => r.sub.market), ['B', 'A']);
  assert.deepEqual(back.map((r) => r.sub.market), ['D', 'C']);
});

test('a collection credits where each story first appeared', () => {
  const c = sb.subCredit('The Harbor at Night', 'Asimov’s & Co.', 'March 2026');
  assert.equal(c.text, '“The Harbor at Night” first appeared in Asimov’s & Co., March 2026.');
  assert.equal(c.html, '“The Harbor at Night” first appeared in <i>Asimov’s &amp; Co.</i>, March 2026.');
  assert.equal(sb.subCredit('Rapture', 'Lightspeed', '').text, '“Rapture” is forthcoming in Lightspeed.');
  const list = [
    { market: 'A', status: 'accepted', sent: '2026-01-01', responded: '2026-02-01', published: '2026-09-01' },
    { market: 'B', status: 'accepted', sent: '2025-05-01', responded: '2025-06-01', published: '2026-03-01' },
    { market: 'C', status: 'rejected-form', sent: '2024-01-01' }
  ];
  assert.equal(sb.subFirstAppearance(list).market, 'B', 'the earliest published');
  assert.equal(sb.subFirstAppearance([{ market: 'D', status: 'accepted', sent: '2026-05-01', responded: '2026-06-01' }]).market, 'D', 'sold, not out yet');
  assert.equal(sb.subFirstAppearance([{ status: 'pending' }]), null);
});

test('the pre-send check names what would be embarrassing to send', () => {
  const ok = { title: 'Rapture', contact: 'Jo', byline: 'Jo', flags: 0, ghosts: 0, words: 4000, goal: 5000, limit: 0, anonymous: false, text: '', names: [] };
  assert.deepEqual([...sb.subChecks(ok)], [], 'a clean manuscript passes');
  const codes = (i) => [...sb.subChecks(i).map((c) => c.code)];
  assert.deepEqual(codes({ ...ok, title: '', contact: ' ', byline: '' }), ['title', 'contact', 'byline']);
  assert.deepEqual(codes({ ...ok, flags: 2, ghosts: 1 }), ['placeholders', 'outline']);
  assert.deepEqual(codes({ ...ok, words: 5200 }), ['goal']);
  assert.deepEqual(codes({ ...ok, words: 5200, limit: 5000, market: 'X' }), ['limit'], 'a market\'s limit says it, not the goal too');
  assert.deepEqual(codes({ ...ok, anonymous: true, contact: '', byline: '' }), [], 'anonymous: no contact or byline wanted');
  const found = sb.subChecks({ ...ok, anonymous: true, text: 'Then Andress came in.', names: ['Jason Andress', 'J. A. Crow'] });
  assert.deepEqual([...found.map((c) => c.code)], ['name']);
  assert.deepEqual([...found[0].names], ['Andress']);
});

test('names in an anonymous story: the whole name in any case, a surname capitalized', () => {
  assert.deepEqual([...sb.subNamesIn('signed jason andress below', ['Jason Andress'])], ['jason andress']);
  assert.deepEqual([...sb.subNamesIn('A crow sat on the wire.', ['J. A. Crow'])], [], 'the bird is not the writer');
  assert.deepEqual([...sb.subNamesIn('Old Crow drank alone.', ['J. A. Crow'])], ['Crow']);
  assert.deepEqual([...sb.subNamesIn('Crowley left.', ['J. A. Crow'])], [], 'part of another word');
  assert.deepEqual([...sb.subNamesIn('Cher sang.', ['Cher'])], ['Cher'], 'a one-word name');
});

test('comparing versions: paragraphs the same, gone, new, and changed word by word', () => {
  assert.deepEqual([...sb.diffSeq(['a', 'b', 'c'], ['a', 'c', 'd']).map((o) => o.op)], ['same', 'del', 'same', 'add']);
  const d = sb.diffParas(['One.', 'The cat sat.', 'Gone.', 'End.'], ['One.', 'The dog sat.', 'End.', 'New line here.']);
  assert.deepEqual([...d.paras.map((p) => p.kind)], ['same', 'change', 'del', 'same', 'add']);
  assert.equal(d.added, 1 + 3, 'dog, and the new paragraph\'s three words');
  assert.equal(d.removed, 1 + 1, 'cat, and Gone.');
  assert.equal(d.changed, 3);
  assert.equal(sb.diffParas(['Same.'], ['Same.']).changed, 0);
});

test('markets: what the writer\'s own history says, and what is taking longer than usual', () => {
  const subsAll = [
    { market: 'Lightspeed', status: 'rejected-form', sent: '2026-01-01', responded: '2026-01-31' },
    { market: 'lightspeed ', status: 'rejected-personal', sent: '2026-03-01', responded: '2026-03-21' },
    { market: 'Lightspeed', status: 'pending', sent: '2026-08-01' },
    { market: 'Asimov’s', status: 'accepted', sent: '2026-02-01', responded: '2026-05-01' }
  ];
  const st = sb.subMarketStats(subsAll, '2026-10-05');
  assert.deepEqual({ ...st.lightspeed }, { sent: 3, out: 1, accepted: 0, personal: 1, form: 1, answered: 2, days: 50, avgDays: 25 });
  assert.equal(st['asimov’s'].accepted, 1);
  assert.ok(sb.subOverdue(subsAll[2], null, st.lightspeed, '2026-10-05'), '65 days against an average of 25');
  assert.ok(!sb.subOverdue(subsAll[2], { usual: 90 }, st.lightspeed, '2026-10-05'), 'the market says 90');
  assert.ok(!sb.subOverdue({ market: 'New', status: 'pending', sent: '2026-01-01' }, null, { answered: 1, avgDays: 5 }, '2026-10-05'), 'one answer is not enough to go on');
});

test('a cover letter: the ask, the credits as a list, the sign-off', () => {
  const l = sb.subLetter({ editor: 'Ms. Rivera', market: 'Lightspeed', title: 'Rapture', category: 'short story', words: 'about 4,300 words', credits: ['Asimov’s', 'Clarkesworld', 'F&SF'], bio: '', name: 'Jo Writer', email: 'jo@example.com' });
  assert.match(l, /^Dear Ms\. Rivera,\n\nPlease consider my short story “Rapture” \(about 4,300 words\) for Lightspeed\./);
  assert.match(l, /My fiction has appeared in Asimov’s, Clarkesworld, and F&SF\./);
  assert.match(l, /Best,\nJo Writer\njo@example\.com$/);
  const bare = sb.subLetter({ market: 'X', title: 'T', category: '', words: '900 words', credits: [], name: 'Jo' });
  assert.match(bare, /^Dear Editors,/);
  assert.ok(!/appeared/.test(bare));
  assert.match(sb.subLetter({ market: 'X', title: 'T', words: 'w', credits: ['A', 'B'], name: 'Jo' }), /appeared in A and B\./);
});
