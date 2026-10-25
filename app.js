/* NerdyTradeIntuition — application: replay engine, trading, chart data, UI wiring */
(function (N) {
  'use strict';
  const $ = N.$, M = N.market, TICK = N.TICK, r2 = N.r2;
  const C = () => N.cfg;
  const S = N.S = { sec: 0, playing: false, speed: 1, lastReal: 0, raf: 0, pos: null, tool: 'cursor', userLines: [], plan: { dir: 1 }, ic: {}, price: 0, lastKey: '', uid: 1, lastPanel: 0, lastStatus: 0 };
  const chart = N.chart = new N.Chart($('chartCanvas'));
  const el = id => $(id);
  const mobile = () => window.matchMedia('(max-width:860px)').matches;
  const dayKey = t => Math.floor((t + 19800) / 86400);
  const COL = { vwap: '#f5a623', avwap: '#3b82f6', ema9: '#e879f9', ema21: '#38bdf8', pd: '#2f7bff', pw: '#ff9800', pm: '#b455e8', dayo: '#94a3b8', dayhl: '#fbbf24', orb: '#22d3ee', e13: '#00bcd4', e21: '#ff00c8', e50: '#ff9800', e200: '#ffffff', vWk: '#c84b00', vMo: '#aa00aa', vPd: '#008080', av: '#3b82f6', b1: '#22c55e', b2: '#f59e0b', b3: '#ef4444' };

  /* ======================= theme / config ======================= */
  function applyTheme() {
    document.documentElement.dataset.theme = C().theme;
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    chart.colors = { bg: v('--chartbg'), grid: v('--grid'), axis: v('--border'), text: v('--text'), dim: v('--dim'), cross: C().theme === 'dark' ? '#8a93a6' : '#6a6d78', tag: v('--panel2'), accent: v('--accent') };
    $('metaTheme').setAttribute('content', v('--panel'));
    N.setIcon($('themeIc'), C().theme === 'dark' ? 'moon' : 'sun');
  }
  N.cfgChanged = function (k) {
    if (k === 'theme' || k === '*') applyTheme();
    if (k === 'tickDensity' || k === '*') M.setDensity(C().tickDensity);
    if (k === 'tf' || k === '*') buildTfSeg();
    $('watermark').style.display = C().showWatermark ? '' : 'none';
    syncRail(); buildTfSeg(); refreshHeader(); refresh();
  };
  N.onSegmentChange = () => { $('tkSeg').textContent = C().segment; };
  N.onCapitalChange = () => { N.refreshAll(); };
  N.getPrice = () => S.price;

  /* ======================= header: timeframes, menus ======================= */
  function buildTfSeg() {
    const seg = $('tfSeg'), cur = C().tf, favs = C().favTfs.slice(); if (favs.indexOf(cur) < 0) favs.push(cur);
    seg.innerHTML = '';
    favs.forEach(tf => { const b = document.createElement('button'); b.className = 'btn' + (tf === cur ? ' on' : ''); b.textContent = N.tfLabel(tf); b.onclick = () => { N.sfx.click(); setTf(tf); }; seg.appendChild(b); });
    $('tfMoreLbl').textContent = 'More';
  }
  function setTf(tf) { C().tf = tf; N.saveCfg(); chart.resetView(); buildTfSeg(); $('wmTf').textContent = N.tfLabel(tf); refresh(); }
  $('tfMore').onclick = e => N.openMenu(e.currentTarget, () => {
    const it = [{ h: 'Minutes' }];
    N.TF_ORDER.forEach((tf, i) => { if (tf === 60) it.push({ h: 'Hours' }); if (tf === 'D') it.push({ h: 'Days & up' }); it.push({ label: N.tfLabel(tf) + (tf === 'D' ? ' · Daily' : tf === 'W' ? ' · Weekly' : tf === 'M' ? ' · Monthly' : ''), on: C().tf === tf, kbd: i < 9 ? String(i + 1) : '', fn: () => setTf(tf) }); });
    return it;
  });
  const STYLES = [['candle', 'Candles', 'candles'], ['hollow', 'Hollow candles', 'hollow'], ['bar', 'OHLC bars', 'bars'], ['heikinashi', 'Heikin-Ashi', 'candles'], ['line', 'Line', 'line'], ['area', 'Area', 'area']];
  $('btnStyle').onclick = e => N.openMenu(e.currentTarget, () => [{ h: 'Chart style' }].concat(STYLES.map(s => ({ label: s[1], icon: s[2], on: C().style === s[0], fn: () => { C().style = s[0]; N.saveCfg(); refreshHeader(); refresh(); } }))));
  function toggleInd(k) { C().ind[k] = !C().ind[k]; N.saveCfg(); refreshHeader(); refresh(); }
  const flip = (g, k) => { C()[g][k] = !C()[g][k]; N.saveCfg(); S.pk = null; refreshHeader(); refresh(); };
  const e200c = () => C().theme === 'dark' ? '#ffffff' : '#555a66';
  $('btnInd').onclick = e => N.openMenu(e.currentTarget, () => {
    const k1 = C().pk1, k2 = C().pk2, T = (g, k, t, on) => ({ t, on: on !== undefined ? on : C()[g][k], fn: () => flip(g, k) });
    return [
      { h: 'Built-in' },
      { label: 'Volume (on chart)', check: 1, on: C().ind.vol, keep: 1, fn: () => toggleInd('vol') },
      { label: 'VWAP (session)', check: 1, on: C().ind.vwap, swatch: COL.vwap, keep: 1, fn: () => toggleInd('vwap') },
      { label: '5-day anchored VWAP', check: 1, on: C().ind.avwap, swatch: COL.avwap, keep: 1, fn: () => toggleInd('avwap') },
      { label: 'EMA 9', check: 1, on: C().ind.ema9, swatch: COL.ema9, keep: 1, fn: () => toggleInd('ema9') },
      { label: 'EMA 21', check: 1, on: C().ind.ema21, swatch: COL.ema21, keep: 1, fn: () => toggleInd('ema21') },
      { h: 'Sub-panel' }
    ].concat([['none', 'None'], ['rsi', 'RSI (14)'], ['oi', 'OI flow (simulated)']].map(s => ({ label: s[1], check: 1, on: C().sub === s[0], keep: 1, fn: () => { C().sub = s[0]; N.saveCfg(); refreshHeader(); refresh(); } }))).concat([
      { h: 'NerdyIntruder · Market Structure + S/R + S/D + Candles' },
      { label: 'Show this pack', check: 1, on: k1.on, keep: 1, fn: () => flip('pk1', 'on') },
      { label: 'ILM | SP zig-zag', tog: [T('pk1', 'zzMajor', 'Major'), T('pk1', 'zzMinor', 'Minor')] },
      { label: 'Zones', tog: [T('pk1', 'sd', 'Supply/Demand'), T('pk1', 'sr', 'S / R')] },
      { label: 'Candles at S/R', tog: [T('pk1', 'cd', 'On')] },
      { label: 'Patterns', tog: [T('pk1', 'pHammer', 'Hammer'), T('pk1', 'pInv', 'Inv/Star'), T('pk1', 'pEngulf', 'Engulf')] },
      { label: '', tog: [T('pk1', 'pStars', 'Morning/Evening'), T('pk1', 'pBig', 'Big / wick bars')] },
      { label: 'Text labels', tog: [T('pk1', 'labels', 'Show')] },
      { h: 'NerdyIntruder · Fibs + VWAP + EMA + ADX + Volume Breakout' },
      { label: 'Auto Fibs & PD/PW/PM H/L → see Levels menu', icon: 'levels', fn: () => $('btnLevels').click() },
      { label: 'EMAs', swatch: COL.e21, tog: [T('pk2', 'ema', 'On'), T('pk2', 'e13', '13'), T('pk2', 'e21', '21'), T('pk2', 'e50', '50'), T('pk2', 'e200', '200')] },
      { label: 'VWAPs', swatch: COL.vWk, tog: [T('pk2', 'vwap', 'On'), T('pk2', 'vWk', 'Week'), T('pk2', 'vMo', 'Month'), T('pk2', 'vPd', 'Prev day')] },
      { label: 'Anchored VWAP + SD bands', swatch: COL.av, tog: [T('pk2', 'av', 'On'), T('pk2', 'b1', '1σ'), T('pk2', 'b2', '2σ'), T('pk2', 'b3', '3σ')] },
      { label: C().anchorT ? 'Anchor: custom bar (tap to clear)' : 'Anchor: ' + k2.avDays + ' sessions back · tap to pick a bar', icon: 'anchor', fn: () => { if (C().anchorT) { C().anchorT = null; N.saveCfg(); refresh(); } else { setTool('anchor'); N.toast('Tap a candle to anchor the VWAP there', 'info'); } } },
      { label: 'ADX dashboard', tog: [T('pk2', 'adx', 'Show')] },
      { label: 'Volume breakout', tog: [T('pk2', 'vb', 'On'), T('pk2', 'vbLines', 'S/R lines'), T('pk2', 'vbMa', 'Avg vol')] },
      { label: 'Breakout strictness', tog: ['Strict', 'Balanced', 'More'].map(x => ({ t: x, on: k2.vbPreset === x, fn: () => { C().pk2.vbPreset = x; N.saveCfg(); S.pk = null; refresh(); } })) },
      { label: 'Text labels', tog: [T('pk2', 'labels', 'Show')] }
    ]);
  });
  function toggleLv(g, s) { C().lv[g][s] = !C().lv[g][s]; N.saveCfg(); refreshHeader(); refresh(); }
  function toggleLv1(k) { C().lv[k] = !C().lv[k]; N.saveCfg(); refreshHeader(); refresh(); }
  $('btnLevels').onclick = e => N.openMenu(e.currentTarget, () => [
    { h: 'Previous periods' },
    { label: 'Previous day', swatch: COL.pd, tog: [{ t: 'H/L', on: C().lv.pd.hl, fn: () => toggleLv('pd', 'hl') }, { t: 'Fib', on: C().lv.pd.fib, fn: () => toggleLv('pd', 'fib') }] },
    { label: 'Previous week', swatch: COL.pw, tog: [{ t: 'H/L', on: C().lv.pw.hl, fn: () => toggleLv('pw', 'hl') }, { t: 'Fib', on: C().lv.pw.fib, fn: () => toggleLv('pw', 'fib') }] },
    { label: 'Previous month', swatch: COL.pm, tog: [{ t: 'H/L', on: C().lv.pm.hl, fn: () => toggleLv('pm', 'hl') }, { t: 'Fib', on: C().lv.pm.fib, fn: () => toggleLv('pm', 'fib') }] },
    { h: 'Today' },
    { label: 'Day open', check: 1, on: C().lv.dayo, swatch: COL.dayo, keep: 1, fn: () => toggleLv1('dayo') },
    { label: 'Day high / low (live)', check: 1, on: C().lv.dayhl, swatch: COL.dayhl, keep: 1, fn: () => toggleLv1('dayhl') },
    { label: 'Opening range 15m', check: 1, on: C().lv.orb, swatch: COL.orb, keep: 1, fn: () => toggleLv1('orb') },
    { h: '' },
    { label: 'Hide all levels', icon: 'eyeoff', keep: 1, fn: () => { const l = C().lv; ['pd', 'pw', 'pm'].forEach(g => { l[g].hl = false; l[g].fib = false; }); l.dayo = l.dayhl = l.orb = false; N.saveCfg(); refreshHeader(); refresh(); } }
  ]);
  function refreshHeader() {
    const c = C(), indN = ['vwap', 'avwap', 'ema9', 'ema21'].filter(k => c.ind[k]).length + (c.sub !== 'none' ? 1 : 0) + (c.pk1.on ? 1 : 0) + ['ema', 'vwap', 'av', 'adx', 'vb'].filter(k => c.pk2[k]).length;
    const lvN = ['pd', 'pw', 'pm'].filter(g => c.lv[g].hl || c.lv[g].fib).length + ['dayo', 'dayhl', 'orb'].filter(k => c.lv[k]).length;
    $('btnInd').classList.toggle('on', indN > 0 && !c.naked); $('btnInd').querySelector('span').textContent = 'Indicators' + (indN ? ' · ' + indN : '');
    $('btnLevels').classList.toggle('on', lvN > 0 && !c.naked); $('btnLevels').querySelector('span').textContent = 'Levels' + (lvN ? ' · ' + lvN : '');
    $('btnNaked').classList.toggle('on', c.naked); N.setIcon($('nakedIc'), c.naked ? 'eyeoff' : 'eye');
    const s = STYLES.find(x => x[0] === c.style) || STYLES[0]; N.setIcon($('styleIc'), s[2]); $('btnStyle').title = 'Chart style: ' + s[1];
    $('wmTf').textContent = N.tfLabel(c.tf); $('wmSym').textContent = M.ticker; $('sym').textContent = M.ticker || '—';
    $('tkSeg').textContent = c.segment;
  }
  function toggleNaked() { C().naked = !C().naked; N.saveCfg(); refreshHeader(); refresh(); N.toast(C().naked ? 'Naked price — indicators & levels hidden' : 'Indicators & levels restored', 'info'); }
  $('btnNaked').onclick = toggleNaked;
  $('btnTheme').onclick = () => { C().theme = C().theme === 'dark' ? 'light' : 'dark'; N.saveCfg(); applyTheme(); refresh(); renderPanels(true); N.sfx.click(); };
  $('btnSettings').onclick = () => N.openSettings(); $('btnAbout').onclick = () => N.openSettings('about');
  $('btnShot').onclick = () => chart.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = M.ticker + '-' + N.tfLabel(C().tf) + '-seed' + M.seed + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); N.toast('Screenshot saved', 'info'); });
  $('btnNext').onclick = () => newChart();

  /* ======================= rail / tools ======================= */
  function setTool(t) {
    S.tool = t; chart.setTool(t);
    $('toolCursor').classList.toggle('on', t === 'cursor'); $('toolMeasure').classList.toggle('on', t === 'measure'); $('toolHline').classList.toggle('on', t === 'hline'); $('toolAnchor').classList.toggle('on', t === 'anchor');
  }
  function clearDrawings() { S.userLines = []; chart.measure = null; refresh(); }
  function syncRail() {
    const c = C(); $('railGrid').classList.toggle('on', c.gridMode !== 'none'); $('railBreaks').classList.toggle('on', c.showSessionBreaks); $('railCross').classList.toggle('on', c.showCrosshair);
  }
  $('toolCursor').onclick = () => setTool('cursor'); $('toolMeasure').onclick = () => setTool(S.tool === 'measure' ? 'cursor' : 'measure'); $('toolHline').onclick = () => setTool(S.tool === 'hline' ? 'cursor' : 'hline');
  $('toolClear').onclick = clearDrawings; $('toolAnchor').onclick = () => { if (S.tool === 'anchor') setTool('cursor'); else { setTool('anchor'); N.toast('Tap a candle to anchor the VWAP there', 'info'); } };
  $('railGrid').onclick = () => { C().gridMode = C().gridMode === 'none' ? 'both' : 'none'; N.saveCfg(); syncRail(); chart.render(); };
  $('railBreaks').onclick = () => { C().showSessionBreaks = !C().showSessionBreaks; N.saveCfg(); syncRail(); chart.render(); };
  $('railCross').onclick = () => { C().showCrosshair = !C().showCrosshair; N.saveCfg(); syncRail(); chart.render(); };
  $('toolFit').onclick = () => { chart.resetView(); refresh(); };
  $('btnTools').onclick = e => N.openMenu(e.currentTarget, () => [
    { h: 'Draw' }, { label: 'Measure', icon: 'ruler', on: S.tool === 'measure', fn: () => setTool(S.tool === 'measure' ? 'cursor' : 'measure') },
    { label: 'Horizontal line', icon: 'hline', on: S.tool === 'hline', fn: () => setTool(S.tool === 'hline' ? 'cursor' : 'hline') },
    { label: 'Clear my lines', icon: 'trash', fn: clearDrawings },
    { h: 'View' }, { label: 'Grid', check: 1, on: C().gridMode !== 'none', keep: 1, fn: () => $('railGrid').click() },
    { label: 'Session breaks', check: 1, on: C().showSessionBreaks, keep: 1, fn: () => $('railBreaks').click() },
    { label: 'Crosshair', check: 1, on: C().showCrosshair, keep: 1, fn: () => $('railCross').click() },
    { label: 'Reset view', icon: 'fit', fn: () => $('toolFit').click() }
  ], 'right');

  /* ======================= chart data build ======================= */
  function indSeries(f, name, def, cx, forming) {
    const key = f.key + '|' + name + '|' + cx.intraday + '|' + cx.emaReset + '|' + cx.anchor + '|' + cx.anchorT;
    let c = S.ic[name];
    if (!c || c.key !== key) { c = { key, res: N.foldInd(def, f.view.slice(0, f.formIdx), cx) }; S.ic[name] = c; }
    return N.extendInd(def, c.res, forming, cx);
  }
  // object-valued indicators (anchored VWAP bands, ADX): cache closed-bar arrays per pick, append forming point
  function indMulti(f, name, def, cx, forming, picks) {
    const key = f.key + '|' + name + '|' + cx.anchorT; let c = S.ic[name];
    if (!c || c.key !== key) { const res = N.foldInd(def, f.view.slice(0, f.formIdx), cx); c = { key, res, arr: picks.map(pk => res.vals.map(v => ({ time: v.time, value: pk(v.value) })).filter(v => v.value != null && isFinite(v.value))) }; S.ic[name] = c; }
    const st = Object.assign({}, c.res.st), v = def.step(st, forming, cx);
    return picks.map((pk, i) => { const x = v ? pk(v) : null; return x != null && isFinite(x) ? c.arr[i].concat([{ time: forming.time, value: x }]) : c.arr[i]; });
  }
  const firstIdxOfSession = (view, si) => { let lo = 0, hi = view.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (view[m].sessionIndex >= si) hi = m; else lo = m + 1; } return lo; };
  const wkTrendMemo = {};
  const trendOf = b => { if (b.sessionIndex === undefined) return 0; const k = M.seed + ':' + b.sessionIndex; if (wkTrendMemo[k] === undefined) wkTrendMemo[k] = M.weeklyTrend(b.sessionIndex); return wkTrendMemo[k]; };
  function packKey(c) { return JSON.stringify([c.pk1, c.pk2.vb, c.pk2.vbPreset, c.pk2.vbLines, c.pk2.labels, c.upColor, c.downColor, c.naked]); }
  function fmtRemain(s) { s = Math.max(0, Math.ceil(s)); if (s >= 3600) return Math.floor(s / 3600) + 'h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm'; return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  const pnlOf = (P, px) => (px - P.entry) * P.dir * P.qty;
  function validTP(P, p, cur) { return P.dir === 1 ? Math.max(p, cur + TICK) : Math.min(p, cur - TICK); }
  function validSL(P, p, cur) { return P.dir === 1 ? Math.min(p, cur - TICK) : Math.max(p, cur + TICK); }

  function refresh() {
    if (!M.base1m.length) return;
    const c = C(), tf = c.tf, f = M.series(tf, S.sec), ck = f.clock, part = f.part, price = part.close, intr = N.isIntraday(tf), forming = f.view[f.formIdx];
    S.price = price;
    if (f.key !== S.lastKey) { if (S.lastKey && S.playing) N.sfx.bar(); S.lastKey = f.key; }
    const naked = c.naked, overlays = [], lines = [], zones = [], sub = { mode: naked ? 'none' : c.sub }; let shapes = [], hud = null, hawkD = null;
    if (!naked) {
      const cx = { intraday: intr, emaReset: c.emaResetDay, anchor: ck.sessionIndex - 5, anchorT: c.anchorT || 0 };
      const brk = intr ? { breakOnSession: true, session: dayKey } : {}, brkE = intr && c.emaResetDay ? brk : {};
      if (c.ind.vwap && intr) overlays.push(Object.assign({ key: 'vwap', label: 'VWAP', color: COL.vwap, vals: indSeries(f, 'vwap', N.ind.vwap, cx, forming) }, brk));
      if (c.ind.avwap && intr && cx.anchor >= 0) overlays.push({ key: 'avwap', label: '5D AVWAP', color: COL.avwap, vals: indSeries(f, 'avwap', N.ind.avwap, cx, forming) });
      if (c.ind.ema9) overlays.push(Object.assign({ key: 'ema9', label: 'EMA 9', color: COL.ema9, vals: indSeries(f, 'ema9', N.ind.ema(9), cx, forming) }, brkE));
      if (c.ind.ema21) overlays.push(Object.assign({ key: 'ema21', label: 'EMA 21', color: COL.ema21, vals: indSeries(f, 'ema21', N.ind.ema(21), cx, forming) }, brkE));
      if (c.sub === 'rsi') sub.rsi = indSeries(f, 'rsi', N.ind.rsi, cx, forming);
      if (c.sub === 'oi') sub.oi = indSeries(f, 'oi', N.ind.oi, cx, forming);
      // ---- pack 2 overlays ----
      const k2 = c.pk2, lab = k2.labels;
      if (k2.ema) [[13, 'e13'], [21, 'e21'], [50, 'e50'], [200, 'e200']].forEach(([n, k]) => { if (k2[k]) overlays.push({ key: 'pe' + n, label: 'EMA ' + n, color: k === 'e200' ? e200c() : COL[k], width: 1.8, vals: indSeries(f, 'pe' + n, N.ind.emaC(n), cx, forming) }); });
      if (k2.vwap && intr) {
        if (k2.vWk) overlays.push({ key: 'vwk', label: 'Wk VWAP', color: COL.vWk, width: 1.6, vals: indSeries(f, 'vwk', N.ind.vwapP('W'), cx, forming) });
        if (k2.vMo) overlays.push({ key: 'vmo', label: 'Mo VWAP', color: COL.vMo, width: 1.6, vals: indSeries(f, 'vmo', N.ind.vwapP('M'), cx, forming) });
        if (k2.vPd) overlays.push({ key: 'vpd', label: 'PD VWAP', color: COL.vPd, dots: true, vals: indSeries(f, 'vpd', N.ind.vwapPD, cx, forming) });
      }
      if (k2.av) {
        const ancT = c.anchorT || (M.sessions[Math.max(0, ck.sessionIndex - k2.avDays)].time), cx2 = Object.assign({}, cx, { anchorT: ancT });
        const arr = indMulti(f, 'avT', N.ind.avwapT, cx2, forming, [v => v.m, v => v.m + v.s, v => v.m - v.s, v => v.m + 2 * v.s, v => v.m - 2 * v.s, v => v.m + 3 * v.s, v => v.m - 3 * v.s]);
        overlays.push({ key: 'av', label: 'AVWAP', color: COL.av, width: 2, vals: arr[0] });
        if (k2.b1) { overlays.push({ key: 'av1u', color: COL.b1, width: 1, vals: arr[1], hide: 1 }, { key: 'av1d', color: COL.b1, width: 1, vals: arr[2], hide: 1 }); }
        if (k2.b2) { overlays.push({ key: 'av2u', color: COL.b2, width: 1, vals: arr[3], hide: 1 }, { key: 'av2d', color: COL.b2, width: 1, vals: arr[4], hide: 1 }); }
        if (k2.b3) { overlays.push({ key: 'av3u', color: COL.b3, width: 1, vals: arr[5], hide: 1 }, { key: 'av3d', color: COL.b3, width: 1, vals: arr[6], hide: 1 }); }
      }
      if (k2.adx) {
        const cc = S.ic.adx; const key = f.key; let base = cc && cc.key === key ? cc : (S.ic.adx = { key, res: N.foldInd(N.ind.adx(14), f.view.slice(0, f.formIdx), cx) });
        const st = Object.assign({}, base.res.st), v = N.ind.adx(14).step(st, forming, cx) || (base.res.vals.length ? base.res.vals[base.res.vals.length - 1].value : null);
        if (v && v.adx != null) {
          const strong = v.adx >= 25, bull = v.pdi > v.mdi, col = v.adx >= 25 ? (bull ? '#26a69a' : '#ef5350') : '#8a93a6';
          hud = { title: 'ADX · DMI 14', rows: [['ADX', v.adx.toFixed(1), col], ['+DI', v.pdi.toFixed(1), '#26a69a'], ['−DI', v.mdi.toFixed(1), '#ef5350'], ['Trend', v.adx < 20 ? 'Weak / range' : v.adx < 25 ? 'Building' : v.adx < 40 ? (bull ? 'Strong ▲' : 'Strong ▼') : (bull ? 'Very strong ▲' : 'Very strong ▼'), col]] };
        }
      }
      // ---- indicator-pack shapes (cached; recomputed per closed bar, throttled) ----
      if (c.pk1.on || k2.vb) {
        const pkey = packKey(c), nowT = performance.now();
        if (!S.pk || S.pk.pkey !== pkey || (S.pk.fkey !== f.key && nowT - S.pk.t > 160)) {
          const closed = f.view.slice(0, f.formIdx); let sh = [], hawk = null;
          if (c.pk1.on) sh = sh.concat(N.packs.compute1(closed, Object.assign({}, c.pk1, { labels: c.pk1.labels }), c.upColor, c.downColor));
          if (k2.vb) { const r = N.packs.compute2(closed, { preset: k2.vbPreset, labels: k2.labels, lines: k2.vbLines }, trendOf); sh = sh.concat(r.shapes); hawk = r.hawk; }
          S.pk = { pkey, fkey: f.key, t: nowT, shapes: sh, hawk };
        }
        shapes = S.pk.shapes; hawkD = S.pk.hawk;
      }
      // levels
      const lv = M.levelsFor(ck.sessionIndex), L = c.lv;
      const sIdx = intr ? firstIdxOfSession(f.view, ck.sessionIndex) : null, startOf = k => !intr ? null : k === 'pd' ? sIdx : firstIdxOfSession(f.view, M.periodStartSession(ck.sessionIndex, k === 'pw' ? 'W' : 'M'));
      const grp = (key, nm, col) => {
        const t = L[key], fl = lv[key]; if (!fl || (!t.hl && !t.fib)) return; const fi = startOf(key);
        if (t.hl) { lines.push({ price: fl.hi, color: col, label: nm + 'H', fromIdx: fi, width: key === 'pd' ? 1.2 : key === 'pw' ? 1.8 : 2.4 }); lines.push({ price: fl.lo, color: col, label: nm + 'L', fromIdx: fi, width: key === 'pd' ? 1.2 : key === 'pw' ? 1.8 : 2.4 }); }
        if (t.fib) {
          const fc = c.theme === 'dark' ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)';
          lines.push({ price: fl.l0, color: col, label: nm + ' 0', dashed: true, alpha: .8, fromIdx: fi }, { price: fl.l50, color: fc, label: nm + ' .5', dashed: true, tag: false, fromIdx: fi }, { price: fl.l618, color: fc, label: nm + ' .618', dashed: true, tag: false, fromIdx: fi }, { price: fl.l786, color: fc, label: nm + ' .786', dashed: true, tag: false, fromIdx: fi }, { price: fl.l100, color: col, label: nm + ' 1', dashed: true, alpha: .8, fromIdx: fi });
          zones.push({ from: fl.l50, to: fl.l618, color: 'rgba(255,193,7,.16)', fromIdx: fi });
        }
      };
      grp('pd', 'PD', COL.pd); grp('pw', 'PW', COL.pw); grp('pm', 'PM', COL.pm);
      if (L.dayo || L.dayhl || (L.orb && intr)) {
        const ds = M.dayStats(ck, part);
        if (L.dayo) lines.push({ price: ds.open, color: COL.dayo, label: 'Day O', dashed: true, fromIdx: sIdx });
        if (L.dayhl) { lines.push({ price: ds.high, color: COL.dayhl, label: 'Day H', fromIdx: sIdx }, { price: ds.low, color: COL.dayhl, label: 'Day L', fromIdx: sIdx }); }
        if (L.orb && intr) { lines.push({ price: ds.orbH, color: COL.orb, label: 'ORB H', dashed: ds.orbDone ? false : true, fromIdx: sIdx }, { price: ds.orbL, color: COL.orb, label: 'ORB L', dashed: ds.orbDone ? false : true, fromIdx: sIdx }); }
      }
    }
    // user lines
    S.userLines.forEach(u => lines.push({ id: u.id, kind: 'user', price: u.price, color: '#f59e0b', width: 1.3, draggable: true, deletable: true, pill: 'My line', pillBg: '#b45309' }));
    // position / plan
    const P = S.pos;
    if (P) {
      const risk = P.risk > 0 ? P.risk : 1, rOf = px => ((px - P.entry) * P.dir) / risk;
      const net = pnlOf(P, price);
      lines.push({ id: 'entry', price: P.entry, color: '#94a3b8', width: 1.4, autoscale: true, pill: (P.dir === 1 ? 'LONG ' : 'SHORT ') + P.qty + ' · ' + N.sgnInr(net, 0), pillBg: net >= 0 ? '#15803d' : '#b91c1c' });
      const mk = (id, px, col, nm) => {
        const mirror = p => id === 'tp' ? validTP(P, p, price) : validSL(P, p, price);
        return { id, price: px, color: col, dashed: true, width: 1.8, draggable: true, autoscale: true, pill: nm + ' ' + N.sgnInr(pnlOf(P, px), 0) + ' · ' + rOf(px).toFixed(1) + 'R', dragPill: p => { const q = mirror(c.snapTicks ? N.roundTick(p) : p); return nm + ' ' + N.sgnInr(pnlOf(P, q), 0) + ' · ' + rOf(q).toFixed(1) + 'R'; } };
      };
      lines.push(mk('tp', P.tp, '#16a34a', 'TP'), mk('sl', P.sl, '#dc2626', 'SL'));
    } else if (c.plan) {
      const tp = ptsOf('sideTp'), sl = ptsOf('sideSl'), q = Math.max(1, parseInt($('sideQty').value) || 1), d = S.plan.dir;
      lines.push({ id: 'plan-tp', price: price + d * tp, color: '#16a34a', dashed: true, width: 1.4, alpha: .6, draggable: true, autoscale: true, pill: 'Plan TP ' + (d === 1 ? 'BUY' : 'SELL') + ' +' + tp.toFixed(2) + ' · ' + N.sgnInr(tp * q, 0), pillBg: 'rgba(22,163,74,.6)', tag: false, dragPill: p => { const x = Math.abs(p - price); return 'Plan TP +' + x.toFixed(2) + ' · ' + N.sgnInr(x * q, 0); } });
      lines.push({ id: 'plan-sl', price: price - d * sl, color: '#dc2626', dashed: true, width: 1.4, alpha: .6, draggable: true, autoscale: true, pill: 'Plan SL −' + sl.toFixed(2) + ' · ' + N.sgnInr(-sl * q, 0), pillBg: 'rgba(220,38,38,.6)', tag: false, dragPill: p => { const x = Math.abs(p - price); return 'Plan SL −' + x.toFixed(2) + ' · ' + N.sgnInr(-x * q, 0); } });
    }
    // countdown
    let cd = null;
    if (intr) cd = fmtRemain((Math.min((Math.floor(ck.minuteOfDay / tf) + 1) * tf, N.SESSION_MIN)) * 60 - (ck.minuteOfDay * 60 + ck.sec));
    else if (tf === 'D') cd = fmtRemain(N.SESSION_MIN * 60 - (ck.minuteOfDay * 60 + ck.sec));
    chart.setData({ shapes, hud, vol: { on: !naked && c.ind.vol, pct: c.pk2.vb ? 0.25 : c.volPct, hawk: !naked && c.pk2.vb ? hawkD : null, showMa: c.pk2.vbMa, alpha: c.pk2.vb ? 0.55 : 0.5 }, candles: f.view, overlays, lines, zones, sub, maxEndFloat: f.maxEndFloat, tf, style: c.style, countdown: cd, symbol: M.ticker, tfLabel: N.tfLabel(tf) });
    chart.render();
    // header
    el('px').textContent = '₹' + price.toFixed(2);
    const day = M.sessions[ck.sessionIndex], prevClose = ck.sessionIndex > 0 ? M.sessions[ck.sessionIndex - 1].close : day.open, chg = price - prevClose;
    el('chg').textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + ' (' + (chg >= 0 ? '+' : '') + (chg / prevClose * 100).toFixed(2) + '%)';
    el('chg').className = 'num ' + (chg >= 0 ? 'up' : 'down'); el('px').className = 'num ' + (chg >= 0 ? 'up' : 'down');
    const now = performance.now();
    if (now - S.lastPanel > 90) { S.lastPanel = now; renderPanels(false); }
  }
  function ptsOf(id) { const v = parseFloat($(id).value); if (v > 0) return v; const p = S.price || 100; return Math.max(0.1, N.roundTick(p * (id === 'sideTp' ? C().defTpPct : C().defSlPct) / 100)); }

  /* ======================= side-panel live updates ======================= */
  function renderPanels(force) {
    if (!M.base1m.length) return;
    const P = S.pos, price = S.price, ck = M.clock(S.sec), simT = ck.time;
    // replay clock + status
    el('rpClock').textContent = N.fmtHM(simT) + ':' + String(Math.floor(simT) % 60).padStart(2, '0'); el('rpDate').textContent = N.fmtDMY(simT);
    // position card
    const dis = (id, v) => { $(id).disabled = v; };
    ['sideBuy', 'sideSell', 'dockBuy', 'dockSell'].forEach(i => dis(i, !!P)); ['posClose', 'posRev', 'dockClose', 'dockRev', 'chBE', 'chTP1', 'chTP2', 'chTP3', 'chTrail'].forEach(i => dis(i, !P));
    if (!P) {
      el('posPill').textContent = 'FLAT'; el('posPill').className = 'pill'; el('posPnl').textContent = '₹0'; el('posPnl').className = 'bigpnl'; el('posPnlSub').textContent = 'no open trade'; el('posHold').textContent = '';
      ['posEntry', 'posQty', 'posTp', 'posSl', 'posRiskReward', 'posExc'].forEach(i => el(i).textContent = '—'); el('chTrail').classList.remove('on');
    } else {
      const gross = pnlOf(P, price), est = N.tradeCharges(P.dir, P.entry, price, P.qty, P.seg).total, net = gross - est, risk = P.risk > 0 ? P.risk : 1;
      el('posPill').textContent = P.dir === 1 ? 'LONG' : 'SHORT'; el('posPill').className = 'pill ' + (P.dir === 1 ? 'long' : 'short');
      el('posPnl').textContent = N.sgnInr(net, 2); el('posPnl').className = 'bigpnl ' + (net >= 0 ? 'pos' : 'neg');
      el('posPnlSub').textContent = 'gross ' + N.sgnInr(gross, 2) + ' · ' + (net / (risk * P.qty)).toFixed(2) + 'R net';
      el('posHold').textContent = N.dur(S.sec - P.openSec);
      el('posEntry').textContent = '₹' + P.entry.toFixed(2); el('posQty').textContent = P.qty; el('posTp').textContent = '₹' + P.tp.toFixed(2) + ' (' + N.sgnInr(pnlOf(P, P.tp), 0) + ')'; el('posSl').textContent = '₹' + P.sl.toFixed(2) + ' (' + N.sgnInr(pnlOf(P, P.sl), 0) + ')';
      el('posRiskReward').textContent = N.inr(Math.abs(pnlOf(P, P.sl)), 0) + ' · ' + N.inr(Math.abs(pnlOf(P, P.tp)), 0) + ' (' + (Math.abs(P.tp - P.entry) / Math.max(1e-9, Math.abs(P.entry - P.sl))).toFixed(2) + 'R)';
      el('posExc').textContent = (P.mfe / risk).toFixed(2) + 'R · ' + (P.mae / risk).toFixed(2) + 'R'; el('chTrail').classList.toggle('on', !!P.trail.on);
    }
    // ticket helpers
    const tp = ptsOf('sideTp'), sl = ptsOf('sideSl'), q = Math.max(1, parseInt($('sideQty').value) || 1);
    el('tkRR').textContent = '1 : ' + (tp / sl).toFixed(2); el('dockRR').textContent = 'RR 1:' + (tp / sl).toFixed(1);
    el('tkRiskRew').textContent = N.inr(sl * q, 0) + ' · ' + N.inr(tp * q, 0);
    // snapshot
    const ds = M.dayStats(ck, M.partialBar(ck.pi, ck.sec)), rg = ds.high - ds.low;
    el('sesOpen').textContent = '₹' + ds.open.toFixed(2); el('sesHigh').textContent = '₹' + ds.high.toFixed(2); el('sesLow').textContent = '₹' + ds.low.toFixed(2); el('sesRange').textContent = rg.toFixed(2) + ' (' + (rg / ds.open * 100).toFixed(2) + '%)';
    el('sesTrend').textContent = price > ds.open * 1.002 ? 'Trending up' : price < ds.open * 0.998 ? 'Trending down' : 'Range-bound'; el('sesTrend').className = price > ds.open * 1.002 ? 'pos' : price < ds.open * 0.998 ? 'neg' : '';
    // status bar
    el('stSeed').textContent = M.ticker + ' · seed ' + M.seed; el('stDate').textContent = N.fmtDMY(simT) + ' ' + el('rpClock').textContent + ' IST';
    el('stProg').style.width = Math.max(0, Math.min(100, (S.sec - M.startSec) / (M.maxSec - M.startSec) * 100)) + '%';
    el('stMode').innerHTML = S.playing ? '<b class="up">● LIVE</b> ' + (S.speed === 1 ? 'real-time' : S.speed + '×') : '<b style="color:var(--warn)">❚❚ PAUSED</b>';
    updateTotals();
  }
  let totalsKey = '';
  function updateTotals() {
    const L = N.tradeStore.list, k = L.length + ':' + (L.length ? L[L.length - 1].id : '') + ':' + (S.pos ? Math.round(S.price * 20) + S.pos.entry : 0); if (k === totalsKey) return; totalsKey = k;
    const today = new Date().toDateString(); let tn = 0, an = 0; L.forEach(t => { an += t.net; if (new Date(t.ts).toDateString() === today) tn += t.net; });
    el('stToday').innerHTML = 'Today <b class="' + (tn >= 0 ? 'up' : 'down') + '">' + N.sgnInr(tn, 0) + '</b>'; el('stNet').innerHTML = 'All-time <b class="' + (an >= 0 ? 'up' : 'down') + '">' + N.sgnInr(an, 0) + '</b> · ' + L.length + ' trades';
  }
  N.refreshAll = function () { totalsKey = ''; updateTotals(); if (C().tab === 'stats') N.renderStats(); if (C().tab === 'journal') N.renderJournal(); refresh(); };

  /* ======================= trading ======================= */
  function openPos(dir) {
    if (S.pos) { N.sfx.error(); return; }
    if (S.sec >= M.maxSec - 1) { N.toast('End of this chart — load a new one', 'info'); return; }
    N.sfx.unlock();
    const qty = Math.max(1, parseInt($('sideQty').value) || 1), tp = ptsOf('sideTp'), sl = ptsOf('sideSl'), slip = C().slipTicks * TICK;
    const entry = r2(M.priceAt(S.sec) + dir * slip), ck = M.clock(S.sec);
    S.pos = { dir, entry, qty, tp: r2(entry + dir * tp), sl: r2(entry - dir * sl), risk: sl, openSec: S.sec, openClock: N.fmtHM(ck.time), mfe: 0, mae: 0, ext: entry, trail: { on: false, pts: C().trailPts > 0 ? C().trailPts : sl }, trailed: false, seg: C().segment, seed: M.seed, tf: C().tf, sym: M.ticker };
    S.plan.dir = dir; dir === 1 ? N.sfx.buy() : N.sfx.sell();
    N.toast((dir === 1 ? 'Bought ' : 'Sold ') + qty + ' @ ₹' + entry.toFixed(2), 'info'); refresh(); renderPanels(true);
  }
  function closePos(price, reason) {
    const P = S.pos; if (!P) return; S.pos = null;
    const gross = (price - P.entry) * P.dir * P.qty, ch = N.tradeCharges(P.dir, P.entry, price, P.qty, P.seg).total, net = gross - ch, risk = P.risk > 0 ? P.risk : null;
    const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), sym: P.sym, seed: P.seed, tf: P.tf, dir: P.dir, entry: P.entry, exit: r2(price), qty: P.qty, gross: r2(gross), charges: r2(ch), net: r2(net), reason, risk, r: risk ? r2(net / (risk * P.qty)) : null, mfe: r2(P.mfe), mae: r2(P.mae), t0: P.openSec, t1: S.sec, dur: Math.round(S.sec - P.openSec), clock: P.openClock, tag: '', note: '', seg: P.seg };
    N.tradeStore.add(t);
    if (reason === 'TP') N.sfx.tp(); else if (reason === 'SL') (net >= 0 ? N.sfx.win() : N.sfx.sl()); else (net >= 0 ? N.sfx.win() : N.sfx.loss());
    N.toast(reason + ' · ' + N.sgnInr(net, 2) + ' (' + (t.r != null ? t.r.toFixed(2) + 'R' : '—') + ')', net >= 0 ? 'win' : 'loss');
    N.refreshAll(); renderPanels(true);
  }
  function closeMarket(reason) { const P = S.pos; if (!P) return; closePos(r2(M.priceAt(S.sec) - P.dir * C().slipTicks * TICK), reason || 'MANUAL'); }
  function reversePos() {
    const P = S.pos; if (!P) return; const d = -P.dir, q = P.qty; closeMarket('REVERSE');
    $('sideQty').value = q; syncQty('sideQty'); openPos(d);
  }
  N.applyTicket = function (qty, slPts, tpPts) { $('sideQty').value = qty; syncQty('sideQty'); if (slPts > 0) $('sideSl').value = r2(slPts); if (tpPts > 0) $('sideTp').value = r2(tpPts); refresh(); N.toast('Ticket updated', 'info'); };

  // process one tick: update excursions, trailing, check exits. returns {price, reason} or null
  function checkTick(price) {
    const P = S.pos; if (!P) return null;
    const fav = (price - P.entry) * P.dir; if (fav > P.mfe) P.mfe = fav; if (-fav > P.mae) P.mae = -fav;
    if (P.trail.on) {
      if (P.dir === 1) { if (price > P.ext) P.ext = price; const ns = N.roundTick(P.ext - P.trail.pts); if (ns > P.sl) { P.sl = r2(ns); P.trailed = true; } }
      else { if (price < P.ext) P.ext = price; const ns = N.roundTick(P.ext + P.trail.pts); if (ns < P.sl) { P.sl = r2(ns); P.trailed = true; } }
    }
    const slip = C().slipTicks * TICK;
    if (P.dir === 1) { if (price <= P.sl) return { price: r2(Math.min(P.sl, price) - slip), reason: P.trailed ? 'TRAIL' : 'SL' }; if (price >= P.tp) return { price: P.tp, reason: 'TP' }; }
    else { if (price >= P.sl) return { price: r2(Math.max(P.sl, price) + slip), reason: P.trailed ? 'TRAIL' : 'SL' }; if (price <= P.tp) return { price: P.tp, reason: 'TP' }; }
    return null;
  }
  // advance the replay clock, scanning every tick while a position is open
  function advanceTo(target) {
    target = Math.min(target, M.maxSec); let guard = 0;
    while (S.sec < target && guard++ < 4000) {
      const pi = Math.min(M.base1m.length - 1, Math.floor(S.sec / 60)), segEnd = Math.min(target, (pi + 1) * 60);
      if (S.pos) {
        const s0 = S.sec - pi * 60, s1 = segEnd - pi * 60, p = M.pathFor(pi);
        let j = s0 <= 0 ? 0 : M.idxAt(p, s0) + 1, hit = null;
        for (; j < p.n && p.ts[j] <= s1; j++) { hit = checkTick(p.ps[j]); if (hit) { S.sec = pi * 60 + p.ts[j]; break; } }
        if (hit) { closePos(hit.price, hit.reason); if (C().pauseOnExit) { pause(); return; } continue; }
      }
      S.sec = segEnd;
    }
  }
  $('chBE').onclick = () => { const P = S.pos; if (!P) return; const px = S.price; if ((P.dir === 1 && px <= P.entry) || (P.dir === -1 && px >= P.entry)) { N.toast('Price must be in profit to move the stop to breakeven', 'info'); N.sfx.error(); return; } P.sl = P.entry; N.sfx.drop(); refresh(); };
  [1, 2, 3].forEach(R => { $('chTP' + R).onclick = () => { const P = S.pos; if (!P) return; P.tp = r2(validTP(P, P.entry + P.dir * P.risk * R, S.price)); N.sfx.drop(); refresh(); }; });
  $('chTrail').onclick = () => { const P = S.pos; if (!P) return; P.trail.on = !P.trail.on; P.ext = P.dir === 1 ? Math.max(P.entry, S.price) : Math.min(P.entry, S.price); N.toast(P.trail.on ? 'Trailing stop ON (' + P.trail.pts.toFixed(2) + ' pts)' : 'Trailing stop off', 'info'); N.sfx.click(); refresh(); };

  /* ======================= chart hooks (drag / draw) ======================= */
  const snap = p => C().snapTicks ? r2(N.roundTick(p)) : r2(p);
  chart.hooks = {
    onFollow: f => $('jumpLive').classList.toggle('show', !f),
    onLineGrab: () => { N.sfx.click(); },
    onLineDrop: (l, price) => {
      if (price == null) return; price = snap(price); const P = S.pos;
      if (l.id === 'tp' && P) P.tp = r2(validTP(P, price, S.price));
      else if (l.id === 'sl' && P) P.sl = r2(validSL(P, price, S.price));
      else if (l.id === 'plan-tp') { $('sideTp').value = Math.max(0.05, r2(Math.abs(price - S.price))).toFixed(2); }
      else if (l.id === 'plan-sl') { $('sideSl').value = Math.max(0.05, r2(Math.abs(price - S.price))).toFixed(2); }
      else if (l.kind === 'user') { const u = S.userLines.find(x => x.id === l.id); if (u) u.price = price; }
      N.sfx.drop(); refresh(); renderPanels(true);
    },
    onAnchor: t => { C().anchorT = t; C().pk2.av = true; N.saveCfg(); setTool('cursor'); N.sfx.drop(); N.toast('Anchored VWAP set at ' + N.fmtFull(t, C().tf), 'info'); refreshHeader(); refresh(); },
    onHline: price => { S.userLines.push({ id: 'u' + (S.uid++), price: snap(price) }); setTool('cursor'); N.sfx.drop(); refresh(); },
    onLineDelete: l => { S.userLines = S.userLines.filter(u => u.id !== l.id); N.sfx.click(); refresh(); }
  };

  /* ======================= replay controls ======================= */
  const SPEEDS = [[1, '1× real-time'], [2, '2×'], [5, '5×'], [10, '10×'], [30, '30×'], [60, '60× · 1m/s'], [120, '120×'], [300, '300× · 5m/s'], [900, '900× · 15m/s'], [3600, '3600× · 1h/s']];
  const sp = $('rpSpeed'); SPEEDS.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sp.appendChild(o); });
  function setSpeed(v) { S.speed = v; sp.value = String(v); C().speed = v; N.saveCfg(); renderPanels(true); }
  sp.onchange = () => { setSpeed(parseFloat(sp.value)); if (!S.playing) play(); };
  function loop(now) {
    if (!S.playing) return;
    const dt = Math.min(0.25, (now - S.lastReal) / 1000); S.lastReal = now;
    if (S.sec >= M.maxSec - 0.5) { pause(); N.toast('End of this chart — load a new one', 'info'); return; }
    advanceTo(S.sec + dt * S.speed); refresh();
    if (S.playing) S.raf = requestAnimationFrame(loop);
  }
  function play() { if (S.playing) return; N.sfx.unlock(); S.playing = true; S.lastReal = performance.now(); S.raf = requestAnimationFrame(loop); N.setIcon($('rpPlayIc'), 'pause'); renderPanels(true); }
  function pause() { S.playing = false; if (S.pk) S.pk.fkey = '';  cancelAnimationFrame(S.raf); N.setIcon($('rpPlayIc'), 'play'); renderPanels(true); }
  const toggle = () => S.playing ? pause() : play();
  function boundary(skip) {
    const ck = M.clock(S.sec), m = ck.minuteOfDay, tf = C().tf; let mins;
    if (skip || !N.isIntraday(tf)) mins = N.SESSION_MIN - m; else mins = Math.min(tf - (m % tf), N.SESSION_MIN - m);
    return (ck.pi + mins) * 60;
  }
  function step(skip) { pause(); const t = boundary(skip); advanceTo(t); refresh(); }
  $('rpPlay').onclick = toggle; $('rpStep').onclick = () => step(false); $('rpSkip').onclick = () => step(true);
  $('rpRestart').onclick = () => restart();
  function restart() { pause(); if (S.pos) closeMarket('RESTART'); S.sec = M.startSec; chart.resetView(); refresh(); play(); }
  $('jumpLive').onclick = () => { chart.resetView(); refresh(); };

  /* ======================= loading charts ======================= */
  function setPlanDefaults(p) { $('sideTp').value = Math.max(0.1, N.roundTick(p * C().defTpPct / 100)).toFixed(2); $('sideSl').value = Math.max(0.1, N.roundTick(p * C().defSlPct / 100)).toFixed(2); }
  function loadSeed(seed, startSec, paused) {
    pause(); if (S.pos) closeMarket('NEXT');
    M.generate(seed); M.setDensity(C().tickDensity);
    S.sec = startSec != null ? startSec : M.startSec; S.ic = {}; S.userLines = []; S.lastKey = ''; chart.measure = null;
    const p = M.priceAt(S.sec); S.price = p; setPlanDefaults(p); N.rcSetEntry(p);
    chart.resetView(); refreshHeader(); refresh(); renderPanels(true);
    if (!paused) play();
  }
  N.loadSeed = (seed) => loadSeed(seed);
  function newChart() { loadSeed(0); N.sfx.click(); }
  N.reviewTrade = t => { if (!t.seed) return; const start = Math.max(0, (t.t0 != null ? t.t0 : M.startSec) - 2400); loadSeed(t.seed, start, true); if (mobile()) closeSide(); N.toast('Reviewing ' + t.sym + ' — chart paused 40 min before entry', 'info'); };

  /* ======================= quantity / ticket wiring ======================= */
  function syncQty(from) { const v = Math.max(1, parseInt($(from).value) || 1); $('sideQty').value = v; $('dockQty').value = v; }
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const inp = b.parentElement.querySelector('input'); inp.value = Math.max(1, (parseInt(inp.value) || 1) + parseInt(b.dataset.step)); syncQty(inp.id); refresh(); });
  $('sideQty').addEventListener('input', () => { syncQty('sideQty'); refresh(); }); $('dockQty').addEventListener('input', () => { syncQty('dockQty'); refresh(); });
  ['sideTp', 'sideSl'].forEach(i => $(i).addEventListener('input', refresh));
  $('btnSize').onclick = () => { const rp = parseFloat($('tkRiskPct').value) || 1, sl = ptsOf('sideSl'), q = Math.max(1, Math.floor(C().capital * rp / 100 / sl)); $('sideQty').value = q; syncQty('sideQty'); N.toast('Qty ' + q + ' = ' + rp + '% of ' + N.inr(C().capital) + ' risk', 'info'); refresh(); };
  $('sideBuy').onclick = $('dockBuy').onclick = () => openPos(1); $('sideSell').onclick = $('dockSell').onclick = () => openPos(-1);
  $('posClose').onclick = $('dockClose').onclick = () => closeMarket('MANUAL'); $('posRev').onclick = $('dockRev').onclick = reversePos;
  [['sideBuy', 1], ['sideSell', -1], ['dockBuy', 1], ['dockSell', -1]].forEach(([id, d]) => $(id).addEventListener('mouseenter', () => { if (!S.pos && S.plan.dir !== d) { S.plan.dir = d; refresh(); } }));

  /* ======================= side panel / tabs / resizer ======================= */
  function setTab(t) {
    C().tab = t; N.saveCfg();
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.tp').forEach(p => p.classList.toggle('on', p.id === 'tab-' + t));
    if (t === 'stats') N.renderStats(); if (t === 'journal') N.renderJournal();
  }
  document.querySelectorAll('.stab').forEach(b => b.onclick = () => { N.sfx.click(); setTab(b.dataset.tab); });
  function closeSide() { $('side').classList.remove('mob-open'); }
  function toggleSide() {
    if (mobile()) { $('side').classList.toggle('mob-open'); if ($('side').classList.contains('mob-open')) setTab(C().tab); }
    else { const col = $('side').classList.toggle('collapsed'); $('resizer').classList.toggle('collapsed', col); C().side = !col; N.saveCfg(); setTimeout(() => chart.resize(), 30); if (!col) setTab(C().tab); }
  }
  $('btnSide').onclick = toggleSide; $('sideClose').onclick = closeSide;
  (function resizer() {
    const rz = $('resizer'); let on = false;
    rz.addEventListener('pointerdown', e => { on = true; rz.classList.add('active'); rz.setPointerCapture(e.pointerId); });
    rz.addEventListener('pointermove', e => { if (!on) return; const w = N.clamp(window.innerWidth - e.clientX, 280, 640); document.documentElement.style.setProperty('--panel-width', w + 'px'); C().panelW = w; });
    const end = () => { if (!on) return; on = false; rz.classList.remove('active'); N.saveCfg(); chart.resize(); if (C().tab === 'stats') N.renderStats(); };
    rz.addEventListener('pointerup', end); rz.addEventListener('pointercancel', end);
    rz.addEventListener('dblclick', () => { document.documentElement.style.setProperty('--panel-width', '360px'); C().panelW = 360; N.saveCfg(); chart.resize(); });
  })();

  /* ======================= hotkeys ======================= */
  document.addEventListener('keydown', e => {
    const tg = (e.target.tagName || '').toLowerCase(); if (tg === 'input' || tg === 'select' || tg === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('modal').classList.contains('show')) return;
    const k = e.key.toLowerCase();
    if (k === 'b') openPos(1); else if (k === 's') openPos(-1); else if (k === 'c') closeMarket('MANUAL'); else if (k === 'v') reversePos();
    else if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'r') restart(); else if (k === 'n') newChart(); else if (k === 'h') toggleNaked(); else if (k === 't') $('btnTheme').click();
    else if (k === 'm') setTool(S.tool === 'measure' ? 'cursor' : 'measure'); else if (k === 'l') setTool(S.tool === 'hline' ? 'cursor' : 'hline'); else if (k === 'escape') { setTool('cursor'); chart.measure = null; chart.sticky = null; chart.render(); N.closeMenu(); }
    else if (k === 'e') $('chBE').click(); else if (k === 'arrowright') { e.preventDefault(); step(e.shiftKey); }
    else if (k === '[' || k === ']') { const i = SPEEDS.findIndex(s => s[0] === S.speed); const j = N.clamp(i + (k === ']' ? 1 : -1), 0, SPEEDS.length - 1); setSpeed(SPEEDS[j][0]); }
    else if (k >= '1' && k <= '9') { const tf = N.TF_ORDER[parseInt(k, 10) - 1]; if (tf !== undefined) setTf(tf); }
  });


  /* ======================= footer: range, scale, clock ======================= */
  function setRange(key) {
    const tf = C().tf, per = { '1D': 1, '5D': 5, '1M': 22, '3M': 66, '6M': 130 }[key];
    chart.followLatest = true; chart.hooks.onFollow(true); chart.autoY = true; chart.manualLo = chart.manualHi = null; chart.sticky = null;
    const n = chart.d.candles.length; let bars;
    if (key === 'All') bars = n; else if (typeof tf === 'number') bars = per * N.SESSION_MIN / tf; else if (tf === 'D') bars = per; else if (tf === 'W') bars = per / 5; else bars = per / 22;
    chart.viewCount = N.clamp(Math.round(bars), 12, Math.max(12, n)); chart.render(); N.sfx.click();
    document.querySelectorAll('#stRanges button').forEach(b => b.classList.toggle('on', b.dataset.r === key)); setTimeout(() => document.querySelectorAll('#stRanges button').forEach(b => b.classList.remove('on')), 900);
  }
  document.querySelectorAll('#stRanges button').forEach(b => b.onclick = () => setRange(b.dataset.r));
  document.querySelectorAll('#stScale button').forEach(b => b.onclick = () => {
    const m = b.dataset.s; const cur = chart.scaleMode; const nx = (m === 'auto') ? 'auto' : (cur === m ? 'auto' : m);
    if (m === 'auto') { chart.resetPrice(); } chart.setScale(nx);
    document.querySelectorAll('#stScale button').forEach(x => x.classList.toggle('on', x.dataset.s === nx && nx !== 'auto')); N.sfx.click();
  });

  /* ======================= boot ======================= */
  function boot() {
    if (C().sub === 'volume') { C().sub = 'none'; C().ind.vol = true; N.saveCfg(); }
    N.hydrate(); applyTheme(); N.statsInit(); N.rcInit(); N.settingsInit();
    document.documentElement.style.setProperty('--panel-width', C().panelW + 'px');
    if (!C().side && !mobile()) { $('side').classList.add('collapsed'); $('resizer').classList.add('collapsed'); }
    $('sideQty').value = C().defQty; $('dockQty').value = C().defQty;
    $('watermark').style.display = C().showWatermark ? '' : 'none';
    buildTfSeg(); syncRail(); setSpeed(C().speed); setTab(C().tab || 'trade');
    M.setDensity(C().tickDensity);
    loadSeed(0, null, true); play();
    window.addEventListener('resize', () => { chart.resize(); });
    setTimeout(() => { const s = $('splash'); s.classList.add('hide'); setTimeout(() => s.remove(), 650); }, 900);
  }
  boot();
})(window.NTI);
