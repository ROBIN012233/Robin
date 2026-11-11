'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const userData = fs.mkdtempSync(path.join(process.cwd(), '.tmp-lumen-db-'));
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => userData,
        getVersion: () => '1.0.0',
        isPackaged: false
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

const db = require('../src/main/db');
const contents = require('../src/main/db/contents');
const records = require('../src/main/db/records');
const words = require('../src/main/db/words');
const { seedAll } = require('../src/main/db/seed');

db.initialize();

const counts = contents.counts();
console.log('counts', JSON.stringify(counts));
assert(counts.reading === 30, '30 reading items');
assert(counts.practice === 18, '18 practice items');
assert(counts.essay === 6, '6 essay samples');
assert(counts.word === 0, 'wordbook starts empty');
assert(counts.term === 0, 'terms start empty');

for (const direction of ['exam', 'daily', 'research']) {
  const rows = contents.listContents({ type: 'reading', domain: direction, sort: 'newest' });
  assert(rows.length === 10, `${direction} has 10 reading items`);
  console.log(direction, rows.length, rows[0].title);
}
for (const domain of ['writing', 'reading', 'translation']) {
  const rows = contents.listContents({ type: 'practice', domain });
  assert(rows.length === 6, `${domain} has 6 practice items`);
}
const essays = contents.listContents({ type: 'essay' });
assert(essays.length === 6, '6 essays');
assert(essays.every((essay) => Array.isArray(essay.meta.review) && essay.meta.review.length >= 4), 'essay reviews present');

const search = contents.listContents({ type: 'reading', search: 'attention' });
console.log('fts search attention:', search.map((row) => row.title));
assert(search.length >= 1, 'FTS search works');

const tagFiltered = contents.listContents({ type: 'reading', tags: ['考试', '原创'], search: '' });
assert(tagFiltered.length >= 5, 'tag intersection works');
console.log('exam original tags:', tagFiltered.length);

const wordResult = words.addWord({
  word: 'resilient',
  meaning: 'able to recover quickly',
  phonetic: '/rɪˈzɪliənt/',
  origin: '词典',
  tags: ['测试']
});
assert(wordResult.created, 'word created');
assert(words.reviewList().length === 0, 'new word is scheduled for tomorrow');
const wordsList = contents.listContents({ type: 'word', search: 'resilient' });
assert(wordsList.length === 1, 'word searchable');
assert(wordsList[0].tags.includes('词典'), 'origin tag added');

const mastered = words.setMastered(wordResult.word.id, true);
assert(mastered.meta.mastered === true, 'mastered flag');
words.setMastered(wordResult.word.id, false);

const term = contents.createContent({
  type: 'term',
  title: 'attention mechanism',
  body: '注意力机制',
  domain: '计算机',
  tags: ['翻译提取'],
  sourceType: 'ai'
});
assert(contents.listContents({ type: 'term', search: 'attention' }).length === 1, 'term searchable');

const translation = records.saveTranslation({
  title: 'test',
  sourceText: 'This is a source paragraph.',
  segments: [{ p: 1, source: 'This is a source paragraph.', zh: '这是一个来源段落。', back: 'This is a source paragraph.' }],
  outline: [{ p: 1, id: 'p-1', level: 2, kind: 'paragraph', title: '第 1 段' }],
  terms: [{ en: 'test', zh: '测试', domain: '通用' }],
  tags: ['翻译', '测试']
});
assert(translation.id, 'translation record saved');
const history = records.listRecords('translation', { search: 'source' });
assert(history.length === 1, 'translation search');
assert(history[0].tags.includes('测试'), 'record tags');

const reading = records.saveReadingHistory({
  title: 'History test',
  source: 'Lumen',
  direction: 'exam',
  body: 'Paragraph one.\n\nParagraph two.',
  tags: ['考试']
});
records.incrementReadingWords(reading.id);
const readingRecord = records.getRecord('reading', reading.id);
assert(readingRecord.word_count === 1, 'reading word count increments');

const writing = records.saveWritingReview({
  title: 'Writing test',
  topic: 'education',
  originalText: 'This is a student essay with enough words to be stored.',
  result: { offline: true, comparison: [] },
  offline: true
});
assert(writing.id, 'writing record saved');
const writingList = records.listRecords('writing');
assert(writingList.length === 1, 'writing list');

contents.setHidden('read-exam-01', true);
assert(contents.listContents({ type: 'reading', domain: 'exam' }).length === 9, 'hidden builtin excluded');
contents.restoreBuiltinPresets();
assert(contents.listContents({ type: 'reading', domain: 'exam' }).length === 10, 'hidden restored');

const fts = db.getDb().prepare("SELECT COUNT(*) AS c FROM contents_fts WHERE contents_fts MATCH 'attention'").get();
assert(fts.c >= 1, 'FTS index rows');
console.log('translation tags', history[0].tags);
console.log('writing count', records.counts());
console.log('DB path', db.getPath());
console.log('ALL DB TESTS PASSED');

db.close();
Module._load = originalLoad;
fs.rmSync(userData, { recursive: true, force: true });
