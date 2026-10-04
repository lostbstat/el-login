/* Streamlit Components v1 JSON protocol. No API key enters this file.
   Reference: https://docs.streamlit.io/develop/concepts/custom-components/components-v1/intro */
(() => {
  // Disable zoom gestures inside the app while retaining ordinary scrolling.
  window.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0', '_'].includes(event.key)) event.preventDefault();
  });
  window.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  for (const name of ['gesturestart', 'gesturechange']) {
    window.addEventListener(name, event => event.preventDefault(), { passive: false });
  }
  // Direct Python server: HTTP endpoints. Streamlit iframe: component messages.
  if (window.parent === window || !/\/component\//.test(window.location.pathname)) {
    const ready = fetch('/api/config').then(async response => {
      if (!response.ok) throw new Error('กรุณาเปิดเว็บผ่านเซิร์ฟเวอร์ Python');
      return response.json();
    });
    window.StreamlitBridge = {
      ready,
      async request(payload, signal) {
        const response = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal
        });
        const result = await response.json();
        if (!response.ok) { const error = new Error(result.error || 'Gemini API error'); error.code = result.code; throw error; }
        return result;
      }
    };
    return;
  }
  document.documentElement.classList.add('streamlit-embed');
  function updateHostViewport() {
    let hostHeight = 0, top = 108;
    try {
      hostHeight = window.parent.innerHeight;
      if (window.frameElement) top = Math.max(0, window.frameElement.getBoundingClientRect().top);
    } catch (error) { /* Cross-origin hosts use the screen fallback. */ }
    if (!(hostHeight > 0)) hostHeight = window.screen?.availHeight || 800;
    document.documentElement.style.setProperty('--streamlit-viewport-height', `${Math.max(240, Math.floor(hostHeight - top - 12))}px`);
  }
  updateHostViewport();
  window.addEventListener('resize', updateHostViewport);
  try { window.parent.addEventListener('resize', updateHostViewport); } catch (error) { /* Cross-origin iframe. */ }

  const storageKey = 'electricity.remembered-session.v1';
  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (value && typeof value.ticket === 'string' && value.ticket.length <= 256 && value.expiresAt > Date.now()) return value;
      localStorage.removeItem(storageKey);
    } catch (error) { /* Storage can be disabled by the browser. */ }
    return null;
  }
  let remembered = readSession();
  function remember(value) {
    remembered = value || null;
    try {
      if (remembered) localStorage.setItem(storageKey, JSON.stringify(remembered));
      else localStorage.removeItem(storageKey);
    } catch (error) { /* Login still works without persistent storage. */ }
  }
  let config = null, active = null, counter = 0, readyResolve, initialized = false;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const queue = [];
  let lastHeight = 0, resizeFrame = null;
  const send = (type, fields) => window.parent.postMessage({ isStreamlitMessage: true, type, ...fields }, '*');
  function resize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      const height = Math.max(300, Math.ceil(document.body.getBoundingClientRect().height) + 12);
      if (height !== lastHeight) { lastHeight = height; send('streamlit:setFrameHeight', { height }); }
    });
  }
  function cleanup(item) {
    clearTimeout(item.timer);
    item.signal?.removeEventListener('abort', item.abort);
  }
  function dispatch() {
    if (active || !config) return;
    while (queue.length) {
      const item = queue.shift();
      if (item.cancelled) continue;
      active = item;
      item.timer = setTimeout(() => {
        cleanup(item); item.cancelled = true;
        item.reject(new Error('Gemini ใช้เวลานานเกินไป กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'));
        // Keep the request slot until Python acknowledges it, preventing duplicate submissions.
      }, 150000);
      send('streamlit:setComponentValue', { value: { id: item.id, payload: item.payload }, dataType: 'json' });
      return;
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'streamlit:render') return;
    const args = event.data.args || {};
    if (args.config) {
      config = args.config;
      if (!initialized) {
        initialized = true;
        if (config.auth?.user) {
          remember(config.auth.rememberedSession);
          readyResolve(config);
        } else if (remembered && config.auth?.enabled) {
          window.StreamlitBridge.request({ action: 'auth.status' }).then(result => {
            config = { ...config, auth: { ...config.auth, user: result.user } };
          }).catch(error => {
            if (['unauthorized', 'invalid_credentials'].includes(error.code)) remember(null);
          }).finally(() => readyResolve(config));
        } else readyResolve(config);
      }
    }
    const response = args.response;
    if (active && response?.id === active.id) {
      const item = active; active = null; cleanup(item);
      if (!item.cancelled) {
        if (response.ok) {
          const result = response.result || { text: response.text };
          if (Object.prototype.hasOwnProperty.call(result, 'rememberedSession')) remember(result.rememberedSession);
          item.resolve(result);
        }
        else { const error = new Error(response.error || 'Gemini API error'); error.code = response.code; item.reject(error); }
      }
      // Remove credentials from the component widget value after acknowledgement.
      send('streamlit:setComponentValue', { value: null, dataType: 'json' });
    }
    dispatch(); resize();
  });
  window.StreamlitBridge = {
    ready,
    request(payload, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        if (queue.length >= 8) return reject(new Error('มีคำขอรออยู่หลายรายการ กรุณารอสักครู่'));
        const item = { id: `${Date.now()}-${++counter}`, payload: { ...payload, ...(remembered ? { _session: remembered.ticket } : {}) }, signal, resolve, reject, cancelled: false };
        item.abort = () => {
          item.cancelled = true; cleanup(item); reject(new DOMException('Aborted', 'AbortError'));
          // Sent calls may still finish on Python; ignore their response after Stop.
          if (active !== item) dispatch();
        };
        signal?.addEventListener('abort', item.abort, { once: true });
        queue.push(item); dispatch();
      });
    }
  };
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load', resize);
  send('streamlit:componentReady', { apiVersion: 1 });
  resize();
})();


// Relative navigation works in both the Python server and Streamlit iframe.
window.ElectricityPages = { open(page) { window.location.replace(page); } };
