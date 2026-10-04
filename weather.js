/* Bangkok current weather. Works in the Python app and Streamlit iframe.
   Source: https://open-meteo.com/en/docs (model-based current conditions). */
(() => {
  const card = document.getElementById('weatherCard');
  if (!card) return;
  const temperature = document.getElementById('weatherTemperature');
  const date = document.getElementById('weatherDate');
  const status = document.getElementById('weatherStatus');
  const icon = document.getElementById('weatherIcon');
  const refreshEvery = 10 * 60 * 1000;
  const cacheKey = 'mrElecWeatherBangkok.v1';
  const endpoint = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: '13.7563', longitude: '100.5018',
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'Asia/Bangkok', forecast_days: '1'
  });
  const dateFormat = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok'
  });
  const timeFormat = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
  });
  let latest = null, pending = false, lastAttempt = 0;

  function valid(value) {
    return value && typeof value.temperature === 'number' && Number.isFinite(value.temperature)
      && value.temperature >= -90 && value.temperature <= 65
      && Number.isInteger(value.code) && typeof value.day === 'boolean'
      && Number.isFinite(value.observedAt) && value.observedAt > 0
      && value.observedAt <= Date.now() + 15 * 60 * 1000;
  }
  function updateDate() { date.textContent = dateFormat.format(new Date()); }
  function render(value, failed = false) {
    updateDate();
    temperature.textContent = value ? `${Math.round(value.temperature)}°C` : '—°C';
    const stale = value && Date.now() - value.observedAt > 60 * 60 * 1000;
    status.textContent = value
      ? `${failed || stale ? 'ข้อมูลเดิม · ' : ''}${timeFormat.format(value.observedAt)} น.`
      : 'โหลดอากาศไม่ได้';
    card.title = value
      ? `กรุงเทพมหานคร · ${dateFormat.format(value.observedAt)} ${timeFormat.format(value.observedAt)} น. · Open-Meteo${failed || stale ? ' · รออัปเดต' : ' · อัปเดตทุก 10 นาที'}`
      : 'ยังไม่มีข้อมูลอากาศ · จะลองใหม่อัตโนมัติ';
    const sun = '<circle cx="24" cy="24" r="10" fill="currentColor"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l4 4M35 35l4 4M9 39l4-4M35 13l4-4"/></g>';
    const cloud = '<path d="M13 34h24a8 8 0 0 0 0-16 12 12 0 0 0-23-2 9 9 0 0 0-1 18Z" fill="currentColor"/>';
    const rain = '<path d="M15 38l-3 6M25 38l-3 6M35 38l-3 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
    const moon = '<path d="M33 5a18 18 0 1 0 10 29A18 18 0 0 1 33 5Z" fill="currentColor"/>';
    const code = value?.code;
    icon.innerHTML = !value ? cloud : code < 2 ? (value.day ? sun : moon)
      : cloud + (code >= 51 ? rain : '');
  }
  async function refresh() {
    if (pending || document.hidden) return;
    pending = true;
    lastAttempt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {signal: controller.signal, cache: 'no-store'});
      if (!response.ok) throw new Error('Weather unavailable');
      const payload = await response.json();
      const current = payload.current;
      const observedAt = typeof current?.time === 'string'
        ? Date.parse(`${current.time}+07:00`) : NaN;
      const value = {
        temperature: current?.temperature_2m, code: current?.weather_code,
        day: current?.is_day === 1, observedAt
      };
      if (!valid(value) || Date.now() - observedAt > 60 * 60 * 1000) {
        throw new Error('Invalid or outdated weather');
      }
      latest = value;
      render(value);
      try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch (error) {}
    } catch (error) {
      render(latest, true);
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  }
  updateDate();
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (valid(cached)) { latest = cached; render(cached, true); }
  } catch (error) {}
  refresh();
  setInterval(refresh, refreshEvery);
  setInterval(updateDate, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastAttempt >= refreshEvery) refresh();
  });
  window.addEventListener('online', refresh);
})();
