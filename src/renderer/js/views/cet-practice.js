import { el, icon, countWords, formatDate, emitDataChanged, onDataChanged } from '../utils.js';
import { pageHeader, toast, emptyState, tagList } from '../ui.js';
import { FilterBar } from '../filter-bar.js';
import { VirtualList } from '../virtual-list.js';
import { renderSampleSection } from '../components/writing-result.js';
import api from '../api.js';
import { state } from '../state.js';

const DOMAIN_LABEL = { writing: '写作', reading: '阅读', translation: '翻译' };

export function createPracticeView(ctx) {
  const page = el('div', { class: 'module-page practice-page' });
  const filterHost = el('div');
  const shell = el('div', { class: 'practice-shell' });
  const listPanel = el('div', { class: 'practice-list-panel' });
  const listWrap = el('div', { class: 'practice-list' });
  const detail = el('div', { class: 'practice-detail' });
  listPanel.appendChild(listWrap);
  shell.append(listPanel, detail);

  const tabs = el('div', { class: 'segmented' });
  for (const [domain, label] of Object.entries(DOMAIN_LABEL)) {
    const button = el('button', { type: 'button', text: label, dataset: { domain } });
    button.addEventListener('click', () => switchDomain(domain));
    tabs.appendChild(button);
  }

  let domain = 'writing';
  let items = [];
  let selectedId = null;
  const selectedByDomain = {};
  const answersByItem = new Map();
  const submittedIds = new Set();
  const filters = {};
  const essayCache = new Map();

  const vlist = new VirtualList({
    rowHeight: 78,
    empty: emptyState({ iconName: 'exam', title: '没有匹配的练习', sub: '换一个标签或搜索词试试。' }),
    renderRow: (item) => {
      const button = el('button', {
        class: selectedByDomain[domain] === item.id ? 'active' : '',
        type: 'button'
      }, [
        el('div', { class: 'practice-item-title', text: item.title }),
        el('div', { class: 'practice-item-meta' }, [
          el('span', { class: 'badge', text: DOMAIN_LABEL[item.domain] || item.domain }),
          ...(item.tags || []).slice(0, 2).map((tag) => el('span', { class: 'tag', text: tag }))
        ])
      ]);
      button.addEventListener('click', () => {
        selectedByDomain[domain] = item.id;
        selectedId = item.id;
        renderList();
        renderDetail(item);
      });
      return el('div', { class: 'practice-item' }, [button]);
    }
  });
  listWrap.appendChild(vlist.el);

  function getFilter(nextDomain = domain) {
    if (!filters[nextDomain]) {
      filters[nextDomain] = new FilterBar({
        listId: `practice:${nextDomain}`,
        kind: 'contents',
        placeholder: '搜索练习…',
        onQuery: () => load(nextDomain)
      });
    }
    return filters[nextDomain];
  }

  function renderList() {
    vlist.setItems(items);
  }

  async function load(nextDomain = domain) {
    const filter = getFilter(nextDomain);
    const query = filter.getState();
    try {
      const [rows, tags] = await Promise.all([
        api.contents.list({ type: 'practice', domain: nextDomain, ...query }),
        api.contents.tagCounts({ type: 'practice', domain: nextDomain })
      ]);
      filter.setTagOptions(tags);
      if (nextDomain !== domain) return;
      items = rows;
      renderList();
      const chosen = selectedByDomain[domain];
      if (chosen && rows.some((row) => row.id === chosen)) {
        selectedId = chosen;
        renderDetail(rows.find((row) => row.id === chosen));
      } else if (rows.length) {
        selectedByDomain[domain] = rows[0].id;
        selectedId = rows[0].id;
        renderDetail(rows[0]);
        renderList();
      } else {
        selectedId = null;
        detail.innerHTML = '';
        detail.appendChild(emptyState({ iconName: 'exam', title: '此题型暂无练习', sub: '内置练习为空时会显示在这里。' }));
      }
    } catch (error) {
      toast(error.message || '读取练习失败', { type: 'error' });
    }
  }

  function switchDomain(nextDomain) {
    if (!DOMAIN_LABEL[nextDomain]) return;
    domain = nextDomain;
    for (const button of tabs.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.domain === domain);
    }
    filterHost.innerHTML = '';
    filterHost.appendChild(getFilter(domain).el);
    load(domain);
  }

  async function getEssay(topic) {
    if (!topic) return null;
    if (essayCache.has(topic)) return essayCache.get(topic);
    try {
      const rows = await api.contents.list({ type: 'essay', domain: topic, sort: 'title' });
      const row = rows[0] || null;
      essayCache.set(topic, row);
      return row;
    } catch {
      return null;
    }
  }

  function renderWritingDetail(item) {
    const meta = item.meta || {};
    const answer = el('textarea', {
      class: 'textarea',
      style: { minHeight: '200px' },
      placeholder: 'Write your essay here…'
    });
    const meter = el('span', { class: 'word-count', text: '0 words' });
    answer.addEventListener('input', () => { meter.textContent = `${countWords(answer.value)} words`; });
    const submit = el('button', { class: 'btn primary', type: 'button' }, [icon('spark'), el('span', { text: '提交批改' })]);
    const analysis = el('div', { class: 'stack-sm' });

    submit.addEventListener('click', () => {
      if (countWords(answer.value) < 30) {
        toast('作文至少需要 30 个英文词', { type: 'warn' });
        answer.focus();
        return;
      }
      state.pendingWriting = {
        text: answer.value,
        topic: meta.essayTopic || 'education',
        prompt: meta.prompt || item.title,
        autoSubmit: true
      };
      ctx.router.showSubpage('cet', 'writing');
    });

    const showAnalysis = el('button', { class: 'btn', type: 'button' }, [icon('book'), el('span', { text: '直接看解析' })]);
    showAnalysis.addEventListener('click', async () => {
      if (analysis.dataset.loaded === '1') {
        analysis.hidden = !analysis.hidden;
        return;
      }
      analysis.dataset.loaded = '1';
      analysis.innerHTML = '';
      const essay = await getEssay(meta.essayTopic);
      if (!essay) {
        analysis.appendChild(el('p', { class: 'tiny faint', text: '未找到对应的内置范文。' }));
        return;
      }
      analysis.appendChild(renderSampleSection({
        title: essay.title,
        essay: essay.body,
        review: essay.meta?.review || []
      }, { heading: `范文解析 · ${essay.meta?.label || ''}` }));
      analysis.hidden = false;
    });

    detail.append(
      el('div', { class: 'practice-kicker', text: 'WRITING · 写作' }),
      el('h3', { class: 'practice-title', text: item.title }),
      el('div', { class: 'practice-prompt', text: meta.prompt || '' }),
      meta.requirements?.length ? el('div', { class: 'requirements' }, [
        el('b', { text: '要求' }),
        el('ul', {}, meta.requirements.map((requirement) => el('li', { text: requirement })))
      ]) : null,
      el('div', { class: 'answer-area' }, [
        el('div', { class: 'field-label' }, [el('span', { text: '作答区' }), meter]),
        answer,
        el('div', { class: 'answer-tools' }, [
          el('span', { class: 'tiny faint', text: '提交后跳转到写作批改；也可以先查看内置范文。' }),
          el('div', { class: 'actions' }, [showAnalysis, submit])
        ])
      ]),
      analysis
    );
  }

  function renderReadingDetail(item) {
    const meta = item.meta || {};
    const stateKey = item.id;
    if (!answersByItem.has(stateKey)) answersByItem.set(stateKey, {});
    const answers = answersByItem.get(stateKey);
    const submitted = submittedIds.has(stateKey);

    const questionNodes = [];
    const questionWrap = el('div');
    for (const [index, question] of (meta.questions || []).entries()) {
      const block = el('div', { class: 'question-block' });
      block.appendChild(el('div', { class: 'question-text', text: `${index + 1}. ${question.q}` }));
      const options = el('div', { class: 'option-list' });
      for (const [optionIndex, optionText] of (question.options || []).entries()) {
        const input = el('input', {
          type: 'radio',
          name: `q-${item.id}-${index}`,
          value: String(optionIndex),
          checked: answers[index] === optionIndex
        });
        input.addEventListener('change', () => {
          answers[index] = optionIndex;
          if (submitted) evaluateReading();
        });
        const label = el('label', { class: 'option' }, [
          input,
          el('span', { class: 'option-mark', text: String.fromCharCode(65 + optionIndex) }),
          el('span', { class: 'grow', text: optionText })
        ]);
        label.dataset.option = String(optionIndex);
        options.appendChild(label);
      }
      block.appendChild(options);
      const explanation = el('div', { class: 'explanation', hidden: true, text: question.explanation || '' });
      block.appendChild(explanation);
      questionNodes.push({ block, options, explanation, question });
      questionWrap.appendChild(block);
    }

    const score = el('span', { class: 'badge accent', hidden: !submitted, text: '' });
    const submit = el('button', { class: 'btn primary', type: 'button' }, [icon('check'), el('span', { text: '提交答案' })]);

    function evaluateReading() {
      let correct = 0;
      for (const [index, entry] of questionNodes.entries()) {
        const user = answers[index];
        const isCorrect = user === entry.question.answer;
        if (isCorrect) correct += 1;
        entry.explanation.hidden = false;
        for (const option of entry.options.querySelectorAll('.option')) {
          option.classList.remove('correct', 'wrong');
          const optionIndex = Number(option.dataset.option);
          if (optionIndex === entry.question.answer) option.classList.add('correct');
          else if (optionIndex === user) option.classList.add('wrong');
        }
      }
      score.hidden = false;
      score.textContent = `得分 ${correct} / ${questionNodes.length}`;
    }

    submit.addEventListener('click', () => {
      if (Object.keys(answers).length < (meta.questions || []).length) {
        toast('请先回答全部题目', { type: 'warn' });
        return;
      }
      submittedIds.add(stateKey);
      evaluateReading();
    });

    detail.append(
      el('div', { class: 'practice-kicker', text: 'READING · 阅读' }),
      el('h3', { class: 'practice-title', text: item.title }),
      el('div', { class: 'practice-prompt', text: meta.prompt || '阅读短文，完成后面的选择题。' }),
      el('div', { class: 'passage', text: item.body || '' }),
      el('div', { class: 'section-title', style: { marginTop: '20px' }, text: '选择题' }),
      questionWrap,
      el('div', { class: 'answer-tools' }, [
        score,
        el('div', { class: 'actions' }, [submit])
      ])
    );
    if (submitted) evaluateReading();
  }

  function renderTranslationDetail(item) {
    const meta = item.meta || {};
    const answer = el('textarea', {
      class: 'textarea',
      style: { minHeight: '150px' },
      placeholder: 'Translate the paragraph into English…'
    });
    const output = el('div', { class: 'stack-sm', hidden: true });
    const submit = el('button', { class: 'btn primary', type: 'button' }, [icon('check'), el('span', { text: '提交并查看参考' })]);
    submit.addEventListener('click', () => {
      if (!answer.value.trim()) {
        toast('请先写下你的译文', { type: 'warn' });
        return;
      }
      output.hidden = false;
      output.innerHTML = '';
      output.append(
        el('div', { class: 'reference-block' }, [
          el('span', { class: 'label', text: 'Reference translation' }),
          el('div', { class: 'reference-en', text: meta.reference || '暂无参考译文。' })
        ]),
        meta.scoringPoints?.length ? el('div', { class: 'panel tight' }, [
          el('div', { class: 'section-title', text: '采分点' }),
          el('ul', { class: 'scoring-list' }, meta.scoringPoints.map((point) => el('li', { text: point })))
        ]) : null
      );
    });

    detail.append(
      el('div', { class: 'practice-kicker', text: 'TRANSLATION · 翻译' }),
      el('h3', { class: 'practice-title', text: item.title }),
      el('div', { class: 'practice-prompt', text: meta.prompt || '将下面这段中文翻译成英文。' }),
      el('div', { class: 'passage', text: item.body || '' }),
      el('div', { class: 'answer-area' }, [
        el('div', { class: 'field-label' }, [el('span', { text: '你的译文' })]),
        answer,
        el('div', { class: 'answer-tools' }, [
          el('span', { class: 'tiny faint', text: '提交后可展开参考译文与采分点。' }),
          el('div', { class: 'actions' }, [submit])
        ])
      ]),
      output
    );
  }

  function renderDetail(item) {
    detail.innerHTML = '';
    if (!item) return;
    if (item.domain === 'reading') renderReadingDetail(item);
    else if (item.domain === 'translation') renderTranslationDetail(item);
    else renderWritingDetail(item);
    detail.scrollTop = 0;
  }

  function updateTabs() {
    for (const button of tabs.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.domain === domain);
    }
  }

  page.append(
    pageHeader({
      kicker: 'PRACTICE',
      title: '对点练习',
      sub: '内置写作 6 题、阅读 6 篇、翻译 6 段；打开即用，不需要先添加内容。',
      actions: [el('span', { class: 'badge good', text: '内置题目已就绪' })]
    }),
    el('div', { class: 'practice-toolbar' }, [tabs, el('div', { class: 'grow' })]),
    filterHost,
    shell
  );

  updateTabs();
  filterHost.appendChild(getFilter(domain).el);
  load(domain);

  const listener = onDataChanged(() => load(domain));
  page._cleanup = () => listener();
  return { el: page };
}
