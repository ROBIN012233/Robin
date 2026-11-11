'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const userData = fs.mkdtempSync(path.join(process.cwd(), '.tmp-lumen-ai-'));
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => userData,
        getName: () => 'Lumen English',
        getVersion: () => '1.0.0',
        getAppPath: () => process.cwd(),
        isPackaged: false
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function assert(condition, message) {
  if (!condition) throw new Error('ASSERT: ' + message);
}

(async () => {
  const db = require('../src/main/db');
  const writing = require('../src/main/writing-service');
  const translation = require('../src/main/translation-service');
  db.initialize();

  const essay = `Digital tools are useful, but they can make students lazy. Some people believe that access to the internet improves learning. Others argue that it weakens independent thinking. In my opinion, the answer depends on how the tools are used. A student who copies an answer without reading the reasoning learns very little. A student who uses the same tool to compare explanations and test an idea can learn a great deal. Teachers should therefore design tasks that require reflection rather than simple retrieval. The tool itself is neither good nor bad; the habit around it matters.`;

  const started = Date.now();
  const result = await writing.reviewWriting({
    text: essay,
    topic: 'technology',
    prompt: 'Discuss whether digital tools weaken independent thinking.'
  });
  console.log('writing result', {
    ok: result.ok,
    offline: result.offline,
    comparisons: result.record?.result?.comparison?.length,
    sampleTitle: result.record?.result?.sample?.title,
    ms: Date.now() - started,
    error: result.error?.message
  });
  assert(result.ok, 'writing review returns ok');
  assert(result.offline, 'interface unavailable falls back');
  assert(result.record.result.sample.essay.length > 100, 'fallback essay present');
  assert(result.record.result.sample.review.length >= 4, 'fallback review present');
  assert(result.record.result.comparison.length >= 3, 'at least 3 comparisons');
  assert(result.record.result.comparison.every((item) => item.userQuote && item.sampleQuote), 'each comparison quotes both sides');

  const failedTranslation = await translation.runTranslation({
    title: 'offline test',
    text: 'The transformer architecture uses attention. It allows a model to weigh different parts of an input sequence.\n\nThis second paragraph gives the translation pipeline more than one segment to align.',
    tags: ['test']
  }, () => {});
  console.log('translation result', failedTranslation.ok, failedTranslation.error?.code, failedTranslation.error?.message);
  assert(failedTranslation.ok === false, 'translation fails cleanly when AI is unavailable');

  console.log('AI FALLBACK TESTS PASSED');
  db.close();
  Module._load = originalLoad;
  fs.rmSync(userData, { recursive: true, force: true });
})().catch((error) => {
  console.error('AI FALLBACK TEST FAILED', error);
  process.exitCode = 1;
});
