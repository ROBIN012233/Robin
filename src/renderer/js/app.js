import api from './api.js';
import { state } from './state.js';
import { Router } from './router.js';
import { LightSystem } from './light.js';
import { toast } from './ui.js';
import { throttle } from './utils.js';
import { accentFor, coverBackgroundStyle } from './theme.js';
import { translationViews } from './views/translation.js';
import { cetViews } from './views/cet.js';
import { readingViews } from './views/reading-index.js';
import { settingsViews } from './views/settings.js';

const light = new LightSystem(document.getElementById('light-canvas'));

function hexToRgbString(hex) {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return '119, 151, 255';
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
}

function applyAppearance(settings) {
  const appearance = settings.appearance;
  const accent = accentFor(appearance.background);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-rgb', hexToRgbString(accent));
  document.body.dataset.tier = appearance.tier;
  document.body.dataset.effects = appearance.effectsEnabled ? 'on' : 'off';
  const tierLabel = { high: '光感 · 高', medium: '光感 · 中', low: '光感 · 低' }[appearance.tier] || '沉浸光感';
  const meta = document.getElementById('topbar-meta');
  if (meta) meta.textContent = appearance.effectsEnabled ? tierLabel : '光感关闭';

  const cover = document.getElementById('cover-view');
  const coverBg = document.getElementById('cover-bg');
  if (coverBg) {
    coverBg.style.backgroundImage = '';
    coverBg.style.backgroundColor = '';
    Object.assign(coverBg.style, coverBackgroundStyle(appearance.background));
  }
  if (cover) {
    cover.classList.toggle('has-image', appearance.background.type === 'image' && Boolean(appearance.background.imageUrl));
  }

  const brandMark = document.getElementById('brand-mark');
  if (brandMark) {
    if (appearance.customIconUrl) {
      brandMark.classList.add('has-image');
      brandMark.style.backgroundImage = `url("${appearance.customIconUrl}")`;
    } else {
      brandMark.classList.remove('has-image');
      brandMark.style.backgroundImage = '';
    }
  }

  light.setOptions({
    enabled: Boolean(appearance.effectsEnabled),
    tier: appearance.tier,
    accent
  });
}

function bindSpotlight() {
  let frame = null;
  let x = 50;
  let y = 35;
  const update = throttle(() => {
    frame = null;
    document.documentElement.style.setProperty('--mx', `${x}px`);
    document.documentElement.style.setProperty('--my', `${y}px`);
  }, 24);
  window.addEventListener('pointermove', (event) => {
    if (document.body.dataset.effects === 'off') return;
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
}

function bindCover(router) {
  document.getElementById('cover-view').addEventListener('click', (event) => {
    const tile = event.target.closest('[data-module]');
    if (!tile) return;
    router.openModule(tile.dataset.module);
  });
}

async function boot() {
  try {
    const [settings, info] = await Promise.all([api.settings.get(), api.app.info()]);
    state.settings = settings;
    state.appInfo = info;
    if (['exam', 'daily', 'research'].includes(settings.reading?.direction)) {
      state.direction = settings.reading.direction;
    }
    const version = document.getElementById('cover-version');
    if (version) version.textContent = `Lumen English v${info.version}`;
    applyAppearance(settings);
    bindSpotlight();

    const ctx = {
      api,
      state,
      router: null,
      applyAppearance
    };
    const router = new Router({
      factories: {
        translation: translationViews,
        cet: cetViews,
        reading: readingViews,
        settings: settingsViews
      },
      ctx
    });
    ctx.router = router;
    bindCover(router);

    api.updates.onStatus((status) => { state.lastUpdate = status; });
    console.log('[lumen] ready', info.version);
  } catch (error) {
    console.error('[lumen] boot failed', error);
    toast('应用启动失败：' + (error.message || error), { type: 'error', duration: 10000 });
  }
}

window.addEventListener('error', (event) => {
  if (!event?.message) return;
  console.error(event.error || event.message);
  toast('界面发生错误：' + event.message, { type: 'error' });
});

window.addEventListener('unhandledrejection', (event) => {
  const message = event?.reason?.message || String(event?.reason || '');
  if (!message) return;
  console.error('[unhandled]', event.reason);
  if (!/接口|翻译|网络|fetch|abort/i.test(message)) {
    toast('操作失败：' + message, { type: 'error' });
  }
});

boot();
