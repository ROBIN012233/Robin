import { el } from '../utils.js';
import { notice } from '../ui.js';

export function renderSampleSection(sample, { heading = '范文案例' } = {}) {
  const review = sample?.review || [];
  const essay = sample?.essay || sample?.body || '';
  const section = el('section', { class: 'sample-section' }, [
    el('div', { class: 'sample-kicker', text: `${heading} · MODEL` }),
    el('h4', { class: 'sample-title', text: sample?.title || '参考范文' }),
    el('div', { class: 'sample-essay', text: essay || '范文暂不可用。' })
  ]);

  if (review.length) {
    const list = el('div', { class: 'review-paragraphs' });
    for (const item of review) {
      const parts = [
        el('div', { class: 'p-label', text: `第 ${item.paragraph || '—'} 段 · 结构与表达` }),
        item.structure ? el('p', { text: item.structure }) : null
      ];
      if (item.highlights?.length || item.transferable?.length) {
        const sentences = el('div', { class: 'sentence-list' });
        for (const text of item.highlights || []) sentences.appendChild(el('code', { text }));
        for (const text of item.transferable || []) sentences.appendChild(el('code', { text: `可迁移：${text}` }));
        parts.push(sentences);
      }
      list.appendChild(el('div', { class: 'review-paragraph' }, parts));
    }
    section.appendChild(el('div', { class: 'section-title', style: { marginTop: '18px' }, text: '范文点评' }));
    section.appendChild(list);
  }
  return section;
}

export function renderWritingResult(result) {
  const feedback = result?.feedback || { grammar: [], structure: [], wording: [] };
  const dimensions = [
    { key: 'grammar', label: '语法 · Grammar' },
    { key: 'structure', label: '结构 · Structure' },
    { key: 'wording', label: '用词 · Wording' }
  ];

  const root = el('div', { class: 'writing-result' });
  if (result?.offline) {
    root.appendChild(notice(
      result?.error?.message || '接口未连接，语法、结构、用词反馈暂不可用；下方内置范文案例照常展示。',
      'warn'
    ));
  }

  const columns = el('div', { class: 'feedback-columns', style: { marginTop: result?.offline ? '14px' : '0' } });
  for (const dimension of dimensions) {
    const items = feedback[dimension.key] || [];
    const column = el('div', { class: 'feedback-column' }, [
      el('h4', { text: dimension.label })
    ]);
    if (!items.length) {
      column.appendChild(el('p', { class: 'tiny faint', text: result?.offline ? '接口未连接，暂无本维度反馈。' : '本维度未返回可引用原文的建议。' }));
    } else {
      for (const item of items) {
        column.appendChild(el('div', { class: 'feedback-item' }, [
          el('span', { class: 'quote', text: `“${item.quote}”` }),
          el('span', { text: item.comment }),
          item.suggestion ? el('span', { class: 'suggestion', text: `建议：${item.suggestion}` }) : null
        ]));
      }
    }
    columns.appendChild(column);
  }
  root.appendChild(columns);

  if (result?.sample) {
    root.appendChild(renderSampleSection(result.sample, { heading: '参考范文' }));
  }

  const comparisons = result?.comparison || [];
  const compareBlock = el('section', { class: 'sample-section', style: { marginTop: '16px' } }, [
    el('div', { class: 'sample-kicker', text: '对照分析 · CONTRAST' }),
    el('h4', { class: 'sample-title', text: '你的原文与范文的差异' }),
    el('p', { class: 'tiny faint', style: { marginTop: '5px' }, text: `共 ${comparisons.length} 条具体差异，每条同时引用双方原文。` })
  ]);
  const list = el('div', { class: 'comparison-list' });
  if (!comparisons.length) {
    list.appendChild(el('p', { class: 'tiny faint', text: '暂无对照分析。' }));
  } else {
    for (const item of comparisons) {
      list.appendChild(el('div', { class: 'comparison-item' }, [
        el('div', { class: 'comparison-head' }, [
          el('span', { class: 'badge accent', text: item.aspect || '差异' })
        ]),
        el('div', { class: 'compare-pair' }, [
          el('div', { class: 'compare-cell' }, [
            el('b', { text: '你的原文' }),
            el('span', { text: item.userQuote })
          ]),
          el('div', { class: 'compare-cell' }, [
            el('b', { text: '范文' }),
            el('span', { text: item.sampleQuote })
          ])
        ]),
        el('p', { text: item.comment })
      ]));
    }
  }
  compareBlock.appendChild(list);
  root.appendChild(compareBlock);
  return root;
}
