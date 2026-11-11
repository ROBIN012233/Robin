import { createPracticeView } from './cet-practice.js';
import { createDictionaryView } from './cet-dictionary.js';
import { createWordbookView } from './cet-wordbook.js';
import { createReviewView } from './cet-review.js';
import { createWritingView } from './cet-writing.js';

export const cetViews = {
  practice: createPracticeView,
  dictionary: () => createDictionaryView(),
  wordbook: () => createWordbookView(),
  review: () => createReviewView(),
  writing: () => createWritingView()
};
