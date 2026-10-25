/* NerdyTradeIntuition — core: utils, storage, settings, icons, audio, toasts, menus */
window.NTI = window.NTI || {};
(function (N) {
  'use strict';
  const $ = id => document.getElementById(id);
  N.$ = $;
  N.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  N.TICK = 0.05;
  N.roundTick = p => Math.round(p / N.TICK) * N.TICK;
  N.r2 = v => Math.round(v * 100) / 100;

  /* ---------- number formatting ---------- */
  N.f2 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(2);
  N.inr = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  N.sgnInr = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : (v < 0 ? '−' : v > 0 ? '+' : '') + N.inr(v, d);
  N.pct = (v, d = 1) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d) + '%';
  N.dur = sec => {
    sec = Math.max(0, Math.round(sec));
    if (sec < 90) return sec + 's';
    const m = Math.round(sec / 60);
    if (m < 90) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  };
  N.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- storage (local browser only) ---------- */
  N.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  N.debounce = debounce;

  /* ---------- settings ---------- */
  N.DEFAULTS = {
    theme: 'dark', scheme: 'tv', upColor: '#26a69a', downColor: '#ef5350',
    wick: 'same', bodyRatio: 0.68, borderOn: false, hollowUp: false,
    gridMode: 'both', gridAlpha: 1, crosshairStyle: 'dashed', fontSize: 11, chartBg: '',
    showLastLine: true, showCountdown: true, showLegend: true, showWatermark: true, showSessionBreaks: true, showCrosshair: true,
    rightBars: 0.25, indWidth: 1.8, levelWidth: 1.2, levelLabels: true, snapTicks: true,
    sound: true, volume: 0.6, sfxTrade: true, sfxExit: true, sfxBar: false, sfxUi: true, haptics: true,
    speed: 1, pauseOnExit: false, tickDensity: 1, slipTicks: 0, emaReset: true,
    segment: 'intraday', capital: 100000, defQty: 10, defSlPct: 0.5, defTpPct: 1.0, trailPts: 0,
    tf: 5, style: 'candle', sub: 'volume',
    ind: { vwap: false, avwap: false, ema9: false, ema21: false },
    lv: { pd: { hl: false, fib: false }, pw: { hl: false, fib: false }, pm: { hl: false, fib: false }, dayo: false, dayhl: false, orb: false },
    naked: false, plan: true, side: true, panelW: 360, tab: 'trade', favTfs: [1, 5, 15, 60, 'D']
  };
  N.SCHEMES = {
    tv: { name: 'TradingView', up: '#26a69a', down: '#ef5350' },
    classic: { name: 'Classic', up: '#22c55e', down: '#ef4444' },
    cb: { name: 'Blue / Orange', up: '#3b82f6', down: '#f59e0b' },
    mono: { name: 'Mono', up: '#cfd4dc', down: '#5b6270' },
    neon: { name: 'Neon', up: '#00e5a8', down: '#ff3d71' }
  };
  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!over || typeof over !== 'object') return out;
    for (const k of Object.keys(over)) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
      else out[k] = over[k];
    }
    return out;
  }
  N.cfg = deepMerge(N.DEFAULTS, N.store.get('nti2_cfg', {}));
  // migrate legacy v1 theme/capital
  (function migrate() {
    if (N.store.raw('nti2_cfg') == null) {
      const t = N.store.raw('nti_theme'); if (t === 'light' || t === 'dark') N.cfg.theme = t;
      const c = parseFloat(N.store.raw('nti_capital')); if (c > 0) N.cfg.capital = c;
      const w = parseFloat(N.store.raw('nti_panel_w')); if (w >= 250 && w <= 700) N.cfg.panelW = w;
    }
  })();
  const _save = debounce(() => N.store.set('nti2_cfg', N.cfg), 250);
  N.saveCfg = () => _save();
  N.resetCfg = () => { N.cfg = deepMerge(N.DEFAULTS, {}); N.store.set('nti2_cfg', N.cfg); };

  /* ---------- icons ---------- */
  const I = {
    play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4.5" height="16" rx="1" fill="currentColor"/><rect x="13.5" y="4" width="4.5" height="16" rx="1" fill="currentColor"/>',
    stepf: '<polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/><path d="M19 5v14"/>',
    fast: '<polygon points="4 5 12 12 4 19 4 5" fill="currentColor"/><polygon points="12 5 20 12 12 19 12 5" fill="currentColor"/>',
    restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    settings: '<path d="M4 7h2.5M11.5 7H20M4 17h8.5M17.5 17H20"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    candles: '<path d="M7 3v3M7 14v3M17 6v3M17 18v3"/><rect x="5" y="6" width="4" height="8" rx="1"/><rect x="15" y="9" width="4" height="9" rx="1"/>',
    hollow: '<path d="M7 3v3M7 14v3M17 6v3M17 18v3"/><rect x="5" y="6" width="4" height="8" rx="1"/><rect x="15" y="9" width="4" height="9" rx="1" fill="currentColor"/>',
    bars: '<path d="M7 3v18M4 8h3M17 3v18M17 14h3"/>',
    line: '<polyline points="3 17 9 11 13 15 21 7"/>',
    area: '<path d="M3 17l6-6 4 4 8-8v13H3z"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    levels: '<path d="M3 5h18M3 12h18M3 19h18" stroke-dasharray="3 3"/>',
    chev: '<polyline points="6 9 12 15 18 9"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trade: '<path d="M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="17" cy="14" r="1" fill="currentColor"/>',
    stats: '<path d="M3 3v18h18"/><path d="M8 17V9M13 17V5M18 17v-6"/>',
    journal: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><path d="M12 3v12"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M23 9l-6 6M17 9l6 6"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    reverse: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    hline: '<path d="M3 12h5m8 0h5"/><circle cx="12" cy="12" r="2.5"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/>',
    install: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 7v7m-3-3 3 3 3-3"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.9 17.9A10.8 10.8 0 0 1 12 19c-6.5 0-10-7-10-7a18.7 18.7 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M2 2l20 20"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2H17a5 5 0 0 0 5-5c0-4.9-4.5-8.4-10-8.4z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
  };
  N.ICONS = I;
  N.icon = (name, size = 18) => '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || '') + '</svg>';
  N.hydrate = (root) => {
    (root || document).querySelectorAll('i[data-ic]').forEach(el => {
      const nm = el.getAttribute('data-ic'); const sz = parseInt(el.getAttribute('data-sz') || '18', 10);
      el.innerHTML = N.icon(nm, sz); el.removeAttribute('data-ic');
    });
  };
  N.setIcon = (el, name, size) => { el.innerHTML = N.icon(name, size || parseInt(el.getAttribute('data-sz') || '18', 10)); };

  /* ---------- audio (synthesised, no files) ---------- */
  let actx = null, master = null;
  function ensure() {
    if (!N.cfg.sound) return false;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        actx = new AC(); master = actx.createGain(); master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
      master.gain.value = N.clamp(N.cfg.volume, 0, 1);
      return true;
    } catch (e) { return false; }
  }
  function tone(f0, f1, dur, type, gain, delay) {
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, gain, delay, hp) {
    const t0 = actx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = actx.createBufferSource(); s.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1500;
    const g = actx.createGain(); g.gain.value = gain || 0.1;
    s.connect(f); f.connect(g); g.connect(master); s.start(t0);
  }
  const buzz = ms => { if (N.cfg.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } };
  N.sfx = {
    unlock() { ensure(); },
    buy() { if (!N.cfg.sfxTrade || !ensure()) return; tone(520, 780, .11, 'triangle', .22); tone(780, 1040, .13, 'triangle', .2, .07); buzz(18); },
    sell() { if (!N.cfg.sfxTrade || !ensure()) return; tone(700, 470, .11, 'triangle', .22); tone(470, 330, .14, 'triangle', .2, .07); buzz(18); },
    tp() { if (!N.cfg.sfxExit || !ensure()) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(f, f, .22, 'sine', .2, i * .075); tone(f * 2, f * 2, .12, 'sine', .05, i * .075); }); buzz([20, 40, 20]); },
    sl() { if (!N.cfg.sfxExit || !ensure()) return; tone(240, 90, .28, 'sawtooth', .16); tone(160, 60, .34, 'triangle', .2, .09); noise(.08, .06, 0, 800); buzz(60); },
    win() { if (!N.cfg.sfxExit || !ensure()) return; tone(660, 880, .12, 'sine', .2); tone(880, 1320, .16, 'sine', .18, .08); buzz(25); },
    loss() { if (!N.cfg.sfxExit || !ensure()) return; tone(330, 220, .16, 'triangle', .2); tone(220, 150, .2, 'triangle', .18, .08); buzz(40); },
    bar() { if (!N.cfg.sfxBar || !ensure()) return; tone(1500, 1500, .03, 'sine', .05); },
    click() { if (!N.cfg.sfxUi || !ensure()) return; tone(900, 600, .04, 'sine', .08); },
    error() { if (!N.cfg.sfxUi || !ensure()) return; tone(200, 200, .09, 'square', .09); tone(200, 200, .09, 'square', .09, .13); },
    drop() { if (!N.cfg.sfxUi || !ensure()) return; tone(680, 900, .07, 'sine', .14); tone(900, 1200, .06, 'sine', .08, .05); },
    test() { this.tp(); }
  };

  /* ---------- toasts ---------- */
  N.toast = (msg, kind) => {
    const box = $('toasts'); if (!box) return;
    const d = document.createElement('div'); d.className = 'toast ' + (kind || 'info'); d.textContent = msg;
    box.appendChild(d); setTimeout(() => d.remove(), 3100);
    while (box.children.length > 3) box.firstChild.remove();
  };

  /* ---------- popup menu ---------- */
  let menuEl = null, menuState = null;
  function closeMenu() { if (menuEl) menuEl.classList.remove('show'); menuState = null; }
  N.closeMenu = closeMenu;
  function renderMenu() {
    const items = menuState.build();
    menuEl.innerHTML = '';
    items.forEach(it => {
      if (it.h) { const h = document.createElement('h4'); h.textContent = it.h; menuEl.appendChild(h); return; }
      if (it.tog) {
        const r = document.createElement('div'); r.className = 'mrow';
        r.innerHTML = '<div class="nm">' + (it.swatch ? '<span class="sw" style="background:' + it.swatch + '"></span>' : '') + N.esc(it.label) + '</div>';
        const pair = document.createElement('div'); pair.className = 'pair';
        it.tog.forEach(t => {
          const b = document.createElement('button'); b.className = 'mini-tog' + (t.on ? ' on' : ''); b.textContent = t.t;
          b.onclick = e => { e.stopPropagation(); t.fn(); N.sfx.click(); renderMenu(); };
          pair.appendChild(b);
        });
        r.appendChild(pair); menuEl.appendChild(r); return;
      }
      const b = document.createElement('button'); b.className = 'mi' + (it.on ? ' on' : '');
      let h = '';
      if (it.check) h += '<span class="chk">' + N.icon('check', 12) + '</span>';
      else if (it.icon) h += N.icon(it.icon, 16);
      if (it.swatch) h += '<span class="sw" style="background:' + it.swatch + '"></span>';
      h += '<span class="grow">' + N.esc(it.label) + '</span>';
      if (it.kbd) h += '<span class="kbd">' + N.esc(it.kbd) + '</span>';
      b.innerHTML = h;
      b.onclick = e => { e.stopPropagation(); it.fn && it.fn(); N.sfx.click(); if (it.keep) renderMenu(); else closeMenu(); };
      menuEl.appendChild(b);
    });
    positionMenu();
  }
  function positionMenu() {
    const a = menuState.anchor.getBoundingClientRect();
    menuEl.style.left = '0px'; menuEl.style.top = '0px'; menuEl.classList.add('show');
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    let x = menuState.align === 'right' ? a.right - mw : a.left;
    let y = a.bottom + 6;
    if (y + mh > innerHeight - 8) y = Math.max(8, a.top - mh - 6);
    x = N.clamp(x, 8, Math.max(8, innerWidth - mw - 8));
    menuEl.style.left = x + 'px'; menuEl.style.top = y + 'px';
  }
  N.openMenu = (anchor, build, align) => {
    menuEl = menuEl || $('menu');
    if (menuState && menuState.anchor === anchor && menuEl.classList.contains('show')) { closeMenu(); return; }
    menuState = { anchor, build, align };
    renderMenu();
  };
  document.addEventListener('pointerdown', e => {
    if (!menuEl || !menuEl.classList.contains('show')) return;
    if (menuEl.contains(e.target) || (menuState && menuState.anchor.contains(e.target))) return;
    closeMenu();
  }, true);
  window.addEventListener('resize', () => { if (menuState) closeMenu(); });
})(window.NTI);
