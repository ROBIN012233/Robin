const api = window.api;

if (!api) {
  throw new Error('Preload bridge is unavailable');
}

export default api;
