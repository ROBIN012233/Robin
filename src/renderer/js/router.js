import { state } from './state.js';
import { el, clear } from './utils.js';
import api from './api.js';

export const MODULES = {
  translation: {
    kicker: 'MODULE A · TRANSLATION',
    heading: '论文翻译',
    subpages: [
      { id: 'new', label: '新建翻译' },
      { id: 'history', label: '翻译历史' },
      { id: 'terms', label: '术语库' }
    ],
    defaultSub: 'new'
  },
  cet: {
    kicker: 'MODULE B · CET',
    heading: '四六级学习',
    subpages: [
      { id: 'practice', label: '对点练习' },
      { id: 'dictionary', label: '词典查词' },
      { id: 'wordbook', label: '生词本' },
      { id: 'review', label: '复习队列' },
      { id: 'writing', label: '写作批改' }
    ],
    defaultSub: 'practice'
  },
  reading: {
    kicker: 'MODULE C · READING',
    heading: '阅读训练',
    subpages: [
      { id: 'recommended', label: '推荐阅读' },
      { id: 'browser', label: '内置浏览器' },
      { id: 'history', label: '阅读历史' }
    ],
    defaultSub: 'recommended'
  },
  settings: {
    kicker: 'PREFERENCES',
    heading: '设置',
    subpages: [
      { id: 'appearance', label: '外观' },
      { id: 'ai', label: 'AI 接口' },
      { id: 'data', label: '数据管理' },
      { id: 'update', label: '更新' },
      { id: 'reading', label: '阅读推荐' }
    ],
    defaultSub: 'appearance'
  }
};

export class Router {
  constructor({ factories, ctx }) {
    this.factories = factories;
    this.ctx = ctx;
    this.cover = document.getElementById('cover-view');
    this.moduleView = document.getElementById('module-view');
    this.moduleContent = document.getElementById('module-content');
    this.secondaryNav = document.getElementById('secondary-nav');
    this.directionTabs = document.getElementById('direction-tabs');
    this.topbarTitle = document.getElementById('topbar-title');
    this.backBtn = document.getElementById('back-btn');
    this.moduleHeading = document.getElementById('module-heading');
    this.moduleKicker = document.getElementById('module-kicker');
    this.animating = false;
    this.bind();
  }

  bind() {
    this.backBtn.addEventListener('click', () => this.backToCover());
    this.directionTabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-direction]');
      if (!button) return;
      this.setDirection(button.dataset.direction);
    });
  }

  async openModule(moduleId) {
    if (!MODULES[moduleId]) return;
    state.currentModule = moduleId;
    if (!state.subpage[moduleId]) state.subpage[moduleId] = MODULES[moduleId].defaultSub;
    this.moduleHeading.textContent = MODULES[moduleId].heading;
    this.moduleKicker.textContent = MODULES[moduleId].kicker;
    this.directionTabs.hidden = moduleId !== 'reading';
    if (moduleId === 'reading') {
      for (const btn of this.directionTabs.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.direction === state.direction);
      }
    }
    this.renderSecondaryNav(moduleId);
    this.cover.classList.remove('is-entering');
    this.moduleView.hidden = false;
    this.moduleView.classList.remove('is-leaving', 'is-entering');
    void this.moduleView.offsetWidth;
    this.cover.classList.add('is-leaving');
    this.moduleView.classList.add('is-entering');
    this.backBtn.hidden = false;
    this.topbarTitle.classList.add('show');

    state.coverVisible = false;
    await this.showSubpage(moduleId, state.subpage[moduleId]);
    window.setTimeout(() => {
      this.cover.hidden = true;
      this.cover.classList.remove('is-leaving');
      this.moduleView.classList.remove('is-entering');
      this.animating = false;
    }, 260);
  }

  async backToCover() {
    if (!state.currentModule) return;
    if (state.activeView?.onHide) {
      try { state.activeView.onHide(); } catch (error) { console.error(error); }
    }
    state.currentModule = null;
    state.coverVisible = true;
    this.setWebviewMode(false);
    this.cover.hidden = false;
    this.cover.classList.remove('is-leaving');
    this.moduleView.classList.remove('is-entering');
    void this.cover.offsetWidth;
    this.moduleView.classList.add('is-leaving');
    this.cover.classList.add('is-entering');
    this.backBtn.hidden = true;
    this.topbarTitle.classList.remove('show');
    this.topbarTitle.textContent = '';
    await new Promise((resolve) => setTimeout(resolve, 260));
    this.moduleView.hidden = true;
    this.moduleView.classList.remove('is-leaving');
    this.cover.classList.remove('is-entering');
  }

  renderSecondaryNav(moduleId) {
    clear(this.secondaryNav);
    for (const sub of MODULES[moduleId].subpages) {
      const button = el('button', {
        type: 'button',
        text: sub.label,
        dataset: { sub: sub.id }
      });
      button.addEventListener('click', () => this.showSubpage(moduleId, sub.id));
      this.secondaryNav.appendChild(button);
    }
    this.updateNavActive(moduleId, state.subpage[moduleId]);
  }

  updateNavActive(moduleId, subId) {
    if (!MODULES[moduleId]) return;
    for (const button of this.secondaryNav.querySelectorAll('button[data-sub]')) {
      button.classList.toggle('active', button.dataset.sub === subId);
    }
    const sub = MODULES[moduleId].subpages.find((item) => item.id === subId);
    const label = sub ? sub.label : '';
    this.topbarTitle.textContent = `${MODULES[moduleId].heading}${label ? ' · ' + label : ''}`;
    if (!state.coverVisible) this.topbarTitle.classList.add('show');
  }

  setWebviewMode(active) {
    document.body.dataset.hasWebview = active ? 'true' : 'false';
    document.body.classList.toggle('has-webview', active);
  }

  async showSubpage(moduleId, subId, { force = false } = {}) {
    if (!MODULES[moduleId]) return;
    if (!MODULES[moduleId].subpages.some((sub) => sub.id === subId)) subId = MODULES[moduleId].defaultSub;
    state.subpage[moduleId] = subId;
    this.updateNavActive(moduleId, subId);
    if (moduleId === 'reading') {
      for (const btn of this.directionTabs.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.direction === state.direction);
      }
    }

    if (state.activeView?.onHide) {
      try { state.activeView.onHide(); } catch (error) { console.error(error); }
    }
    if (state.activeView?.el) {
      state.activeView.savedScrollTop = state.activeView.el.scrollTop;
      state.activeView.el.hidden = true;
    }

    const key = moduleId === 'reading'
      ? `reading:${state.direction}:${subId}`
      : `${moduleId}:${subId}`;

    let view = state.viewCache.get(key);
    if (!view) {
      const factory = this.factories?.[moduleId]?.[subId];
      if (!factory) {
        console.error('Missing view factory', moduleId, subId);
        return;
      }
      view = factory(this.ctx);
      if (!view || !view.el) {
        console.error('View factory returned no element', moduleId, subId);
        return;
      }
      view.el.hidden = true;
      view.key = key;
      state.viewCache.set(key, view);
      this.moduleContent.appendChild(view.el);
    }

    view.el.hidden = false;
    state.activeView = view;
    this.setWebviewMode(Boolean(view.isWebview));
    if (view.onShow) {
      try { await view.onShow(); } catch (error) {
        console.error('[router] onShow failed', error);
      }
    }
    if (Number.isFinite(view.savedScrollTop)) {
      view.el.scrollTop = view.savedScrollTop;
    }
    view.el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 0.8, 0.28, 1)' }
    );
  }

  async setDirection(direction) {
    if (!['exam', 'daily', 'research'].includes(direction) || direction === state.direction) return;
    state.direction = direction;
    if (state.settings) state.settings.reading.direction = direction;
    try {
      await api.settings.update({ reading: { direction } });
    } catch (error) {
      console.error('direction persist failed', error);
    }
    for (const btn of this.directionTabs.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.direction === direction);
    }
    if (state.currentModule === 'reading') {
      await this.showSubpage('reading', state.subpage.reading || 'recommended');
    }
  }

  invalidate(moduleId = null) {
    for (const [key, view] of [...state.viewCache.entries()]) {
      const owner = key.startsWith('reading:') ? 'reading' : key.split(':')[0];
      if (moduleId && owner !== moduleId) continue;
      if (view.destroy) {
        try { view.destroy(); } catch (error) { console.error(error); }
      }
      if (view._cleanup) {
        try { view._cleanup(); } catch (error) { console.error(error); }
      }
      view.el?.remove();
      state.viewCache.delete(key);
    }
    if (state.currentModule) {
      state.activeView = null;
      this.showSubpage(state.currentModule, state.subpage[state.currentModule]);
    }
  }
}
