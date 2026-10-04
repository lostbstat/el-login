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
  let hostScroller = null, hostOverflow = '', hostScrollBehavior = '';
  function syncHostScroll() {
    try {
      const frame = window.frameElement;
      const main = frame?.closest?.('[data-testid="stMain"]');
      const shell = document.getElementById('appShell');
      const appOpen = shell && !shell.hidden;
      if (main && appOpen) {
        if (!hostScroller) {
          hostScroller = main;
          hostOverflow = main.style.overflowY;
          hostScrollBehavior = main.style.scrollBehavior;
        }
        main.style.overflowY = 'hidden';
        main.style.scrollBehavior = 'auto';
        main.scrollTop = 0;
      } else if (hostScroller) {
        hostScroller.style.overflowY = hostOverflow;
        hostScroller.style.scrollBehavior = hostScrollBehavior;
        hostScroller.scrollTop = 0;
        hostScroller = null;
      }
    } catch (error) { /* Cross-origin hosts manage their own scrolling. */ }
  }
  function updateHostViewport() {
    // Reset the host before measuring: its previous scroll offset can put the
    // iframe above the screen and incorrectly make the app taller than the space.
    syncHostScroll();
    let hostHeight = 0, top = 108;
    try {
      hostHeight = window.parent.innerHeight;
      if (window.frameElement) top = Math.max(0, window.frameElement.getBoundingClientRect().top);
    } catch (error) { /* Cross-origin hosts use the screen fallback. */ }
    if (!(hostHeight > 0)) hostHeight = window.screen?.availHeight || 800;
    document.documentElement.style.setProperty('--streamlit-viewport-height', `${Math.max(1, Math.floor(hostHeight - top - 20))}px`);
  }
  updateHostViewport();
  window.addEventListener('resize', updateHostViewport);
  try { window.parent.addEventListener('resize', updateHostViewport); } catch (error) { /* Cross-origin iframe. */ }

  const storageKey = 'electricity.remembered-session.v1';
  const cookieKey = 'electricity_remembered_session';
  function validSession(value) {
    return value && typeof value.ticket === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value.ticket)
      && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now();
  }
  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (validSession(value)) return value;
      localStorage.removeItem(storageKey);
    } catch (error) { /* Storage can be disabled by the browser. */ }
    try {
      const cookie = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(cookieKey + '='));
      const value = cookie ? JSON.parse(decodeURIComponent(cookie.slice(cookieKey.length + 1))) : null;
      if (validSession(value)) return value;
    } catch (error) { /* Cookies can also be disabled by the browser. */ }
    return null;
  }
  let remembered = readSession();
  function remember(value) {
    remembered = validSession(value) ? { ticket: value.ticket, expiresAt: value.expiresAt } : null;
    try {
      if (remembered) localStorage.setItem(storageKey, JSON.stringify(remembered));
      else localStorage.removeItem(storageKey);
    } catch (error) { /* Login still works without persistent storage. */ }
    try {
      const age = remembered ? Math.max(1, Math.floor((remembered.expiresAt - Date.now()) / 1000)) : 0;
      document.cookie = `${cookieKey}=${remembered ? encodeURIComponent(JSON.stringify(remembered)) : ''}; Path=/; Max-Age=${age}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch (error) { /* Cookie backup is optional. No password or provider token is stored. */ }
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
      const height = Math.max(1, Math.ceil(document.body.getBoundingClientRect().height) + 12);
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
      // Login can finish on a render before its response is acknowledged. Save
      // the server-issued ticket on every authenticated render as well.
      if (config.auth?.user && validSession(config.auth.rememberedSession)) remember(config.auth.rememberedSession);
      if (!initialized) {
        initialized = true;
        if (remembered && config.auth?.enabled) {
          window.StreamlitBridge.request({ action: 'auth.status' }).then(result => {
            readyResolve({ ...config, auth: { ...config.auth, user: result.user,
              rememberedSession: result.rememberedSession } });
          }).catch(error => {
            if (['unauthorized', 'invalid_credentials'].includes(error.code)) {
              remember(null);
              readyResolve({ ...config, auth: { ...config.auth, user: null } });
            } else readyResolve(config);
          });
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
    resetViewport() {
      window.scrollTo(0, 0);
      updateHostViewport();
      requestAnimationFrame(() => { updateHostViewport(); resize(); });
    },
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
  // Welcome buttons may scroll their Streamlit ancestor into view before they
  // hide. Recalculate again after the browser finishes that layout change.
  new MutationObserver(() => window.StreamlitBridge.resetViewport()).observe(document.getElementById('appShell') || document.body, {
    attributes: true, attributeFilter: ['hidden'], subtree: true
  });
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load', resize);
  send('streamlit:componentReady', { apiVersion: 1 });
  resize();
})();


// Relative navigation works in both the Python server and Streamlit iframe.
window.ElectricityPages = { open(page) { window.location.replace(page); } };
