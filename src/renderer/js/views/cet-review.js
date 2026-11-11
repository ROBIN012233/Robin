import { el, icon, formatDate, emitDataChanged } from '../utils.js';
import { pageHeader, toast, emptyState } from '../ui.js';
import api from '../api.js';

export function createReviewView() {
  const page = el('div', { class: 'module-page' });
  const dueCount = el('div', { class: 'review-due-count', text: '0' });
  const dueLabel = el('div', { class: 'tiny faint', text: '今日到期' });
  const dueBadge = el('span', { class: 'badge accent', text: '—' });
  const grid = el('div', { class: 'review-grid' });
  const container = el('div');

  const summary = el('div', { class: 'panel tight', style: { display: 'flex', alignItems: 'center', gap: '24px' } }, [
    el('div', {}, [dueCount, dueLabel]),
    el('div', { class: 'grow' }, [
      el('div', { class: 'section-title', style: { marginBottom: '4px' }, text: '简化艾宾浩斯复习' }),
      el('p', { class: 'tiny muted', text: '间隔 1 / 2 / 4 / 7 / 15 天。答“记住了”进入下一阶段，答“忘记了”回到第一阶段；连续完成五个阶段后移出生词本复习队列。' }),
      el('div', { style: { marginTop: '8px' } }, [dueBadge])
    ]),
    el('button', { class: 'btn sm', type: 'button', onclick: load }, [icon('refresh'), el('span', { text: '刷新' })])
  ]);

  container.append(
    pageHeader({
      kicker: 'REVIEW',
      title: '复习队列',
      sub: '每天只取出今日到期的生词，避免一次堆积全部词汇。'
    }),
    summary,
    grid
  );
  page.appendChild(container);

  async function grade(item, remembered, button) {
    button.disabled = true;
    try {
      const result = await api.review.grade(item.id, remembered);
      if (result.mastered) {
        toast(`“${item.title}” 已完成五个阶段，标记为已掌握`, { type: 'success' });
      } else {
        toast(remembered ? `记住了 · 下次复习 ${formatDate(result.nextDue, false)}` : '忘记了 · 明天重新复习', {
          type: remembered ? 'success' : 'warn'
        });
      }
      emitDataChanged({ type: 'word-updated' });
      load();
    } catch (error) {
      button.disabled = false;
      toast(error.message || '操作失败', { type: 'error' });
    }
  }

  async function load() {
    try {
      const rows = await api.review.list();
      dueCount.textContent = String(rows.length);
      dueBadge.textContent = rows.length ? `有 ${rows.length} 个生词等待复习` : '今天已经清空';
      dueBadge.className = `badge ${rows.length ? 'accent' : 'good'}`;
      grid.innerHTML = '';
      if (!rows.length) {
        grid.appendChild(emptyState({
          iconName: 'check',
          title: '今天没有到期的生词',
          sub: '新加入的生词会在第二天进入队列。也可以回到生词本标记掌握状态。'
        }));
        return;
      }
      for (const item of rows) {
        const stageDots = el('div', { class: 'review-stage' });
        for (let i = 0; i < 5; i += 1) {
          stageDots.appendChild(el('span', { class: `stage-dot ${i < (item.stage || 0) ? 'on' : ''}`.trim() }));
        }
        const remember = el('button', { class: 'btn sm primary', type: 'button' }, [icon('check'), el('span', { text: '记住了' })]);
        const forget = el('button', { class: 'btn sm', type: 'button' }, [icon('refresh'), el('span', { text: '忘记了' })]);
        remember.addEventListener('click', () => grade(item, true, remember));
        forget.addEventListener('click', () => grade(item, false, forget));
        grid.appendChild(el('div', { class: 'review-card' }, [
          el('div', { class: 'row spread' }, [
            el('div', { class: 'word', text: item.title }),
            el('span', { class: 'badge', text: item.meta?.origin || '词典' })
          ]),
          el('div', { class: 'meaning', text: (item.body || '').replace(/\n+/g, ' · ') }),
          el('div', { class: 'tiny faint', text: `到期：${formatDate(item.due_at, false)}` }),
          stageDots,
          el('div', { class: 'actions' }, [remember, forget])
        ]));
      }
    } catch (error) {
      toast(error.message || '读取复习队列失败', { type: 'error' });
    }
  }

  load();
  return { el: page, onShow: load };
}
