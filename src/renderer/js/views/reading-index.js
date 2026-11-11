import {
  createRecommendedView,
  createBrowserView,
  createReadingHistoryView
} from './reading.js';

export const readingViews = {
  recommended: createRecommendedView,
  browser: createBrowserView,
  history: createReadingHistoryView
};
