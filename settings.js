/* NerdyTradeIntuition — settings modal (appearance, chart canvas, replay, trading, sound, data) */
(function (N) {
  'use strict';
  const $ = N.$;
  const TABS = [['look', 'palette', 'Appearance'], ['chart', 'candles', 'Chart canvas'], ['replay', 'clock', 'Replay'], ['trade', 'trade', 'Trading'], ['sound', 'volume', 'Sound'], ['data', 'database', 'Data & app'], ['about', 'info', 'About']];
  let cur = 'look';
  // ✏️ EDIT YOUR ABOUT PAGE HERE — plain text, no code knowledge needed
  N.ABOUT = {
    app: 'NerdyTradeIntuition', name: 'Raghu — The Quant Stoic', tagline: 'intraday Nifty options trader & trading-psychology author',
    insta: '@NerdyIntruder', instaUrl: 'https://www.instagram.com/nerdyintruder/',
    bio: [
      'I trade Nifty and Bank Nifty options intraday, built around market structure, open-interest divergence and VWAP. I write books and notes for retail traders under the handle @NerdyIntruder — markets, psychology, uncertainty and risk management; never a get-rich shortcut.',
      'This simulator is my personal training ground: random synthetic charts, a tick-by-tick replay, draggable stop / target and a private journal, so intuition is built by repetition — with zero real money at risk.'
    ],
    chips: ['Market structure', 'VWAP & AVWAP', 'Support / Resistance', 'Supply & Demand', 'Risk first', 'Stoic discipline'],
    fine: 'Synthetic data for practice only — not market data, not investment advice. Everything you save stays in this browser.'
  };

  const chg = (k, v) => { N.cfg[k] = v; N.saveCfg(); N.cfgChanged && N.cfgChanged(k); };
  function row(title, sub, ctl) { const r = document.createElement('div'); r.className = 'frow'; r.innerHTML = '<div class="ft"><span>' + N.esc(title) + '</span>' + (sub ? '<span class="fs">' + N.esc(sub) + '</span>' : '') + '</div>'; const c = document.createElement('div'); c.className = 'ctl'; [].concat(ctl).forEach(x => c.appendChild(x)); r.appendChild(c); return r; }
  const sect = t => { const d = document.createElement('div'); d.className = 'sect'; d.textContent = t; return d; };
  function tog(k, title, sub) { const l = document.createElement('label'); l.className = 'tog'; l.innerHTML = '<input type="checkbox"><i></i>'; const i = l.firstChild; i.checked = !!N.cfg[k]; i.onchange = () => { chg(k, i.checked); N.sfx.click(); }; return row(title, sub, l); }
  function range(k, title, min, max, step, fmt, sub) { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = N.cfg[k]; const v = document.createElement('span'); v.className = 'val'; const f = fmt || (x => x); v.textContent = f(+i.value); i.oninput = () => { v.textContent = f(+i.value); chg(k, +i.value); }; return row(title, sub, [i, v]); }
  function sel(k, title, opts, sub, conv) { const s = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = String(N.cfg[k]); s.onchange = () => chg(k, conv ? conv(s.value) : s.value); return row(title, sub, s); }
  function num(k, title, min, step, sub) { const i = document.createElement('input'); i.type = 'number'; i.min = min; i.step = step; i.value = N.cfg[k]; i.onchange = () => { const v = parseFloat(i.value); if (isFinite(v)) chg(k, v); }; return row(title, sub, i); }
  function color(k, title, sub, resetVal) { const i = document.createElement('input'); i.type = 'color'; i.value = N.cfg[k] || '#0f131c'; i.oninput = () => { N.cfg.scheme = 'custom'; chg(k, i.value); }; const els = [i]; if (resetVal !== undefined) { const b = document.createElement('button'); b.className = 'btn sm solid'; b.textContent = 'Reset'; b.onclick = () => { chg(k, resetVal); render(); }; els.push(b); } return row(title, sub, els); }
  function btn(label, icon, fn, cls) { const b = document.createElement('button'); b.className = 'btn ' + (cls || 'solid'); b.innerHTML = N.icon(icon, 15) + '<span>' + label + '</span>'; b.onclick = fn; return b; }

  function render() {
    const body = $('mBody'); body.innerHTML = '';
    $('mTabs').innerHTML = TABS.map(t => '<button class="mtab' + (t[0] === cur ? ' on' : '') + '" data-t="' + t[0] + '">' + N.icon(t[1], 17) + '<span>' + t[2] + '</span></button>').join('');
    $('mTabs').querySelectorAll('.mtab').forEach(b => b.onclick = () => { cur = b.dataset.t; render(); });
    const add = el => body.appendChild(el);
    if (cur === 'look') {
      add(sect('Theme'));
      add(sel('theme', 'Interface theme', [['dark', 'Dark'], ['light', 'Light']]));
      add(sect('Candle colours'));
      const sc = document.createElement('div'); sc.className = 'schemes';
      Object.entries(N.SCHEMES).forEach(([k, s]) => {
        const d = document.createElement('div'); d.className = 'scheme' + (N.cfg.scheme === k ? ' on' : '');
        d.innerHTML = '<div class="c"><i style="height:12px;background:' + s.down + '"></i><i style="height:22px;background:' + s.up + '"></i><i style="height:16px;background:' + s.down + '"></i><i style="height:26px;background:' + s.up + '"></i></div>' + s.name;
        d.onclick = () => { N.cfg.scheme = k; N.cfg.upColor = s.up; N.cfg.downColor = s.down; N.saveCfg(); N.cfgChanged('upColor'); render(); };
        sc.appendChild(d);
      });
      add(sc);
      add(color('upColor', 'Up candle', 'custom colour')); add(color('downColor', 'Down candle', 'custom colour'));
      add(sect('Canvas'));
      add(color('chartBg', 'Chart background', 'empty = follow theme', ''));
      add(range('fontSize', 'Chart text size', 9, 15, 1, v => v + 'px'));
    } else if (cur === 'chart') {
      add(sect('Candles'));
      add(range('bodyRatio', 'Candle body width', 0.3, 0.95, 0.01, v => Math.round(v * 100) + '%'));
      add(sel('wick', 'Wick colour', [['same', 'Same as candle'], ['neutral', 'Neutral grey']]));
      add(tog('hollowUp', 'Hollow up-candles', 'Up candles drawn as outlines'));
      add(tog('borderOn', 'Candle borders'));
      add(sect('Grid & crosshair'));
      add(sel('gridMode', 'Grid lines', [['both', 'Horizontal + vertical'], ['h', 'Horizontal only'], ['v', 'Vertical only'], ['none', 'None']]));
      add(range('gridAlpha', 'Grid strength', 0.1, 1, 0.05, v => Math.round(v * 100) + '%'));
      add(sel('crosshairStyle', 'Crosshair style', [['dashed', 'Dashed'], ['dotted', 'Dotted'], ['solid', 'Solid']]));
      add(tog('showCrosshair', 'Show crosshair'));
      add(sect('Overlays on canvas'));
      add(tog('showLegend', 'OHLC legend & indicator values'));
      add(tog('showLastLine', 'Last-price line'));
      add(tog('showCountdown', 'Candle countdown timer'));
      add(tog('showWatermark', 'Symbol watermark'));
      add(tog('showSessionBreaks', 'Session break lines'));
      add(sect('Lines & space'));
      add(range('rightBars', 'Empty space on the right', 0.05, 0.6, 0.01, v => Math.round(v * 100) + '%', 'of visible bars'));
      add(range('indWidth', 'Indicator line width', 1, 3.5, 0.1, v => v.toFixed(1)));
      add(range('levelWidth', 'Level line width', 0.6, 3, 0.1, v => v.toFixed(1)));
      add(tog('levelLabels', 'Level labels (PDH, PWL…)'));
    } else if (cur === 'replay') {
      add(sect('Candle formation'));
      add(sel('tickDensity', 'Tick density', [[0.5, 'Sparse'], [1, 'Normal'], [1.6, 'Busy'], [2.4, 'Very busy']], 'How many price prints form each 1m candle', parseFloat));
      add(sel('speed', 'Default speed', [[1, '1× real-time'], [2, '2×'], [5, '5×'], [10, '10×'], [30, '30×'], [60, '60× (1 min/sec)'], [300, '300×'], [900, '900×'], [3600, '3600× (1 hr/sec)']], 'Used when a chart loads', parseFloat));
      add(tog('pauseOnExit', 'Pause when a stop / target hits', 'Handy for reviewing the exit candle'));
      add(sect('Execution realism'));
      add(sel('slipTicks', 'Slippage on market & stop fills', [[0, 'None'], [1, '1 tick (₹0.05)'], [2, '2 ticks'], [3, '3 ticks'], [5, '5 ticks']], 'Applied against you', parseFloat));
      add(tog('emaResetDay', 'EMAs restart every session', 'Off = continuous across days, like TradingView'));
    } else if (cur === 'trade') {
      add(sect('Costs & capital'));
      add(sel('segment', 'Charge segment', [['intraday', 'Equity intraday'], ['delivery', 'Delivery'], ['futures', 'Futures'], ['options', 'Options']], 'Charges are deducted from every logged trade'));
      add(num('capital', 'Capital (₹)', 1000, 1000, 'Drives ROI, drawdown % and risk sizing'));
      add(sect('Order ticket defaults (for each new chart)'));
      add(num('defQty', 'Default quantity', 1, 1));
      add(num('defSlPct', 'Default stop distance (% of price)', 0.05, 0.05));
      add(num('defTpPct', 'Default target distance (% of price)', 0.05, 0.05));
      add(num('trailPts', 'Trailing-stop distance (points, 0 = use stop distance)', 0, 0.05));
      add(tog('plan', 'Show draggable plan lines while flat'));
      add(tog('snapTicks', 'Snap dragged lines to tick size (₹0.05)'));
    } else if (cur === 'sound') {
      add(sect('Master'));
      add(tog('sound', 'Sound effects'));
      const t = btn('Play test', 'volume', () => { N.sfx.test(); });
      add(row('Volume', null, [(() => { const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.05; i.value = N.cfg.volume; i.oninput = () => { chg('volume', +i.value); }; i.onchange = () => N.sfx.drop(); return i; })(), t]));
      add(sect('Events'));
      add(tog('sfxTrade', 'Order fills', 'Rising chime on buy · falling on sell'));
      add(tog('sfxExit', 'Target / stop / close', 'Arpeggio on target · thud on stop'));
      add(tog('sfxBar', 'New candle tick', 'A very soft tick when a candle closes'));
      add(tog('sfxUi', 'Interface clicks'));
      add(tog('haptics', 'Vibration on phones'));
    } else if (cur === 'about') {
      const A = N.ABOUT, d = document.createElement('div'); d.className = 'about';
      d.innerHTML = '<img class="logo" src="icon-192.png" onerror="this.src=\'icons/icon-192.png\'" alt=""><h2>' + N.esc(A.app) + '</h2><div class="by">by <b>' + N.esc(A.name) + '</b> · ' + N.esc(A.tagline) + '</div>' +
        A.bio.map(t => '<p>' + N.esc(t) + '</p>').join('') +
        '<a class="ig" href="' + N.esc(A.instaUrl) + '" target="_blank" rel="noopener">' + N.icon('insta', 18) + N.esc(A.insta) + ' on Instagram</a>' +
        '<div class="chips2">' + A.chips.map(t => '<span>' + N.esc(t) + '</span>').join('') + '</div>' +
        '<p class="fine">' + N.esc(A.fine) + '</p>';
      add(d);
    } else if (cur === 'data') {
      add(sect('Your data lives only in this browser'));
      const note = document.createElement('div'); note.className = 'note'; note.textContent = 'Trades, journal notes and settings are stored in this browser\'s local storage on this device. Nothing is uploaded. Clearing site data erases them — keep a backup.'; add(note);
      const rw = document.createElement('div'); rw.className = 'btnrow';
      rw.appendChild(btn('Backup (JSON)', 'download', () => N.exportBackup()));
      rw.appendChild(btn('Restore', 'upload', () => $('jrFile').click()));
      rw.appendChild(btn('Export CSV', 'download', () => $('jrCsv').click()));
      add(rw);
      const sz = (() => { try { return Math.round(((localStorage.getItem('nti2_trades') || '').length + (localStorage.getItem('nti2_cfg') || '').length) / 1024); } catch (e) { return '?'; } })();
      const st = document.createElement('div'); st.className = 'note'; st.textContent = N.tradeStore.list.length + ' trades · ~' + sz + ' KB used'; add(st);
      add(sect('Chart seed'));
      const si = document.createElement('input'); si.type = 'number'; si.min = 1; si.max = 999999; si.placeholder = 'seed'; si.value = N.market.seed;
      add(row('Load a chart by seed', 'Same seed = same candles, same ticks. Shown in the status bar.', [si, btn('Load', 'play', () => { const v = parseInt(si.value, 10); if (v > 0) { N.loadSeed(v); N.closeModal(); } }, 'solid')]));
      add(sect('App'));
      const rw2 = document.createElement('div'); rw2.className = 'btnrow';
      rw2.appendChild(btn('Install app', 'install', () => N.promptInstall && N.promptInstall()));
      rw2.appendChild(btn('Reset settings', 'restart', () => { if (confirm('Reset all settings to defaults? (Journal is kept.)')) { N.resetCfg(); N.cfgChanged('*'); render(); } }, 'solid'));
      rw2.appendChild(btn('Check for update', 'download', () => N.checkUpdate && N.checkUpdate()));
      add(rw2);
      const ver = document.createElement('div'); ver.className = 'note'; ver.textContent = 'NerdyTradeIntuition v2 · synthetic data for practice only — not market data, not advice.'; add(ver);
    }
  }
  N.openSettings = function (tab) { if (tab) cur = tab; render(); $('modal').classList.add('show'); };
  N.closeModal = function () { $('modal').classList.remove('show'); };
  N.settingsInit = function () {
    $('mClose').onclick = N.closeModal;
    $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) N.closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modal').classList.contains('show')) N.closeModal(); });
  };
})(window.NTI);
