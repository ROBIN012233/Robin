'use strict';

const MAX_CHARS = 8000;

/** Split text into numbered paragraphs, keeping paragraph identity stable. */
function splitParagraphs(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  let parts = normalized.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    // A pasted document often uses single newlines. Treat short lines as
    // paragraphs, but keep genuinely wrapped prose together.
    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((line) => line.length < 400)) parts = lines;
  }
  return parts.map((value, index) => ({ p: index + 1, text: value }));
}

function splitLongParagraph(value, maxChars) {
  if (value.length <= maxChars) return [value];
  const pieces = [];
  let rest = value;
  while (rest.length > maxChars) {
    let cut = -1;
    const window = rest.slice(0, maxChars);
    const match = window.match(/[.!?。！？]["')\]]?\s+(?=[A-Z\u4e00-\u9fff])/g);
    if (match && match.length) {
      const last = match[match.length - 1];
      cut = window.lastIndexOf(last) + last.length;
    }
    if (cut < maxChars * 0.45) {
      const lastSpace = window.lastIndexOf(' ');
      cut = lastSpace > maxChars * 0.45 ? lastSpace : maxChars;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces.filter(Boolean);
}

/**
 * Build chunks <= MAX_CHARS. Each segment has:
 *   i: unique segment id
 *   p: original paragraph number
 *   part: part number within that paragraph
 */
function buildChunks(paragraphs, maxChars = MAX_CHARS) {
  const segments = [];
  let current = [];
  let currentChars = 0;

  const pushChunk = () => {
    if (current.length) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
  };
  const chunks = [];

  for (const para of paragraphs) {
    const pieces = splitLongParagraph(para.text, maxChars);
    pieces.forEach((piece, index) => {
      const segment = {
        i: segments.length,
        p: para.p,
        part: index + 1,
        text: piece
      };
      const cost = piece.length + 80;
      if (currentChars + cost > maxChars && current.length) pushChunk();
      current.push(segment);
      currentChars += cost;
      segments.push(segment);
    });
  }
  pushChunk();
  return { segments, chunks };
}

/** Group translated segments back into their original paragraph. */
function groupByParagraph(segments, valueKey) {
  const map = new Map();
  for (const segment of segments) {
    const text = String(segment[valueKey] || '').trim();
    if (!map.has(segment.p)) map.set(segment.p, []);
    if (text) map.get(segment.p).push(text);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, parts]) => ({ p, text: parts.join(' ') }));
}

function buildOutline(paragraphs, translatedByP) {
  const outline = [];
  const looksLikeHeading = (text) => {
    const first = text.split('\n')[0].trim();
    if (/^#{1,6}\s+\S/.test(first)) return { level: first.match(/^#+/)[0].length, title: first.replace(/^#+\s+/, '') };
    if (/^\d+(\.\d+)*[.)]?\s+[A-Z\u4e00-\u9fff]/.test(first) && first.length <= 110) {
      return { level: 2, title: first };
    }
    if (first.length <= 72 && !/[.!?。！？;；,，]$/.test(first) && /^[A-Z0-9\u4e00-\u9fff]/.test(first)) {
      return { level: 2, title: first };
    }
    return null;
  };

  let level = 2;
  for (const para of paragraphs) {
    const head = looksLikeHeading(para.text);
    if (head) {
      level = Math.min(5, Math.max(2, head.level));
      outline.push({
        id: `p-${para.p}`,
        p: para.p,
        level,
        kind: 'heading',
        title: head.title.slice(0, 120)
      });
    } else {
      const translated = translatedByP.get(para.p) || '';
      const firstSentence = (translated || para.text).split(/(?<=[.!?。！？])\s+/)[0] || para.text;
      outline.push({
        id: `p-${para.p}`,
        p: para.p,
        level: Math.min(5, level + 1),
        kind: 'paragraph',
        title: `第 ${para.p} 段 · ${firstSentence.slice(0, 70)}${firstSentence.length > 70 ? '…' : ''}`
      });
    }
  }
  return outline;
}

function excerpt(text, length = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? clean.slice(0, length) + '…' : clean;
}

function countWords(text) {
  const matches = String(text || '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return matches ? matches.length : 0;
}

module.exports = {
  MAX_CHARS,
  splitParagraphs,
  buildChunks,
  splitLongParagraph,
  groupByParagraph,
  buildOutline,
  excerpt,
  countWords
};
