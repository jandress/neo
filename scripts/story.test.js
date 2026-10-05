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
  stHeader, stLinesFromHeight, stPageAt };`, context);
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
