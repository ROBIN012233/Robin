import { el, formatDate } from '../utils.js';
import { pageHeader, tagList } from '../ui.js';

/**
 * Shared dual-column result renderer used by "新建翻译" and "翻译历史".
 */
export function renderTranslationResult(record, { onBack, backLabel = '返回历史', title = '翻译结果' } = {}) {
  const pairs = record.segments || [];
  const outline = record.outline || [];
  const terms = record.terms || [];

  const root = el('div', { class: 'translation-doc' });

  const outlinePanel = el('aside', { class: 'outline-panel panel' }, [
    el('div', { class: 'outline-title', text: '大纲 · Outline' })
  ]);
  if (!outline.length) {
    outlinePanel.appendChild(el('p', { class: 'tiny faint', text: '未检测到章节标题。' }));
  } else {
    for (const node of outline) {
      const button = el('button', {
        class: `outline-node level-${node.level || 2} kind-${node.kind || 'paragraph'}`,
        type: 'button',
        text: node.title
      });
      button.addEventListener('click', () => {
        const target = document.getElementById(`tr-p-${node.p}`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('flash');
        void target.offsetWidth;
        target.classList.add('flash');
        outlinePanel.querySelectorAll('.outline-node').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
      });
      outlinePanel.appendChild(button);
    }
  }

  const head = el('div', { class: 'result-meta' }, [
    el('div', { class: 'grow' }, [
      el('h3', { class: 'result-title', text: record.title || title }),
      el('div', { class: 'result-meta-line' }, [
        el('span', { text: `保存于 ${formatDate(record.created_at)}` }),
        el('span', { class: 'meta-dot' }),
        el('span', { text: `${pairs.length} 段` }),
        el('span', { class: 'meta-dot' }),
        el('span', { text: `${terms.length} 条术语` })
      ]),
      record.tags?.length ? el('div', { style: { marginTop: '9px' } }, tagList(record.tags, 8)) : null
    ]),
    el('div', { class: 'actions' }, [
      el('button', {
        class: 'btn sm', type: 'button', onclick: onBack
      }, [el('span', { text: backLabel })])
    ])
  ]);

  const columnHead = el('div', { class: 'pair-head' }, [
    el('span', { text: '#' }),
    el('span', { text: '中文译文' }),
    el('span', { text: '英文回译' })
  ]);

  const pairList = el('div', { class: 'pair-list' });
  for (const pair of pairs) {
    pairList.appendChild(el('div', { class: 'pair-row', id: `tr-p-${pair.p}` }, [
      el('div', { class: 'pair-num', text: String(pair.p).padStart(2, '0') }),
      el('div', { class: 'pair-cell zh', text: pair.zh || '—' }),
      el('div', { class: 'pair-cell back', text: pair.back || '—' })
    ]));
  }

  const glossary = el('details', { class: 'glossary-inline panel tight' }, [
    el('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--ink-soft)' }, text: `术语表 · ${terms.length} 条（作为本次翻译的锁定参考）` })
  ]);
  if (terms.length) {
    const grid = el('div', { class: 'term-grid', style: { marginTop: '12px' } });
    for (const term of terms.slice(0, 120)) {
      grid.appendChild(el('div', { class: 'term-mini' }, [
        el('b', { text: term.en }),
        el('span', { text: `${term.zh}${term.domain ? ' · ' + term.domain : ''}` })
      ]));
    }
    glossary.appendChild(grid);
  } else {
    glossary.appendChild(el('p', { class: 'tiny faint', style: { marginTop: '8px' }, text: '本次未提取到术语。' }));
  }

  root.append(head, columnHead, pairList, glossary);
  const layout = el('div', { class: 'result-layout' }, [outlinePanel, root]);
  return {
    el: el('div', {}, [
      pageHeader({
        kicker: `${title} · 三层校验`,
        title: '翻译结果',
        sub: '左列为中文译文，右列为英文回译；段落编号与原文一致。点击大纲可定位段落。'
      }),
      layout
    ]),
    outlinePanel
  };
}
