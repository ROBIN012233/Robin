import { el, icon, normalizeTagsInput, setBusy, directionLabel } from '../utils.js';
import { openModal, toast, notice } from '../ui.js';
import api from '../api.js';
import { state } from '../state.js';

const STATUS_LABEL = {
  pending: '等待',
  running: '抓取中',
  done: '已完成',
  failed: '失败'
};

export function openBatchPanel() {
  const listInput = el('textarea', {
    class: 'textarea',
    style: { minHeight: '130px' },
    placeholder: '每行一个 URL，最多 200 条\nhttps://example.com/article-1\nhttps://example.com/article-2',
    attrs: { spellcheck: 'false' }
  });
  const tagInput = el('input', { class: 'input', placeholder: '附加标签，逗号分隔（可选）' });
  const controls = el('div', { class: 'actions' });
  const progressFill = el('div', { class: 'progress-fill' });
  const progressLabel = el('span', { class: 'tiny faint' });
  const stats = el('div', { class: 'batch-stats' });
  const jobsBox = el('div', { class: 'batch-jobs' });
  const statusNotice = el('div');

  const body = el('div', { class: 'stack-sm' }, [
    notice(`当前方向：${directionLabel(state.direction)}。后台串行抓取，并发上限 2，每次请求间隔 1.5–3 秒；单批上限 200 条。成功条目立即入库。`),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: 'URL 列表' }), el('span', { class: 'hint', text: '仅支持 http / https' })]),
      listInput
    ]),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: '附加标签' })]),
      tagInput
    ]),
    controls,
    statusNotice,
    el('div', { class: 'progress-track' }, [progressFill]),
    el('div', { class: 'spread' }, [progressLabel, el('span', { class: 'tiny faint', text: '离开面板后任务仍会继续' })]),
    stats,
    jobsBox
  ]);

  let unsubscribe = null;

  const render = (snapshot) => {
    if (!snapshot) return;
    const running = ['running', 'paused'].includes(snapshot.state);
    const percent = snapshot.total ? Math.round((snapshot.completed / snapshot.total) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressFill.classList.toggle('indeterminate', snapshot.state === 'running' && snapshot.total === 0);
    progressLabel.textContent = snapshot.total
      ? `${snapshot.completed} / ${snapshot.total} · ${percent}%`
      : '等待开始';
    listInput.disabled = running;
    tagInput.disabled = running;

    stats.innerHTML = '';
    for (const [label, value] of [
      ['总数', snapshot.total],
      ['成功', snapshot.succeeded],
      ['失败', snapshot.failed],
      ['进行中', snapshot.active]
    ]) {
      stats.appendChild(el('div', { class: 'batch-stat' }, [
        el('b', { text: String(value) }),
        el('span', { text: label })
      ]));
    }

    jobsBox.innerHTML = '';
    for (const job of snapshot.jobs || []) {
      const row = el('div', { class: 'batch-job' }, [
        el('span', { class: 'url', text: job.url, title: job.url }),
        el('span', { class: `status ${job.status}`, text: job.error ? `${STATUS_LABEL[job.status]} · ${job.error}` : STATUS_LABEL[job.status] })
      ]);
      if (job.status === 'failed') {
        const retry = el('button', { class: 'btn ghost sm', type: 'button', text: '重试' });
        retry.addEventListener('click', async () => {
          setBusy(retry, true, '');
          try {
            const next = await api.batch.retry(job.index);
            render(next);
          } catch (error) {
            toast(error.message, { type: 'error' });
          } finally {
            setBusy(retry, false);
          }
        });
        row.appendChild(retry);
      }
      jobsBox.appendChild(row);
    }

    controls.innerHTML = '';
    if (!running) {
      const start = el('button', { class: 'btn primary', type: 'button' }, [icon('download'), el('span', { text: snapshot.total ? '开始新一批' : '开始导入' })]);
      start.addEventListener('click', async () => {
        const urls = listInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!urls.length) {
          toast('请先粘贴至少一个 URL', { type: 'warn' });
          return;
        }
        setBusy(start, true, '启动中…');
        try {
          const next = await api.batch.start({
            urls,
            direction: state.direction,
            tags: normalizeTagsInput(tagInput.value)
          });
          render(next);
          toast('批量导入已开始', { type: 'success' });
        } catch (error) {
          toast(error.message, { type: 'error' });
        } finally {
          setBusy(start, false);
        }
      });
      controls.appendChild(start);
    }
    if (snapshot.state === 'running') {
      const pause = el('button', { class: 'btn', type: 'button' }, [icon('pause'), el('span', { text: '暂停' })]);
      pause.addEventListener('click', async () => render(await api.batch.pause()));
      controls.appendChild(pause);
    }
    if (snapshot.state === 'paused') {
      const resume = el('button', { class: 'btn primary', type: 'button' }, [icon('play'), el('span', { text: '继续' })]);
      resume.addEventListener('click', async () => render(await api.batch.resume()));
      controls.appendChild(resume);
    }
    if (running || snapshot.state === 'cancelled') {
      const cancel = el('button', { class: 'btn danger', type: 'button' }, [icon('close'), el('span', { text: '取消' })]);
      cancel.disabled = snapshot.state === 'cancelled';
      cancel.addEventListener('click', async () => {
        const next = await api.batch.cancel();
        render(next);
        toast('已取消批量导入', { type: 'warn' });
      });
      controls.appendChild(cancel);
    }
    if (snapshot.failed > 0 && snapshot.state !== 'running') {
      const retryAll = el('button', { class: 'btn soft', type: 'button' }, [icon('refresh'), el('span', { text: '重试全部失败' })]);
      retryAll.addEventListener('click', async () => {
        try {
          const next = await api.batch.retryAll();
          render(next);
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      });
      controls.appendChild(retryAll);
    }

    statusNotice.innerHTML = '';
    if (snapshot.state === 'paused') statusNotice.appendChild(notice('任务已暂停；进行中的请求会完成，暂停期间不会开启新请求。', 'warn'));
    if (snapshot.state === 'cancelled') statusNotice.appendChild(notice('任务已取消。失败列表仍可单独重试。', 'warn'));
    if (snapshot.state === 'done' && snapshot.failed > 0) statusNotice.appendChild(notice(`导入完成，有 ${snapshot.failed} 条失败，可在下方单独重试。`, 'warn'));
    if (snapshot.state === 'done' && snapshot.failed === 0 && snapshot.total) statusNotice.appendChild(notice('全部完成，内容已写入阅读集合。', ''));
  };

  api.batch.state().then((snapshot) => {
    render(snapshot);
    if (snapshot.total) {
      listInput.value = (snapshot.jobs || []).map((job) => job.url).join('\n');
      tagInput.value = (snapshot.tags || []).join(', ');
    }
  }).catch((error) => toast(error.message, { type: 'error' }));

  openModal({
    title: '批量导入网页',
    subtitle: '串行队列会逐条抓取、提取正文并立即入库。',
    body,
    wide: true,
    actions: [{ label: '关闭面板', value: null, primary: true }],
    onMount: () => {
      unsubscribe = api.batch.onProgress(render);
    },
    onClose: () => {
      if (unsubscribe) unsubscribe();
    }
  });

  return { body };
}
