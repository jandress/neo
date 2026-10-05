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
