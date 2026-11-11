import {
  el, icon, formatDate, setBusy, emitDataChanged, onDataChanged, directionLabel
} from '../utils.js';
import { pageHeader, toast, notice, confirmDialog } from '../ui.js';
import { GRADIENTS, SOLID_SWATCHES, coverBackgroundStyle } from '../theme.js';
import api from '../api.js';
import { state } from '../state.js';

function section(title, subtitle, content) {
  return el('section', { class: 'setting-section' }, [
    el('div', { class: 'section-title', text: title }),
    subtitle ? el('p', { class: 'tiny faint', style: { marginBottom: '6px' }, text: subtitle }) : null,
    content
  ]);
}

function settingRow(name, desc, control) {
  return el('div', { class: 'setting-row' }, [
    el('div', { class: 'setting-copy' }, [
      el('div', { class: 'setting-name', text: name }),
      desc ? el('div', { class: 'setting-desc', text: desc }) : null
    ]),
    el('div', { class: 'setting-control' }, control)
  ]);
}

/* ------------------------------------------------------------
   Appearance
   ------------------------------------------------------------ */
export function createAppearanceView(ctx) {
  const page = el('div', { class: 'module-page' });
  const inner = el('div', { class: 'settings-page' });
  page.appendChild(inner);

  async function save(patch) {
    try {
      const settings = await api.settings.update(patch);
      state.settings = settings;
      ctx.applyAppearance(settings);
      render();
    } catch (error) {
      toast(error.message || '保存设置失败', { type: 'error' });
    }
  }

  async function chooseBackground() {
    try {
      const result = await api.settings.chooseBackground();
      if (result.canceled) return;
      state.settings = result.settings;
      ctx.applyAppearance(result.settings);
      render();
      toast('封面背景已更新', { type: 'success' });
    } catch (error) {
      toast(error.message || '选择背景失败', { type: 'error' });
    }
  }

  async function clearBackground() {
    try {
      const settings = await api.settings.clearBackground();
      state.settings = settings;
      ctx.applyAppearance(settings);
      render();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function chooseIcon() {
    try {
      const result = await api.settings.chooseIcon();
      if (result.canceled) return;
      state.settings = result.settings;
      ctx.applyAppearance(result.settings);
      render();
      toast('应用图标已更新', { type: 'success' });
    } catch (error) {
      toast(error.message || '选择图标失败', { type: 'error' });
    }
  }

  async function clearIcon() {
    try {
      const settings = await api.settings.clearIcon();
      state.settings = settings;
      ctx.applyAppearance(settings);
      render();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  function render() {
    const appearance = state.settings.appearance;
    const background = appearance.background;
    inner.innerHTML = '';
    const effectsToggle = el('input', { type: 'checkbox', checked: appearance.effectsEnabled });
    effectsToggle.addEventListener('change', () => {
      save({ appearance: { effectsEnabled: effectsToggle.checked } });
    });

    const tierGrid = el('div', { class: 'tier-grid' });
    for (const [value, label, desc] of [
      ['high', '高', 'blur 40px / 200% · 3 光团 20s · 6800 粒子 · Bloom · 光斑 · DPR 2'],
      ['medium', '中', 'blur 24px / 160% · 2 光团 25s · 2000 粒子 · DPR 1.5'],
      ['low', '低', '无毛玻璃 · 静态渐变 · 300 粒子 · 无光斑 · DPR 1']
    ]) {
      const card = el('button', {
        class: `tier-card ${appearance.tier === value ? 'active' : ''}`.trim(),
        type: 'button'
      }, [el('b', { text: label + '档' }), el('span', { text: desc })]);
      card.addEventListener('click', () => save({ appearance: { tier: value } }));
      tierGrid.appendChild(card);
    }

    const backgroundGrid = el('div', { class: 'background-grid' });
    for (const [type, label] of [['solid', '纯色'], ['gradient', '渐变'], ['image', '本地图片']]) {
      const preview = el('div', { class: 'bg-preview' });
      if (type === 'solid') Object.assign(preview.style, { backgroundColor: background.color || '#101522' });
      if (type === 'gradient') preview.style.backgroundImage = GRADIENTS[background.gradient || 'aurora'].css;
      if (type === 'image') {
        if (background.imageUrl) preview.style.backgroundImage = `url("${background.imageUrl}")`;
        else preview.style.backgroundImage = 'linear-gradient(145deg, #161a26, #0b0d14)';
      }
      const choice = el('button', { class: `bg-choice ${background.type === type ? 'active' : ''}`.trim(), type: 'button' }, [
        preview,
        el('div', { class: 'bg-choice-label' }, [el('span', { text: label }), background.type === type ? icon('check') : null])
      ]);
      choice.addEventListener('click', () => {
        if (type === 'image' && !background.imageUrl) chooseBackground();
        else save({ appearance: { background: { type } } });
      });
      backgroundGrid.appendChild(choice);
    }

    const colorInput = el('input', { class: 'color-input', type: 'color', value: background.color || '#101522' });
    colorInput.addEventListener('change', () => save({ appearance: { background: { type: 'solid', color: colorInput.value } } }));
    const swatches = el('div', { class: 'swatch-row' });
    for (const color of SOLID_SWATCHES) {
      const swatch = el('button', {
        class: `swatch ${background.color === color ? 'active' : ''}`.trim(),
        type: 'button',
        title: color,
        style: { backgroundColor: color }
      });
      swatch.addEventListener('click', () => save({ appearance: { background: { type: 'solid', color } } }));
      swatches.appendChild(swatch);
    }

    const gradientRow = el('div', { class: 'background-grid' });
    for (const [key, preset] of Object.entries(GRADIENTS)) {
      const button = el('button', {
        class: `bg-choice ${background.type === 'gradient' && background.gradient === key ? 'active' : ''}`.trim(),
        type: 'button'
      }, [
        el('div', { class: 'bg-preview', style: { backgroundImage: preset.css } }),
        el('div', { class: 'bg-choice-label' }, [el('span', { text: preset.label }), background.type === 'gradient' && background.gradient === key ? icon('check') : null])
      ]);
      button.addEventListener('click', () => save({ appearance: { background: { type: 'gradient', gradient: key } } }));
      gradientRow.appendChild(button);
    }

    const iconPreview = el('div', { class: 'icon-preview' });
    if (appearance.customIconUrl) iconPreview.style.backgroundImage = `url("${appearance.customIconUrl}")`;
    else iconPreview.textContent = 'L';

    const imageActions = el('div', { class: 'cover-actions' }, [
      el('button', { class: 'btn sm', type: 'button', onclick: chooseBackground }, [icon('upload'), el('span', { text: background.imageUrl ? '更换图片' : '导入图片' })]),
      background.imageUrl ? el('button', { class: 'btn ghost sm', type: 'button', onclick: clearBackground }, [el('span', { text: '移除图片' })]) : null
    ]);
    const iconActions = el('div', { class: 'cover-actions' }, [
      iconPreview,
      el('button', { class: 'btn sm', type: 'button', onclick: chooseIcon }, [icon('upload'), el('span', { text: '导入图标' })]),
      appearance.customIconUrl ? el('button', { class: 'btn ghost sm', type: 'button', onclick: clearIcon }, [el('span', { text: '恢复默认' })]) : null
    ]);

    inner.append(
      pageHeader({
        kicker: 'APPEARANCE',
        title: '外观',
        sub: '背景光层、材质层与内容层分离。切换档位会销毁并重建 WebGL 场景。'
      }),
      section('沉浸光感', '总开关关闭后 WebGL 停止渲染，材质层退化为半透明纯色。', el('div', {}, [
        settingRow('启用沉浸光感', '背景光团、粒子与鼠标光斑的总开关。', el('label', { class: 'toggle' }, [effectsToggle, el('span', { class: 'toggle-track' }), el('span', { class: 'toggle-text', text: appearance.effectsEnabled ? '开启' : '关闭' })])),
        el('div', { class: 'setting-row' }, [
          el('div', { class: 'setting-copy' }, [
            el('div', { class: 'setting-name', text: '光感档位' }),
            el('div', { class: 'setting-desc', text: '同屏毛玻璃元素不超过 6 个；webview 容器始终不透明。' })
          ])
        ]),
        tierGrid
      ])),
      section('封面背景', '纯色、渐变或本地图片。封面主题色会同步到光团。', el('div', { class: 'stack-sm' }, [
        backgroundGrid,
        background.type === 'solid' ? el('div', { class: 'row-wrap', style: { marginTop: '12px' } }, [colorInput, swatches]) : null,
        background.type === 'gradient' ? gradientRow : null,
        imageActions
      ])),
      section('应用图标', '导入后替换窗口与任务栏图标；打包安装程序图标仍由 build/icon.ico 决定。', iconActions)
    );
  }

  render();
  return { el: page, onShow: () => { if (state.settings) render(); } };
}

/* ------------------------------------------------------------
   AI
   ------------------------------------------------------------ */
export function createAiSettingsView() {
  const page = el('div', { class: 'module-page' });
  const inner = el('div', { class: 'settings-page' });
  page.appendChild(inner);
  let testZone = null;

  function render() {
    inner.innerHTML = '';
    const input = el('input', { class: 'input', value: state.settings.ai.baseUrl, placeholder: 'http://127.0.0.1:9655' });
    const saveButton = el('button', { class: 'btn primary', type: 'button' }, [icon('check'), el('span', { text: '保存地址' })]);
    const testButton = el('button', { class: 'btn', type: 'button' }, [icon('spark'), el('span', { text: '连接测试' })]);
    testZone = el('div', { style: { marginTop: '14px' } });

    async function persist() {
      const value = input.value.trim();
      if (!/^https?:\/\//i.test(value)) {
        toast('API Base URL 必须以 http:// 或 https:// 开头', { type: 'warn' });
        return null;
      }
      try {
        const settings = await api.settings.update({ ai: { baseUrl: value } });
        state.settings = settings;
        toast('API 地址已保存', { type: 'success' });
        return settings;
      } catch (error) {
        toast(error.message || '保存失败', { type: 'error' });
        return null;
      }
    }

    saveButton.addEventListener('click', async () => {
      setBusy(saveButton, true, '保存中…');
      await persist();
      setBusy(saveButton, false);
    });

    testButton.addEventListener('click', async () => {
      setBusy(testButton, true, '测试中…');
      testZone.innerHTML = '';
      const saved = await persist();
      if (!saved) {
        setBusy(testButton, false);
        return;
      }
      testZone.appendChild(el('div', { class: 'loading-block' }, [el('span', { class: 'spinner' }), el('span', { text: '请求接口…' })]));
      try {
        const result = await api.ai.test();
        testZone.innerHTML = '';
        testZone.appendChild(notice(
          `${result.message}${result.latency ? ` · ${result.latency} ms` : ''}`,
          result.ok ? '' : 'bad'
        ));
        if (result.ok) toast('接口连接成功', { type: 'success' });
        else toast(result.message || '接口未连接', { type: 'error' });
      } catch (error) {
        testZone.innerHTML = '';
        testZone.appendChild(notice(error.message || '接口未连接', 'bad'));
        toast(error.message || '接口未连接', { type: 'error' });
      } finally {
        setBusy(testButton, false);
      }
    });

    inner.append(
      pageHeader({
        kicker: 'AI ENDPOINT',
        title: 'AI 接口',
        sub: '只实现 OpenAI 兼容调用层；不包含任何网页登录或凭证抓取。'
      }),
      section('接口地址', '默认指向本地服务。请求会发送到 {Base URL}/v1/chat/completions，非流式 JSON 响应，30 秒超时，失败重试 1 次。', el('div', { class: 'stack-sm' }, [
        el('div', { class: 'field' }, [
          el('div', { class: 'field-label' }, [el('span', { text: 'API Base URL' }), el('span', { class: 'hint', text: '默认 http://127.0.0.1:9655' })]),
          input,
          el('div', { class: 'field-hint', text: '如果地址以 /v1 结尾，将直接拼接 /chat/completions；如果已是完整 /chat/completions 则原样使用。' })
        ]),
        el('div', { class: 'actions' }, [saveButton, testButton]),
        testZone
      ])),
      section('降级策略', '接口不可用时，按钮会显示“接口未连接”一类提示；凡是带内置兜底数据的页面（练习、范文、阅读）照常显示。', el('div', { class: 'notice' }, [
        icon('shield'),
        el('div', { class: 'grow', text: '翻译、写作批改会明确提示失败；阅读与练习不依赖接口。生词词典使用外部词典接口，不经过 AI。' })
      ]))
    );
  }

  render();
  return { el: page, onShow: render };
}

/* ------------------------------------------------------------
   Data
   ------------------------------------------------------------ */
export function createDataView() {
  const page = el('div', { class: 'module-page' });
  const inner = el('div', { class: 'settings-page' });
  page.appendChild(inner);

  async function reload() {
    try {
      const [counts, recordCounts] = await Promise.all([
        api.contents.counts(),
        api.records.counts()
      ]);
      render(counts, recordCounts);
    } catch (error) {
      toast(error.message || '读取统计失败', { type: 'error' });
    }
  }

  async function clearWords() {
    if (!(await confirmDialog({ title: '清空生词本', message: '将删除全部生词与复习记录，且不可恢复。是否继续？', confirmLabel: '清空', danger: true }))) return;
    try {
      await api.contents.clearWords();
      toast('生词本已清空', { type: 'success' });
      emitDataChanged({ type: 'word-deleted' });
      reload();
    } catch (error) {
      toast(error.message || '清空失败', { type: 'error' });
    }
  }

  async function clearHistory(kind, label) {
    if (!(await confirmDialog({ title: `清空${label}`, message: `将删除全部${label}，且不可恢复。是否继续？`, confirmLabel: '清空', danger: true }))) return;
    try {
      await api.records.clear(kind);
      toast(`${label}已清空`, { type: 'success' });
      emitDataChanged({ type: `${kind}-cleared` });
      reload();
    } catch (error) {
      toast(error.message || '清空失败', { type: 'error' });
    }
  }

  async function exportWords() {
    try {
      const result = await api.data.exportWords();
      if (result.canceled) return;
      toast(`已导出 ${result.count} 个生词：${result.path}`, { type: 'success', duration: 6000 });
    } catch (error) {
      toast(error.message || '导出失败', { type: 'error' });
    }
  }

  async function restoreBuiltins() {
    if (!(await confirmDialog({ title: '恢复内置预置数据', message: '将重新写入或更新内置阅读、练习与范文，并取消所有内置条目的隐藏状态。用户自己的内容不会被删除。', confirmLabel: '恢复' }))) return;
    try {
      await api.contents.restoreBuiltins();
      toast('内置预置数据已恢复', { type: 'success' });
      emitDataChanged({ type: 'builtins-restored' });
      reload();
    } catch (error) {
      toast(error.message || '恢复失败', { type: 'error' });
    }
  }

  function render(counts, recordCounts) {
    inner.innerHTML = '';
    const table = el('div', { class: 'data-table' });
    const rows = [
      ['推荐阅读条目', counts.reading, null],
      ['生词本', counts.word, ['导出', exportWords], ['清空', clearWords, true]],
      ['对点练习', counts.practice, null],
      ['术语库', counts.term, null],
      ['范文库', counts.essay, null],
      ['翻译历史', recordCounts.translation, ['清空', () => clearHistory('translation', '翻译历史'), true]],
      ['阅读历史', recordCounts.reading, ['清空', () => clearHistory('reading', '阅读历史'), true]],
      ['写作批改记录', recordCounts.writing, ['清空', () => clearHistory('writing', '写作批改记录'), true]]
    ];
    for (const [label, count, ...actionDefs] of rows) {
      const actions = el('div', { class: 'data-actions' });
      for (const action of actionDefs) {
        if (!action) continue;
        const [text, handler, danger] = action;
        const button = el('button', { class: `btn sm ${danger ? 'danger' : ''}`.trim(), type: 'button', text });
        button.addEventListener('click', handler);
        actions.appendChild(button);
      }
      table.appendChild(el('div', { class: 'data-row' }, [
        el('div', { class: 'data-label', text: label }),
        el('div', { class: 'data-count', text: String(count ?? 0) }),
        actions
      ]));
    }

    const hiddenCount = el('span', { class: 'badge', text: `${counts.hiddenBuiltin} 条隐藏` });
    inner.append(
      pageHeader({
        kicker: 'DATA',
        title: '数据管理',
        sub: '所有内容存于本地 SQLite；配置项和排序偏好保存在 electron-store，不存内容集合。'
      }),
      section('内容统计', '数据库文件位于用户数据目录。', el('div', { class: 'panel tight' }, [table])),
      section('恢复与维护', '恢复内置预置数据是幂等的：只更新内置 ID，不删除用户内容。', el('div', { class: 'stack-sm' }, [
        el('div', { class: 'spread' }, [
          el('div', {}, [
            el('div', { class: 'setting-name', text: '内置预置数据' }),
            el('div', { class: 'setting-desc', text: `阅读 30 条、写作/阅读/翻译练习各 6 题、范文 6 类。当前隐藏：${counts.hiddenBuiltin} 条。` })
          ]),
          el('div', { class: 'actions' }, [hiddenCount, el('button', { class: 'btn soft', type: 'button', text: '恢复内置预置数据', onclick: restoreBuiltins })])
        ]),
        notice('生词本导出支持 JSON 与 CSV；导出不会清空数据。')
      ])),
      section('数据库位置', '仅展示，便于备份。', el('div', { class: 'panel tight' }, [
        el('div', { class: 'path mono tiny', style: { wordBreak: 'break-all', color: 'var(--muted)' }, text: state.appInfo?.dbPath || '—' })
      ]))
    );
  }

  reload();
  return { el: page, onShow: reload };
}

/* ------------------------------------------------------------
   Updates
   ------------------------------------------------------------ */
export function createUpdateView() {
  const page = el('div', { class: 'module-page' });
  const inner = el('div', { class: 'settings-page' });
  page.appendChild(inner);
  let current = null;
  let unsubscribe = null;

  function applyStatus(status) {
    if (!status) return;
    current = { ...(current || {}), ...status };
    state.lastUpdate = current;
    render();
  }

  async function load() {
    try {
      current = await api.updates.state();
      state.lastUpdate = current;
      render();
    } catch (error) {
      toast(error.message || '读取更新状态失败', { type: 'error' });
    }
  }

  async function toggleAuto(checked) {
    try {
      const settings = await api.settings.update({ updates: { auto: checked } });
      state.settings = settings;
      load();
    } catch (error) {
      toast(error.message || '保存失败', { type: 'error' });
    }
  }

  async function check() {
    try {
      await api.updates.check();
      load();
    } catch (error) {
      toast(error.message || '检查更新失败', { type: 'error' });
    }
  }

  async function installOnQuit() {
    try {
      const result = await api.updates.installOnQuit();
      toast(result.message || '已设置退出时安装', { type: 'success' });
    } catch (error) {
      toast(error.message || '设置失败', { type: 'error' });
    }
  }

  function render() {
    if (!current) return;
    inner.innerHTML = '';
    const autoToggle = el('input', { type: 'checkbox', checked: Boolean(current.auto) });
    autoToggle.addEventListener('change', () => toggleAuto(autoToggle.checked));
    const checkButton = el('button', { class: 'btn primary', type: 'button' }, [icon('refresh'), el('span', { text: '检查更新' })]);
    checkButton.addEventListener('click', async () => {
      setBusy(checkButton, true, '检查中…');
      await check();
      setBusy(checkButton, false);
    });
    const type = current.type || 'idle';
    const progress = el('div', { class: 'progress-track', style: { marginTop: '12px' } }, [
      el('div', { class: 'progress-fill', style: { width: `${Number(current.percent) || 0}%` } })
    ]);
    if (type === 'checking') progress.querySelector('.progress-fill').classList.add('indeterminate');

    inner.append(
      pageHeader({
        kicker: 'UPDATES',
        title: '更新',
        sub: '启动 30 秒后首次检查，此后每 4 小时检查一次；新版本静默下载，退出时安装。'
      }),
      section('当前版本', '', el('div', { class: 'update-status' }, [
        el('div', { class: 'icon-wrap' }, icon('terminal')),
        el('div', { class: 'grow' }, [
          el('div', { class: 'update-version', text: `Lumen English v${current.currentVersion || state.appInfo?.version || '1.0.0'}` }),
          el('div', { class: 'update-message', text: current.message || '尚未检查更新' }),
          type === 'download-progress' ? progress : null
        ]),
        el('div', { class: 'actions' }, [
          current.isPackaged ? null : el('span', { class: 'badge warn', text: '开发模式' }),
          checkButton
        ])
      ])),
      section('自动更新', '由 electron-updater 提供；不会在下载完成后强制退出。', el('div', {}, [
        settingRow('自动检查并静默下载', '默认开启。关闭后仍可手动检查。', el('label', { class: 'toggle' }, [autoToggle, el('span', { class: 'toggle-track' }), el('span', { class: 'toggle-text', text: current.auto ? '开启' : '关闭' })])),
        settingRow('安装时机', '下载完成后只通知“新版本已就绪”，退出应用时自动安装。', el('button', { class: 'btn sm', type: 'button', text: '退出时安装', onclick: installOnQuit }))
      ])),
      section('检查记录', '', el('div', { class: 'panel tight' }, [
        el('div', { class: 'data-row' }, [
          el('div', { class: 'data-label', text: '上次检查时间' }),
          el('div', { class: 'tiny muted', text: current.lastCheckAt ? formatDate(current.lastCheckAt) : '—' })
        ]),
        el('div', { class: 'data-row' }, [
          el('div', { class: 'data-label', text: '上次结果' }),
          el('div', { class: 'tiny muted', text: current.lastResult || '—' })
        ]),
        type === 'error' ? notice(current.message || '更新检查失败', 'bad') : null,
        type === 'downloaded' ? notice(current.message || '新版本已下载，退出时安装。') : null,
        type === 'dev' ? notice('开发模式不会连接更新服务器；打包后的安装版本才会执行自动更新。', 'warn') : null
      ]))
    );
  }

  if (unsubscribe) unsubscribe();
  unsubscribe = api.updates.onStatus(applyStatus);
  load();
  return {
    el: page,
    onShow: load,
    _cleanup: () => { if (unsubscribe) unsubscribe(); }
  };
}

/* ------------------------------------------------------------
   Reading recommendations management
   ------------------------------------------------------------ */
export function createReadingSettingsView() {
  const page = el('div', { class: 'module-page' });
  const inner = el('div', { class: 'settings-page' });
  page.appendChild(inner);

  async function load() {
    try {
      const rows = await api.contents.list({ type: 'reading', sort: 'newest', includeHidden: true });
      const user = rows.filter((row) => row.source_type === 'user' || row.source_type === 'web');
      const hidden = rows.filter((row) => row.hidden && row.source_type === 'builtin');
      render(user, hidden);
    } catch (error) {
      toast(error.message || '读取阅读条目失败', { type: 'error' });
    }
  }

  async function removeUser(item) {
    if (!(await confirmDialog({ title: '删除用户条目', message: `确认删除「${item.title}」？`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.contents.remove(item.id);
      toast('已删除条目', { type: 'success' });
      emitDataChanged({ type: 'reading-deleted' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function restore(item) {
    try {
      await api.contents.setHidden(item.id, false);
      toast('已恢复内置条目', { type: 'success' });
      emitDataChanged({ type: 'reading-restored' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function restoreAll() {
    if (!hiddenItems.length) {
      toast('没有被隐藏的内置条目', { type: 'warn' });
      return;
    }
    try {
      for (const item of hiddenItems) await api.contents.setHidden(item.id, false);
      toast('已恢复全部内置条目', { type: 'success' });
      emitDataChanged({ type: 'reading-restored' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  let hiddenItems = [];

  function render(user, hidden) {
    hiddenItems = hidden;
    inner.innerHTML = '';
    const userList = el('div', { class: 'manage-list' });
    if (!user.length) {
      userList.appendChild(el('p', { class: 'tiny faint', text: '还没有用户添加的阅读条目。' }));
    }
    for (const item of user) {
      userList.appendChild(el('div', { class: 'manage-row' }, [
        el('span', { class: 'badge accent', text: directionLabel(item.domain) }),
        el('span', { class: 'title', text: item.title, title: item.title }),
        el('button', { class: 'btn ghost sm icon-only', type: 'button', title: '删除', onclick: () => removeUser(item) }, icon('trash'))
      ]));
    }

    const hiddenList = el('div', { class: 'hidden-list' });
    if (!hidden.length) {
      hiddenList.appendChild(el('p', { class: 'tiny faint', text: '没有被隐藏的内置条目。' }));
    }
    for (const item of hidden) {
      hiddenList.appendChild(el('div', { class: 'hidden-item' }, [
        el('span', { class: 'grow ellipsis', text: item.title }),
        el('button', { class: 'btn sm', type: 'button', text: '恢复', onclick: () => restore(item) })
      ]));
    }

    inner.append(
      pageHeader({
        kicker: 'READING SOURCES',
        title: '阅读推荐',
        sub: '管理用户添加的条目，并恢复被隐藏的内置条目。'
      }),
      section(`用户条目 · ${user.length}`, '用户添加或网页导入的阅读条目。', el('div', { class: 'panel tight' }, [userList])),
      section(`被隐藏的内置条目 · ${hidden.length}`, '', el('div', { class: 'stack-sm' }, [
        hiddenList,
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn soft', type: 'button', text: '恢复全部内置条目', onclick: restoreAll })
        ])
      ]))
    );
  }

  load();
  return { el: page, onShow: load };
}

export const settingsViews = {
  appearance: createAppearanceView,
  ai: createAiSettingsView,
  data: createDataView,
  update: createUpdateView,
  reading: createReadingSettingsView
};
