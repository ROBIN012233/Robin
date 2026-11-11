'use strict';

const DEFAULT_MODEL = process.env.LUMEN_AI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 30000;

class AIError extends Error {
  constructor(message, { code = 'AI_ERROR', status = null, detail = '' } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function endpointFor(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new AIError('API 地址无效', { code: 'AI_BAD_URL' });
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function modelsEndpointFor(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) {
    base = base.replace(/\/chat\/completions$/i, '');
  }
  if (/\/v1$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

function normalizeError(error) {
  if (error instanceof AIError) return error;
  if (error?.name === 'AbortError') {
    return new AIError('接口响应超时（30 秒）', { code: 'AI_TIMEOUT' });
  }
  if (error?.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/i.test(error?.message || '')) {
    return new AIError('接口未连接：请检查 API Base URL 与本地服务是否已启动', { code: 'AI_UNREACHABLE' });
  }
  return new AIError(error?.message || '接口请求失败', { code: 'AI_ERROR' });
}

function stripJsonFence(text) {
  let value = String(text || '').trim();
  if (!value) return value;
  const fence = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) value = fence[1].trim();
  return value;
}

function parseJson(text) {
  const value = stripJsonFence(text);
  try { return JSON.parse(value); } catch { /* try enclosed JSON */ }
  const firstObject = value.indexOf('{');
  const firstArray = value.indexOf('[');
  let start = -1;
  if (firstObject === -1) start = firstArray;
  else if (firstArray === -1) start = firstObject;
  else start = Math.min(firstObject, firstArray);
  if (start === -1) return null;

  const opener = value[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(value.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

class AIClient {
  constructor(getBaseUrl) {
    this.getBaseUrl = getBaseUrl;
    this.modelCache = new Map();
  }

  async getModel(baseUrl) {
    if (this.modelCache.has(baseUrl)) return this.modelCache.get(baseUrl);
    let model = DEFAULT_MODEL;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(modelsEndpointFor(baseUrl), { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        const first = Array.isArray(data?.data) && data.data[0];
        if (first?.id) model = first.id;
      }
    } catch { /* models endpoint is optional */ }
    this.modelCache.set(baseUrl, model);
    return model;
  }

  async rawChat({ baseUrl, model, messages, temperature, maxTokens }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(endpointFor(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false
        })
      });
      const raw = await response.text();
      if (!response.ok) {
        let detail = raw.slice(0, 600);
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.error?.message || parsed?.message || detail;
        } catch { /* keep text */ }
        throw new AIError(`接口返回 ${response.status}: ${String(detail).slice(0, 240)}`, {
          code: response.status === 401 || response.status === 403 ? 'AI_AUTH' : 'AI_HTTP',
          status: response.status,
          detail
        });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AIError('接口返回的不是 JSON 响应', { code: 'AI_BAD_RESPONSE', detail: raw.slice(0, 600) });
      }
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AIError('接口返回内容为空', { code: 'AI_EMPTY' });
      }
      return { content, body, model };
    } finally {
      clearTimeout(timer);
    }
  }

  async chat({ messages, temperature = 0.2, maxTokens = 2000 }) {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new AIError('尚未设置 API Base URL', { code: 'AI_NO_BASE_URL' });
    const model = await this.getModel(baseUrl);
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.rawChat({ baseUrl, model, messages, temperature, maxTokens });
      } catch (error) {
        lastError = normalizeError(error);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  async json({ system, user, temperature = 0.2, maxTokens = 2200 }) {
    const result = await this.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      maxTokens
    });
    const parsed = parseJson(result.content);
    if (parsed === null) {
      throw new AIError('无法解析接口返回的 JSON', { code: 'AI_PARSE', detail: result.content.slice(0, 800) });
    }
    return { data: parsed, raw: result.content, model: result.model };
  }

  async test() {
    const started = Date.now();
    try {
      const result = await this.chat({
        messages: [
          { role: 'system', content: 'You are a connectivity test. Reply with exactly OK.' },
          { role: 'user', content: 'ping' }
        ],
        temperature: 0,
        maxTokens: 8
      });
      return {
        ok: true,
        latency: Date.now() - started,
        model: result.model,
        message: `连接成功 · ${result.model} · ${Date.now() - started} ms`
      };
    } catch (error) {
      const normalized = normalizeError(error);
      return {
        ok: false,
        code: normalized.code,
        latency: Date.now() - started,
        message: normalized.message
      };
    }
  }
}

module.exports = { AIClient, AIError, normalizeError, parseJson, endpointFor, TIMEOUT_MS };
