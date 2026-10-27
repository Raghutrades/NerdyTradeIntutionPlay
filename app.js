/* NerdyTradeIntuition — application: replay engine, trading, chart data, UI wiring */
(function (N) {
  'use strict';
  const $ = N.$, M = N.market, TICK = N.TICK, r2 = N.r2;
  const C = () => N.cfg;
  const S = N.S = { sec: 0, playing: false, speed: 1, lastReal: 0, raf: 0, pos: null, tool: 'cursor', userLines: [], draws: [], plan: { dir: 1 }, ic: {}, price: 0, lastKey: '', uid: 1, lastPanel: 0, lastStatus: 0 };
  const chart = N.chart = new N.Chart($('chartCanvas'));
  const el = id => $(id);
  const mobile = () => window.matchMedia('(max-width:860px)').matches;
  const dayKey = t => Math.floor((t + 19800) / 86400);
  const st = N.sty, H = k => !!C().hidden[k], e200c = () => (C().sty && C().sty.e200 && C().sty.e200.c) || (N.isDark() ? '#ffffff' : '#555a66');
  const COL = new Proxy({}, { get: (_, k) => (k === 'e200' ? e200c() : st(k).c) });

  /* ======================= theme / config ======================= */
  function applyTheme() {
    if (!N.THEMES[C().theme]) C().theme = 'dark';
    N.applyThemeVars();
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    chart.colors = { bg: v('--chartbg'), grid: v('--grid'), axis: v('--border'), text: v('--text'), dim: v('--dim'), cross: N.isDark() ? '#8a93a6' : '#6a6d78', tag: v('--panel2'), accent: v('--accent') };
    $('metaTheme').setAttribute('content', v('--panel'));
    N.setIcon($('themeIc'), N.isDark() ? 'moon' : 'sun'); applyBrand();
  }
  N.restyle = () => { S.pk = null; refresh(); renderObjects(); };
  N.cfgChanged = function (k) {
    if (k === 'ui') { applyUi(); }
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
    $('btnInd').classList.toggle('on', indN > 0 && !c.naked); $('indBadge').textContent = indN || ''; $('indBadge').style.display = indN ? '' : 'none';
    $('btnLevels').classList.toggle('on', lvN > 0 && !c.naked); $('lvBadge').textContent = lvN || ''; $('lvBadge').style.display = lvN ? '' : 'none';
    $('btnNaked').classList.toggle('on', c.naked); N.setIcon($('nakedIc'), c.naked ? 'eyeoff' : 'eye');
    const s = STYLES.find(x => x[0] === c.style) || STYLES[0]; N.setIcon($('styleIc'), s[2]); $('btnStyle').title = 'Chart style: ' + s[1];
    $('wmTf').textContent = N.tfLabel(c.tf); $('wmSym').textContent = M.ticker; $('sym').textContent = M.ticker || '—';
    $('tkSeg').textContent = c.segment;
  }
  function toggleNaked() { C().naked = !C().naked; N.saveCfg(); refreshHeader(); refresh(); N.toast(C().naked ? 'Naked price — indicators & levels hidden' : 'Indicators & levels restored', 'info'); }
  $('btnNaked').onclick = toggleNaked;
  $('btnTheme').onclick = e => N.openMenu(e.currentTarget, () => [{ h: 'Theme' }].concat(Object.keys(N.THEMES).map(k => ({ label: N.THEMES[k].n, swatch: N.THEMES[k].c[1], on: C().theme === k, keep: 1, fn: () => { C().theme = k; N.saveCfg(); applyTheme(); refresh(); renderPanels(true); } }))), 'right');
  function applyBrand() {
    const nm = C().brand || 'NerdyTrade', m = /^([A-Z][a-z0-9]*)(.*)$/.exec(nm), html = m && m[2] ? N.esc(m[1]) + '<span>' + N.esc(m[2]) + '</span>' : N.esc(nm);
    $('brandName').innerHTML = html; const sp = document.querySelector('.sp-t'); if (sp) sp.innerHTML = html; document.title = nm + ' — Chart Practice';
    document.documentElement.classList.toggle('brandpulse', !!C().brandPulse);
  }
  N.applyBrand = applyBrand;
  $('btnSettings').onclick = () => N.openSettings(); $('btnAbout').onclick = () => N.openSettings('about');
  $('btnShot').onclick = () => chart.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = M.ticker + '-' + N.tfLabel(C().tf) + '-seed' + M.seed + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); N.toast('Screenshot saved', 'info'); });
  $('btnNext').onclick = () => newChart();

  /* ======================= rail / tools ======================= */
  const DRAWT = N.DRAW;
  const isDrawTool = t => !!DRAWT[t] || t === 'hline' || t === 'measure';
  function setTool(t) {
    S.tool = t; chart.setTool(t);
    $('toolCursor').classList.toggle('on', t === 'cursor'); $('toolDraw').classList.toggle('on', isDrawTool(t)); $('toolAnchor').classList.toggle('on', t === 'anchor');
    if (DRAWT[t]) N.setIcon($('toolDrawIc'), DRAWT[t].ic); else if (t === 'cursor') N.setIcon($('toolDrawIc'), 'pencil');
    if (typeof renderFav === 'function' && $('favBar').firstChild) $('favBar').querySelectorAll('[data-fav]').forEach(b => b.classList.toggle('on', b.dataset.fav === t));
  }
  function clearDrawings() { S.userLines = []; S.draws = []; chart.measure = null; chart.selDraw = null; histSnap(); refresh(); renderObjects(); renderSelBar(); }
  function syncRail() {
    const c = C(); $('railGrid').classList.toggle('on', c.gridMode !== 'none'); $('railBreaks').classList.toggle('on', c.showSessionBreaks); $('railCross').classList.toggle('on', c.showCrosshair);
    $('toolMagnet').classList.toggle('on', c.magnet); $('toolHideDraw').classList.toggle('on', c.hideDraw); N.setIcon($('toolHideDrawIc'), c.hideDraw ? 'eyeoff' : 'eye'); applyUi();
  }
  /* ---------- favourite drawing tools: star them in the menu, they appear in a draggable bar ---------- */
  const isFav = k => (C().favTools || []).includes(k);
  function toggleFav(k) { const l = C().favTools = (C().favTools || []).slice(); const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); N.saveCfg(); renderFav(); }
  const FAVN = { hline: ['Horizontal line', 'hline'], measure: ['Measure', 'ruler'] };
  function renderFav() {
    const el = $('favBar'), l = (C().favTools || []).filter(k => DRAWT[k] || FAVN[k]), on = C().ui.favbar !== false;
    el.classList.toggle('show', on); if (!on) return;
    el.innerHTML = '<span class="grip" id="favGrip" title="Drag to move · double-click to reset">' + N.icon('gripd', 14) + '</span>' + l.map(k => { const nm = DRAWT[k] ? [DRAWT[k].n, DRAWT[k].ic] : FAVN[k]; return '<button class="btn icon sm' + (S.tool === k ? ' on' : '') + '" data-fav="' + k + '" title="' + N.esc(nm[0]) + '">' + N.icon(nm[1], 18) + '</button>'; }).join('') + '<button class="btn icon sm" data-fav="_menu" title="All drawing tools · tap ☆ to favorite">' + N.icon('plus', 16) + '</button><button class="btn icon sm" data-fav="_x" title="Hide this bar (Settings → Floating panels)">' + N.icon('x', 14) + '</button>';
    el.querySelectorAll('[data-fav]').forEach(b => b.onclick = e => { const k = b.dataset.fav; N.sfx.click(); if (k === '_menu') { N.openMenu(b, drawMenu, 'left'); return; } if (k === '_x') { C().ui.favbar = false; N.saveCfg(); renderFav(); N.toast('Favorites bar hidden — bring it back from the ✏ draw menu → “Favorites bar”', 'info'); return; } setTool(S.tool === k ? 'cursor' : k); if (S.tool === k) N.toast((DRAWT[k] ? DRAWT[k].n : FAVN[k][0]) + ' — ' + (DRAWT[k] && DRAWT[k].pts === 1 || k === 'hline' ? 'tap the chart' : 'drag on the chart'), 'info'); });
    if (makeDragFav) makeDragFav(); applyPos(el, 'favPos');
  }
  let makeDragFav = null;
  const drawMenu = () => {
    const it = []; let g = '';
    Object.keys(DRAWT).forEach(k => {
      const d = DRAWT[k];
      if (d.g !== g) { g = d.g; it.push({ h: g }); if (g === 'Lines') it.push({ label: 'Horizontal line', icon: 'hline', star: isFav('hline'), starFn: () => toggleFav('hline'), on: S.tool === 'hline', kbd: 'L', fn: () => setTool(S.tool === 'hline' ? 'cursor' : 'hline') }); }
      it.push({ label: d.n, icon: d.ic, star: isFav(k), starFn: () => toggleFav(k), on: S.tool === k, fn: () => { setTool(S.tool === k ? 'cursor' : k); if (S.tool === k) N.toast(d.n + (d.pts === 'pos' ? ': tap the chart, or drag to set the target' : d.pts === 1 ? ': tap the chart' : d.pts === 'free' ? ': draw with your finger' : ': drag on the chart'), 'info'); } });
    });
    return it.concat([{ label: 'Measure', icon: 'ruler', on: S.tool === 'measure', kbd: 'M', fn: () => setTool(S.tool === 'measure' ? 'cursor' : 'measure') },
      { h: 'Options' }, { label: 'Magnet (snap to OHLC)', check: 1, on: C().magnet, keep: 1, fn: () => { C().magnet = !C().magnet; N.saveCfg(); syncRail(); } },
      { label: 'Stay in drawing mode', check: 1, on: C().stayDraw, keep: 1, fn: () => { C().stayDraw = !C().stayDraw; N.saveCfg(); } },
      { label: 'Favorites bar', check: 1, on: C().ui.favbar !== false, keep: 1, fn: () => { C().ui.favbar = C().ui.favbar === false; N.saveCfg(); renderFav(); } },
      { label: 'Lock all drawings', check: 1, on: C().lockDraw, keep: 1, fn: () => { C().lockDraw = !C().lockDraw; N.saveCfg(); } },
      { label: 'Hide all drawings', check: 1, on: C().hideDraw, keep: 1, fn: () => { C().hideDraw = !C().hideDraw; N.saveCfg(); syncRail(); refresh(); } },
      { label: 'Remove all drawings', icon: 'trash', fn: clearDrawings }]);
  };
  $('toolDraw').onclick = e => N.openMenu(e.currentTarget, drawMenu, 'left');
  $('toolCursor').onclick = () => setTool('cursor');
  $('toolMagnet').onclick = () => { C().magnet = !C().magnet; N.saveCfg(); syncRail(); N.toast('Magnet ' + (C().magnet ? 'on — drawings snap to O/H/L/C' : 'off'), 'info'); };
  $('toolHideDraw').onclick = () => { C().hideDraw = !C().hideDraw; N.saveCfg(); syncRail(); refresh(); };
  $('toolClear').onclick = clearDrawings; $('toolAnchor').onclick = () => { if (S.tool === 'anchor') setTool('cursor'); else { setTool('anchor'); N.toast('Tap a candle to anchor the VWAP there', 'info'); } };
  $('railGrid').onclick = () => { C().gridMode = C().gridMode === 'none' ? 'both' : 'none'; N.saveCfg(); syncRail(); chart.render(); };
  $('railBreaks').onclick = () => { C().showSessionBreaks = !C().showSessionBreaks; N.saveCfg(); syncRail(); chart.render(); };
  $('railCross').onclick = () => { C().showCrosshair = !C().showCrosshair; if (!C().showCrosshair) chart.sticky = null; N.saveCfg(); syncRail(); chart.render(); };
  /* floating controls (order dock, replay strip, TP/SL pills, jump-to-live) */
  function applyUi() {
    const u = C().ui; if (u.favbar === undefined) u.favbar = true; if (u.planLines === undefined) u.planLines = false; if (typeof renderFav === 'function') renderFav(); $('dock').classList.toggle('ui-off', !u.dock); $('replayBar').classList.toggle('ui-off', !u.replay); $('jumpLive').classList.toggle('ui-off', !u.jump); $('strip').classList.toggle('ui-off', !u.strip); document.body.classList.toggle('nostrip', !u.strip);
    const anyOff = !(u.dock && u.replay && u.pills && u.jump && u.lines); $('railFloat').classList.toggle('on', anyOff); $('floatRestore').classList.toggle('show', anyOff);
    chart.hidePills = !u.pills; chart.requestRender(); requestAnimationFrame(() => { applyFloatPos(); chart.resize(); });
  }
  function toggleFloat() { const u = C().ui, all = u.dock && u.replay && u.pills && u.jump; u.dock = u.replay = u.pills = u.jump = u.lines = !all; N.saveCfg(); applyUi(); refresh(); renderObjects(); N.toast(all ? 'Floating controls hidden — tap ⧉ (or press F) to bring them back' : 'Floating controls shown', 'info'); }
  $('railFloat').onclick = $('floatRestore').onclick = toggleFloat;
  $('dockHide').onclick = () => { C().ui.dock = false; N.saveCfg(); applyUi(); renderObjects(); }; $('rpHide').onclick = () => { C().ui.replay = false; N.saveCfg(); applyUi(); renderObjects(); };
  $('toolFit').onclick = () => { chart.resetView(); refresh(); };
  $('btnTools').onclick = e => N.openMenu(e.currentTarget, () => drawMenu().concat([
    { h: 'View' }, { label: 'Grid', check: 1, on: C().gridMode !== 'none', keep: 1, fn: () => $('railGrid').click() },
    { label: 'Session breaks', check: 1, on: C().showSessionBreaks, keep: 1, fn: () => $('railBreaks').click() },
    { label: 'Crosshair', check: 1, on: C().showCrosshair, keep: 1, fn: () => $('railCross').click() },
    { label: 'Floating controls', check: 1, on: C().ui.dock && C().ui.replay, keep: 1, fn: toggleFloat },
    { label: 'Reset view', icon: 'fit', fn: () => $('toolFit').click() }]), 'right');

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
      const ov = (key, label, sk, vals, extra) => { const q = st(sk); overlays.push(Object.assign({ key, label, color: key === 'pe200' ? e200c() : q.c, width: q.w, dash: N.dashOf(q.d), vals }, extra || {})); };
      if (c.ind.vwap && intr && !H('vwap')) ov('vwap', 'VWAP', 'vwap', indSeries(f, 'vwap', N.ind.vwap, cx, forming), brk);
      if (c.ind.avwap && intr && cx.anchor >= 0 && !H('avwap')) ov('avwap', '5D AVWAP', 'avwap', indSeries(f, 'avwap', N.ind.avwap, cx, forming));
      if (c.ind.ema9 && !H('ema9')) ov('ema9', 'EMA 9', 'ema9', indSeries(f, 'ema9', N.ind.ema(9), cx, forming), brkE);
      if (c.ind.ema21 && !H('ema21')) ov('ema21', 'EMA 21', 'ema21', indSeries(f, 'ema21', N.ind.ema(21), cx, forming), brkE);
      if (c.sub === 'rsi' && !H('sub')) sub.rsi = indSeries(f, 'rsi', N.ind.rsi, cx, forming); else if (c.sub === 'oi' && !H('sub')) sub.oi = indSeries(f, 'oi', N.ind.oi, cx, forming); else sub.mode = 'none';
      // ---- pack 2 overlays ----
      const k2 = c.pk2;
      if (k2.ema && !H('p2_ema')) [[13, 'e13'], [21, 'e21'], [50, 'e50'], [200, 'e200']].forEach(([n, k]) => { if (k2[k]) ov('pe' + n, 'EMA ' + n, k, indSeries(f, 'pe' + n, N.ind.emaC(n), cx, forming)); });
      if (k2.vwap && intr && !H('p2_vwap')) {
        if (k2.vWk) ov('vwk', 'Wk VWAP', 'vWk', indSeries(f, 'vwk', N.ind.vwapP('W'), cx, forming));
        if (k2.vMo) ov('vmo', 'Mo VWAP', 'vMo', indSeries(f, 'vmo', N.ind.vwapP('M'), cx, forming));
        if (k2.vPd) ov('vpd', 'PD VWAP', 'vPd', indSeries(f, 'vpd', N.ind.vwapPD, cx, forming), { dots: true });
      }
      if (k2.av && !H('p2_av')) {
        const ancT = c.anchorT || (M.sessions[Math.max(0, ck.sessionIndex - k2.avDays)].time), cx2 = Object.assign({}, cx, { anchorT: ancT });
        const arr = indMulti(f, 'avT', N.ind.avwapT, cx2, forming, [v => v.m, v => v.m + v.s, v => v.m - v.s, v => v.m + 2 * v.s, v => v.m - 2 * v.s, v => v.m + 3 * v.s, v => v.m - 3 * v.s]);
        ov('av', 'AVWAP', 'av', arr[0]);
        [['b1', 1], ['b2', 3], ['b3', 5]].forEach(([k, i]) => { if (k2[k]) { ov('av' + k + 'u', '', k, arr[i], { hide: 1, label: '' }); ov('av' + k + 'd', '', k, arr[i + 1], { hide: 1, label: '' }); } });
      }
      let hudRows = null;
      if (k2.adx && !H('p2_adx')) {
        const cc = S.ic.adx; const key = f.key; let base = cc && cc.key === key ? cc : (S.ic.adx = { key, res: N.foldInd(N.ind.adx(14), f.view.slice(0, f.formIdx), cx) });
        const stt = Object.assign({}, base.res.st), v = N.ind.adx(14).step(stt, forming, cx) || (base.res.vals.length ? base.res.vals[base.res.vals.length - 1].value : null);
        if (v && v.adx != null) {
          const bull = v.pdi > v.mdi, col = v.adx >= 25 ? (bull ? '#26a69a' : '#ef5350') : '#8a93a6';
          hud = { title: 'ADX · DMI 14', rows: [['ADX', v.adx.toFixed(1), col], ['+DI', v.pdi.toFixed(1), '#26a69a'], ['−DI', v.mdi.toFixed(1), '#ef5350'], ['Trend', v.adx < 20 ? 'Weak / range' : v.adx < 25 ? 'Building' : v.adx < 40 ? (bull ? 'Strong ▲' : 'Strong ▼') : (bull ? 'Very strong ▲' : 'Very strong ▼'), col]] };
        }
      }
      // ---- indicator-pack shapes (cached; recomputed per closed bar, throttled) ----
      const o1 = Object.assign({}, c.pk1, { zzMajor: c.pk1.zzMajor && !H('p1_zzMajor'), zzMinor: c.pk1.zzMinor && !H('p1_zzMinor'), sd: c.pk1.sd && !H('p1_sd'), sr: c.pk1.sr && !H('p1_sr'), cd: c.pk1.cd && !H('p1_cd') });
      const run1 = c.pk1.on && (o1.zzMajor || o1.zzMinor || o1.sd || o1.sr || o1.cd), run2 = k2.vb && !H('p2_vb');
      if (run1 || run2) {
        const pkey = packKey(c) + JSON.stringify([o1, run2, c.sty, c.hidden]), nowT = performance.now();
        if (!S.pk || S.pk.pkey !== pkey || (S.pk.fkey !== f.key && nowT - S.pk.t > 160)) {
          const closed = f.view.slice(0, f.formIdx); let sh = [], hawk = null;
          if (run1) sh = sh.concat(N.packs.compute1(closed, o1, st));
          if (run2) { const r = N.packs.compute2(closed, { preset: k2.vbPreset, labels: k2.labels, lines: k2.vbLines }, trendOf, st); sh = sh.concat(r.shapes); hawk = r.hawk; }
          S.pk = { pkey, fkey: f.key, t: nowT, shapes: sh, hawk };
        }
        shapes = S.pk.shapes; hawkD = run2 ? S.pk.hawk : null;
      }
      // levels
      const lv = M.levelsFor(ck.sessionIndex), L = c.lv;
      const sIdx = intr ? firstIdxOfSession(f.view, ck.sessionIndex) : null, startOf = k => !intr ? null : k === 'pd' ? sIdx : firstIdxOfSession(f.view, M.periodStartSession(ck.sessionIndex, k === 'pw' ? 'W' : 'M'));
      const grp = (key, nm, col) => {
        const t = L[key], fl = lv[key]; if (!fl || (!t.hl && !t.fib) || H('lv_' + key)) return; const fi = startOf(key), q = st(key), dsh = q.d !== 'solid';
        if (t.hl) { lines.push({ price: fl.hi, color: col, label: nm + 'H', fromIdx: fi, width: q.w, dashed: dsh }); lines.push({ price: fl.lo, color: col, label: nm + 'L', fromIdx: fi, width: q.w, dashed: dsh }); }
        if (t.fib) {
          const fc = N.isDark() ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)';
          lines.push({ price: fl.l0, color: col, label: nm + ' 0', dashed: true, alpha: .8, fromIdx: fi }, { price: fl.l50, color: fc, label: nm + ' .5', dashed: true, tag: false, fromIdx: fi }, { price: fl.l618, color: fc, label: nm + ' .618', dashed: true, tag: false, fromIdx: fi }, { price: fl.l786, color: fc, label: nm + ' .786', dashed: true, tag: false, fromIdx: fi }, { price: fl.l100, color: col, label: nm + ' 1', dashed: true, alpha: .8, fromIdx: fi });
          zones.push({ from: fl.l50, to: fl.l618, color: 'rgba(255,193,7,.16)', fromIdx: fi });
        }
      };
      grp('pd', 'PD', COL.pd); grp('pw', 'PW', COL.pw); grp('pm', 'PM', COL.pm);
      if ((L.dayo && !H('lv_dayo')) || (L.dayhl && !H('lv_dayhl')) || (L.orb && intr && !H('lv_orb'))) {
        const ds = M.dayStats(ck, part), qo = st('dayo'), qh = st('dayhl'), qb = st('orb');
        if (L.dayo && !H('lv_dayo')) lines.push({ price: ds.open, color: qo.c, label: 'Day O', dashed: qo.d !== 'solid', width: qo.w, fromIdx: sIdx });
        if (L.dayhl && !H('lv_dayhl')) { lines.push({ price: ds.high, color: qh.c, label: 'Day H', fromIdx: sIdx, width: qh.w, dashed: qh.d !== 'solid' }, { price: ds.low, color: qh.c, label: 'Day L', fromIdx: sIdx, width: qh.w, dashed: qh.d !== 'solid' }); }
        if (L.orb && intr && !H('lv_orb')) { lines.push({ price: ds.orbH, color: qb.c, label: 'ORB H', dashed: !ds.orbDone || qb.d !== 'solid', width: qb.w, fromIdx: sIdx }, { price: ds.orbL, color: qb.c, label: 'ORB L', dashed: !ds.orbDone || qb.d !== 'solid', width: qb.w, fromIdx: sIdx }); }
      }
    }
    // user lines
    S.userLines.forEach(u => { if (!u.hidden) lines.push({ id: u.id, kind: 'user', price: u.price, color: '#f59e0b', width: 1.3, draggable: true, deletable: true, pill: 'My line', pillBg: '#b45309' }); });
    // position / plan
    const P = S.pos, showL = c.ui.lines;
    S.orders.forEach(o => lines.push({ id: 'ord:' + o.id, kind: 'order', price: o.price, color: o.dir === 1 ? '#3b82f6' : '#f97316', dashed: true, width: 1.4, draggable: true, deletable: true, pill: (o.dir === 1 ? 'BUY ' : 'SELL ') + o.type.toUpperCase() + ' ' + o.qty, pillBg: o.dir === 1 ? '#1d4ed8' : '#c2410c' }));
    if (P && showL) {
      const risk = P.risk > 0 ? P.risk : 1, rOf = px => ((px - P.entry) * P.dir) / risk;
      const net = pnlOf(P, price);
      lines.push({ id: 'entry', price: P.entry, color: '#94a3b8', width: 1.4, autoscale: true, pill: (P.dir === 1 ? 'LONG ' : 'SHORT ') + P.qty + ' · ' + N.sgnInr(net, 0), pillBg: net >= 0 ? '#15803d' : '#b91c1c' });
      const mk = (id, px, col, nm) => {
        const mirror = p => id === 'tp' ? validTP(P, p, price) : validSL(P, p, price);
        return { id, price: px, color: col, dashed: true, width: 1.8, draggable: true, autoscale: true, pill: nm + ' ' + N.sgnInr(pnlOf(P, px), 0) + ' · ' + rOf(px).toFixed(1) + 'R', dragPill: p => { const q = mirror(c.snapTicks ? N.roundTick(p) : p); return nm + ' ' + N.sgnInr(pnlOf(P, q), 0) + ' · ' + rOf(q).toFixed(1) + 'R'; } };
      };
      lines.push(mk('tp', P.tp, '#16a34a', 'TP'), mk('sl', P.sl, '#dc2626', 'SL'));
    } else if (!P && c.plan && c.ui.planLines) {
      const tp = ptsOf('sideTp'), sl = ptsOf('sideSl'), q = Math.max(1, parseInt($('sideQty').value) || 1), d = S.plan.dir;
      lines.push({ id: 'plan-tp', price: price + d * tp, color: '#16a34a', dashed: true, width: 1.4, alpha: .6, draggable: true, autoscale: true, pill: 'Plan TP ' + (d === 1 ? 'BUY' : 'SELL') + ' +' + tp.toFixed(2) + ' · ' + N.sgnInr(tp * q, 0), pillBg: 'rgba(22,163,74,.6)', tag: false, dragPill: p => { const x = Math.abs(p - price); return 'Plan TP +' + x.toFixed(2) + ' · ' + N.sgnInr(x * q, 0); } });
      lines.push({ id: 'plan-sl', price: price - d * sl, color: '#dc2626', dashed: true, width: 1.4, alpha: .6, draggable: true, autoscale: true, pill: 'Plan SL −' + sl.toFixed(2) + ' · ' + N.sgnInr(-sl * q, 0), pillBg: 'rgba(220,38,38,.6)', tag: false, dragPill: p => { const x = Math.abs(p - price); return 'Plan SL −' + x.toFixed(2) + ' · ' + N.sgnInr(-x * q, 0); } });
    }
    // countdown
    let cd = null;
    if (intr) cd = fmtRemain((Math.min((Math.floor(ck.minuteOfDay / tf) + 1) * tf, N.SESSION_MIN)) * 60 - (ck.minuteOfDay * 60 + ck.sec));
    else if (tf === 'D') cd = fmtRemain(N.SESSION_MIN * 60 - (ck.minuteOfDay * 60 + ck.sec));
    chart.setData({ draws: S.draws, hideDraw: c.hideDraw, hidePills: !c.ui.pills, shapes, hud, vol: { on: !naked && c.ind.vol && !H('vol'), pct: c.pk2.vb ? 0.25 : c.volPct, hawk: !naked && c.pk2.vb ? hawkD : null, showMa: c.pk2.vbMa, alpha: c.pk2.vb ? 0.55 : c.volAlpha }, candles: f.view, overlays, lines, zones, sub, maxEndFloat: f.maxEndFloat, tf, style: c.style, countdown: cd, symbol: M.ticker, tfLabel: N.tfLabel(tf) });
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
    el('tkRR').textContent = '1 : ' + (tp / sl).toFixed(2); el('dockRR').innerHTML = 'Risk <b class="neg">' + N.inr(sl * q, 0) + '</b> · Reward <b class="pos">' + N.inr(tp * q, 0) + '</b> · 1:' + (tp / sl).toFixed(1);
    if (document.activeElement !== $('dockTp')) $('dockTp').value = $('sideTp').value; if (document.activeElement !== $('dockSl')) $('dockSl').value = $('sideSl').value;
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
  function openPos(dir, o) {
    o = o || {};
    if (S.pos) { N.sfx.error(); return; }
    if (S.sec >= M.maxSec - 1) { N.toast('End of this chart — load a new one', 'info'); return; }
    N.sfx.unlock();
    const qty = Math.max(1, o.qty || parseInt($('sideQty').value) || 1), tp = o.tpPts != null ? o.tpPts : ptsOf('sideTp'), sl = o.slPts != null ? o.slPts : ptsOf('sideSl'), slip = C().slipTicks * TICK;
    const entry = o.entry != null ? o.entry : r2(M.priceAt(S.sec) + dir * slip), ck = M.clock(S.sec);
    S.pos = { dir, entry, qty, tp: r2(entry + dir * tp), sl: r2(entry - dir * sl), tp0: r2(entry + dir * tp), sl0: r2(entry - dir * sl), risk: sl, openSec: S.sec, openClock: N.fmtHM(ck.time), gopt: M.opts, mfe: 0, mae: 0, ext: entry, trail: { on: false, pts: C().trailPts > 0 ? C().trailPts : sl }, trailed: false, seg: C().segment, seed: M.seed, tf: C().tf, sym: M.ticker };
    S.plan.dir = dir; dir === 1 ? N.sfx.buy() : N.sfx.sell();
    if (!o.entry) N.toast((dir === 1 ? 'Bought ' : 'Sold ') + qty + ' @ ₹' + entry.toFixed(2), 'info'); refresh(); renderPanels(true);
  }
  function closePos(price, reason) {
    const P = S.pos; if (!P) return; S.pos = null;
    const gross = (price - P.entry) * P.dir * P.qty, ch = N.tradeCharges(P.dir, P.entry, price, P.qty, P.seg).total, net = gross - ch, risk = P.risk > 0 ? P.risk : null;
    const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), sym: P.sym, seed: P.seed, tf: P.tf, dir: P.dir, entry: P.entry, exit: r2(price), qty: P.qty, gross: r2(gross), charges: r2(ch), net: r2(net), reason, risk, r: risk ? r2(net / (risk * P.qty)) : null, mfe: r2(P.mfe), mae: r2(P.mae), t0: P.openSec, t1: S.sec, dur: Math.round(S.sec - P.openSec), clock: P.openClock, tag: '', note: '', seg: P.seg, tp0: P.tp0, sl0: P.sl0, gopt: P.gopt || null };
    N.tradeStore.add(t);
    if (reason === 'TP') N.sfx.tp(); else if (reason === 'SL') (net >= 0 ? N.sfx.win() : N.sfx.sl()); else (net >= 0 ? N.sfx.win() : N.sfx.loss());
    N.toast(reason + ' · ' + N.sgnInr(net, 2) + ' (' + (t.r != null ? t.r.toFixed(2) + 'R' : '—') + ')', net >= 0 ? 'win' : 'loss');
    N.refreshAll(); renderPanels(true); N.checkBlowup && N.checkBlowup(); N.dashRefresh && N.dashRefresh();
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
      if (S.pos || S.orders.length) {
        const s0 = S.sec - pi * 60, s1 = segEnd - pi * 60, p = M.pathFor(pi);
        let j = s0 <= 0 ? 0 : M.idxAt(p, s0) + 1, hit = null;
        for (; j < p.n && p.ts[j] <= s1; j++) {
          if (!S.pos && S.orders.length) { const od = orderHit(p.ps[j]); if (od) { S.sec = pi * 60 + p.ts[j]; fillOrder(od, p.ps[j]); } }
          if (S.pos) { hit = checkTick(p.ps[j]); if (hit) { S.sec = pi * 60 + p.ts[j]; break; } }
        }
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
  /* ---------- undo / redo for drawings ---------- */
  const HI = { stack: [], idx: -1 }, jstr = o => JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v));
  function syncHist() { $('toolUndo').disabled = HI.idx <= 0; $('toolRedo').disabled = HI.idx >= HI.stack.length - 1; }
  function histSnap() { const j = jstr({ d: S.draws, u: S.userLines }); if (HI.stack[HI.idx] === j) return; HI.stack.length = HI.idx + 1; HI.stack.push(j); if (HI.stack.length > 100) HI.stack.shift(); HI.idx = HI.stack.length - 1; syncHist(); }
  function histReset() { HI.stack = []; HI.idx = -1; histSnap(); }
  function histGo(d) { const i = HI.idx + d; if (i < 0 || i >= HI.stack.length) { N.sfx.error(); return; } HI.idx = i; const st2 = JSON.parse(HI.stack[i]); S.draws = st2.d; S.userLines = st2.u; if (chart.selDraw && !S.draws.some(x => x.id === chart.selDraw)) chart.selDraw = null; N.sfx.click(); refresh(); renderObjects(); renderSelBar(); syncHist(); }
  $('toolUndo').onclick = () => histGo(-1); $('toolRedo').onclick = () => histGo(1);

  /* ---------- selected-drawing toolbar (colour, width, style, lock, clone, delete, trade) ---------- */
  const selDr = () => S.draws.find(d => d.id === chart.selDraw);
  function renderSelBar() {
    const bar = $('selBar'), d = selDr(); if (!d || !C().ui.selbar) { bar.classList.remove('show'); return; }
    const def = DRAWT[d.type], pos = N.isPosDraw(d), hasFill = ['rect', 'ellipse', 'tri', 'channel'].indexOf(d.type) >= 0;
    let h = '<span class="sn">' + N.icon(def.ic, 15) + '<b>' + N.esc(def.n) + '</b></span>';
    if (!pos) h += '<input type="color" data-s="color" value="' + (/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#f59e0b') + '" title="Colour">';
    h += '<button class="btn sm" data-s="w-" title="Thinner">' + N.icon('minus', 13) + '</button><span class="num" style="min-width:24px;text-align:center">' + (d.width || 1.6).toFixed(1) + '</span><button class="btn sm" data-s="w+" title="Thicker">' + N.icon('plus', 13) + '</button>';
    if (!pos && d.type !== 'text' && d.type !== 'mkup' && d.type !== 'mkdn') h += '<button class="btn sm" data-s="dash" title="Line style">' + (d.dash === 'dashed' ? '– –' : d.dash === 'dotted' ? '···' : '——') + '</button>';
    if (hasFill) h += '<button class="btn sm" data-s="fill" title="Fill opacity">' + N.icon('palette', 14) + '</button>';
    if (pos) { const risk = Math.abs(d.a.p - d.sl), rew = Math.abs(d.tp - d.a.p); h += '<label class="sq">Qty <input type="number" min="1" data-s="qty" value="' + (d.qty || 1) + '"></label><span class="num sr">R:R ' + (risk ? (rew / risk).toFixed(2) : '—') + ' · risk ' + N.inr(risk * (d.qty || 1), 0) + '</span><button class="btn sm buy" data-s="trade" title="Place this trade now at market using these distances">TRADE</button>'; }
    if (d.type === 'text' || d.type === 'mkup' || d.type === 'mkdn') h += '<button class="btn sm" data-s="text" title="Edit text">' + N.icon('edit', 14) + '</button>';
    h += '<button class="btn sm' + (d.locked ? ' on' : '') + '" data-s="lock" title="Lock / unlock">' + N.icon(d.locked ? 'lock' : 'unlock', 14) + '</button><button class="btn sm" data-s="clone" title="Duplicate">' + N.icon('copy2', 14) + '</button><button class="btn sm danger" data-s="del" title="Delete (Del)">' + N.icon('trash', 14) + '</button><button class="btn sm" data-s="x" title="Deselect">' + N.icon('x', 13) + '</button>';
    bar.innerHTML = h; bar.classList.add('show');
  }
  $('selBar').addEventListener('pointerdown', e => e.stopPropagation());
  $('selBar').addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return; const d = selDr(); if (!d) return; const a = b.dataset.s; N.sfx.click();
    if (a === 'w-') d.width = Math.max(0.6, (d.width || 1.6) - 0.4); else if (a === 'w+') d.width = Math.min(8, (d.width || 1.6) + 0.4);
    else if (a === 'dash') d.dash = !d.dash || d.dash === 'solid' ? 'dashed' : d.dash === 'dashed' ? 'dotted' : 'solid';
    else if (a === 'fill') d.fillA = ((d.fillA != null ? d.fillA : 0.14) + 0.12) > 0.6 ? 0.04 : (d.fillA != null ? d.fillA : 0.14) + 0.12;
    else if (a === 'lock') d.locked = !d.locked;
    else if (a === 'del') { S.draws = S.draws.filter(x => x !== d); chart.selDraw = null; }
    else if (a === 'x') chart.selDraw = null;
    else if (a === 'clone') { const c2 = JSON.parse(jstr(d)); c2.id = 'd' + (S.uid++); const sh = (pt) => pt && { t: chart.timeAt(chart.idxOfTime(pt.t) + 6), p: pt.p }; c2.a = sh(c2.a); if (c2.b) c2.b = sh(c2.b); if (c2.c) c2.c = sh(c2.c); if (c2.pts) c2.pts = c2.pts.map(sh); S.draws.push(c2); chart.selDraw = c2.id; }
    else if (a === 'text') { const t = prompt('Text', d.text || ''); if (t !== null) d.text = t; }
    else if (a === 'trade') { tradeFromDraw(d); return; }
    histSnap(); refresh(); renderObjects(); renderSelBar();
  });
  $('selBar').addEventListener('input', e => { const d = selDr(); if (!d) return; const a = e.target.dataset.s; if (a === 'color') d.color = e.target.value; else if (a === 'qty') { d.qty = Math.max(1, parseInt(e.target.value) || 1); const r = $('selBar').querySelector('.sr'); } refresh(); });
  $('selBar').addEventListener('change', e => { if (selDr()) { histSnap(); renderSelBar(); } });
  function tradeFromDraw(d) {
    if (S.pos) { N.toast('Close your open position first', 'info'); N.sfx.error(); return; }
    const long = d.type === 'longpos'; openPos(long ? 1 : -1, { qty: d.qty || 1, tpPts: Math.abs(d.tp - d.a.p), slPts: Math.abs(d.a.p - d.sl) });
  }

  /* ---------- pending orders (limit / stop) + order popup opened from the price-axis + button ---------- */
  S.orders = [];
  function orderHit(px) { for (const o of S.orders) { if (o.dir === 1 ? (o.type === 'limit' ? px <= o.price : px >= o.price) : (o.type === 'limit' ? px >= o.price : px <= o.price)) return o; } return null; }
  function fillOrder(o, px) { S.orders = S.orders.filter(x => x !== o); const entry = r2(o.type === 'limit' ? o.price : px); openPos(o.dir, { qty: o.qty, tpPts: o.tpPts, slPts: o.slPts, entry, quiet: false }); N.toast('Order filled: ' + (o.dir === 1 ? 'BUY ' : 'SELL ') + o.type.toUpperCase() + ' @ ₹' + entry.toFixed(2), 'info'); }
  let ordState = null;
  function openOrderPop(price, cx, cy) {
    const cur = S.price, dir = price < cur ? 1 : -1, pop = $('ordPop');
    ordState = { dir, price: r2(snap(price)), type: 'limit', qty: Math.max(1, parseInt($('sideQty').value) || 1), tp: ptsOf('sideTp'), sl: ptsOf('sideSl') }; autoType();
    { const ul = { id: 'u' + (S.uid++), price: ordState.price }; S.userLines.push(ul); ordState.lineId = ul.id; histSnap(); refresh(); }
    renderOrderPop();
    pop.classList.add('show'); const w = pop.offsetWidth, h = pop.offsetHeight, wr = $('chartwrap').getBoundingClientRect();
    pop.style.left = N.clamp(cx - wr.left - w - 18, 8, wr.width - w - 8) + 'px'; pop.style.top = N.clamp(cy - wr.top - h / 2, 8, wr.height - h - 8) + 'px';
  }
  function autoType() { const o = ordState, cur = S.price; if (Math.abs(o.price - cur) < TICK * 2) { o.type = 'market'; return; } o.type = (o.dir === 1) === (o.price < cur) ? 'limit' : 'stop'; }
  function renderOrderPop() {
    const o = ordState, pop = $('ordPop'), entry = o.type === 'market' ? S.price : o.price, d = o.dir, tpP = entry + d * o.tp, slP = entry - d * o.sl, risk = o.sl * o.qty, rew = o.tp * o.qty;
    pop.innerHTML = '<div class="oh"><b>' + N.icon('plusc', 16) + ' Order</b><span class="num">@ ' + entry.toFixed(2) + '</span><button class="btn icon sm" data-o="x">' + N.icon('x', 14) + '</button></div>' +
      '<div class="orow2"><button class="btn buy' + (d === 1 ? ' act' : '') + '" data-o="buy">BUY</button><button class="btn sell' + (d === -1 ? ' act' : '') + '" data-o="sell">SELL</button></div>' +
      '<div class="seg">' + ['market', 'limit', 'stop'].map(t => '<button class="btn' + (o.type === t ? ' on' : '') + '" data-o="t:' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div>' +
      '<div class="orow2"><label>Price<input type="number" step="0.05" data-o="price" value="' + (o.type === 'market' ? S.price.toFixed(2) : o.price.toFixed(2)) + '"' + (o.type === 'market' ? ' disabled' : '') + '></label><label>Qty<input type="number" min="1" data-o="qty" value="' + o.qty + '"></label></div>' +
      '<div class="orow2"><label>Target (pts)<input type="number" step="0.05" min="0.05" data-o="tp" value="' + o.tp.toFixed(2) + '"><small>' + tpP.toFixed(2) + '</small></label><label>Stop (pts)<input type="number" step="0.05" min="0.05" data-o="sl" value="' + o.sl.toFixed(2) + '"><small>' + slP.toFixed(2) + '</small></label></div>' +
      '<div class="oinfo"><span>Risk <b class="neg">' + N.inr(risk, 0) + '</b></span><span>Reward <b class="pos">' + N.inr(rew, 0) + '</b></span><span>R:R <b>1:' + (o.tp / o.sl).toFixed(2) + '</b></span></div>' +
      '<button class="btn block ' + (d === 1 ? 'buy' : 'sell') + '" data-o="place" style="height:38px;font-size:13.5px">PLACE ' + (d === 1 ? 'BUY' : 'SELL') + ' ' + o.type.toUpperCase() + '</button>';
  }
  $('ordPop').addEventListener('pointerdown', e => e.stopPropagation());
  $('ordPop').addEventListener('click', e => {
    const b = e.target.closest('[data-o]'); if (!b || !ordState) return; const a = b.dataset.o, o = ordState; if (b.tagName === 'INPUT') return; N.sfx.click();
    if (a === 'x') { $('ordPop').classList.remove('show'); return; }
    if (a === 'buy' || a === 'sell') { o.dir = a === 'buy' ? 1 : -1; autoType(); renderOrderPop(); return; }
    if (a.startsWith('t:')) { o.type = a.slice(2); renderOrderPop(); return; }
    if (a === 'place') {
      if (o.type === 'market') { if (S.pos) { N.toast('Close your open position first', 'info'); N.sfx.error(); return; } openPos(o.dir, { qty: o.qty, tpPts: o.tp, slPts: o.sl }); }
      else { S.orders.push({ id: 'o' + (S.uid++), dir: o.dir, type: o.type, price: o.price, qty: o.qty, tpPts: o.tp, slPts: o.sl }); N.sfx.drop(); N.toast((o.dir === 1 ? 'BUY ' : 'SELL ') + o.type.toUpperCase() + ' placed @ ₹' + o.price.toFixed(2) + ' — drag its line to move, ✕ to cancel', 'info'); }
      if (o.lineId) { S.userLines = S.userLines.filter(u => u.id !== o.lineId); histSnap(); o.lineId = null; }
      $('ordPop').classList.remove('show'); refresh(); renderPanels(true);
    }
  });
  $('ordPop').addEventListener('change', e => { const a = e.target.dataset.o, o = ordState; if (!a || !o) return; const v = parseFloat(e.target.value); if (a === 'price' && v > 0) { o.price = r2(v); autoType(); const ul = o.lineId && S.userLines.find(u => u.id === o.lineId); if (ul) { ul.price = o.price; refresh(); } } else if (a === 'qty') o.qty = Math.max(1, parseInt(e.target.value) || 1); else if ((a === 'tp' || a === 'sl') && v > 0) o[a] = v; renderOrderPop(); });
  document.addEventListener('pointerdown', e => { const p = $('ordPop'); if (!p.classList.contains('show') || p.contains(e.target)) return;
    if (e.target === $('chartCanvas') && ordState && ordState.lineId) { const ul = S.userLines.find(u => u.id === ordState.lineId), r = $('chartCanvas').getBoundingClientRect(); if (ul && Math.abs(chart.yAt(ul.price) - (e.clientY - r.top)) < 14 && e.clientX - r.left < r.width - 60) return; }
    p.classList.remove('show'); }, true);

  chart.hooks = {
    onFollow: f => $('jumpLive').classList.toggle('show', !f && C().ui.jump),
    onLineGrab: () => { N.sfx.click(); },
    onLineDrop: (l, price) => {
      if (price == null) return; price = snap(price); const P = S.pos;
      if (l.id === 'tp' && P) P.tp = r2(validTP(P, price, S.price));
      else if (l.id === 'sl' && P) P.sl = r2(validSL(P, price, S.price));
      else if (l.id === 'plan-tp') { $('sideTp').value = Math.max(0.05, r2(Math.abs(price - S.price))).toFixed(2); }
      else if (l.id === 'plan-sl') { $('sideSl').value = Math.max(0.05, r2(Math.abs(price - S.price))).toFixed(2); }
      else if (l.kind === 'user') { const u = S.userLines.find(x => x.id === l.id); if (u) u.price = price; histSnap(); if (ordState && ordState.lineId === l.id && $('ordPop').classList.contains('show')) { ordState.price = r2(price); autoType(); renderOrderPop(); } }
      else if (l.kind === 'order') { const o = S.orders.find(x => 'ord:' + x.id === l.id); if (o) o.price = price; }
      N.sfx.drop(); refresh(); renderPanels(true);
    },
    posDefaults: dr => { const long = dr.type === 'longpos', tp = ptsOf('sideTp'), sl = ptsOf('sideSl'); dr.tp = r2(dr.a.p + (long ? tp : -tp)); dr.sl = r2(dr.a.p - (long ? sl : -sl)); dr.b = { t: chart.timeAt(chart.idxOfTime(dr.a.t) + 24), p: dr.a.p }; },
    onDrawCommit: dr => {
      if (dr.type === 'text' || dr.type === 'callout') { const t = prompt(dr.type === 'text' ? 'Text note' : 'Callout text', ''); if (!t) { chart.render(); return; } dr.text = t; }
      if (N.isPosDraw(dr)) dr.qty = Math.max(1, parseInt($('sideQty').value) || 1);
      dr.id = 'd' + (S.uid++); S.draws.push(dr); chart.selDraw = dr.id; if (!C().stayDraw) setTool('cursor'); N.sfx.drop(); histSnap(); refresh(); renderObjects(); renderSelBar();
    },
    onDrawEdit: () => { N.sfx.drop(); histSnap(); refresh(); renderSelBar(); },
    onSelect: () => { renderObjects(); renderSelBar(); },
    onOrderPlus: ev => { if (S.tool !== 'cursor') return; N.sfx.click(); openOrderPop(ev.price, ev.x, ev.y); },
    onAnchor: t => { C().anchorT = t; C().pk2.av = true; N.saveCfg(); setTool('cursor'); N.sfx.drop(); N.toast('Anchored VWAP set at ' + N.fmtFull(t, C().tf), 'info'); refreshHeader(); refresh(); },
    onHline: price => { S.userLines.push({ id: 'u' + (S.uid++), price: snap(price) }); if (!C().stayDraw) setTool('cursor'); N.sfx.drop(); histSnap(); refresh(); },
    onLineDelete: l => { if (l.kind === 'order') { S.orders = S.orders.filter(o => 'ord:' + o.id !== l.id); N.sfx.click(); refresh(); return; } S.userLines = S.userLines.filter(u => u.id !== l.id); N.sfx.click(); histSnap(); refresh(); }
  };

  /* ---------- floating panels: drag anywhere, remembered ---------- */
  const place = (el, x, y) => { const wr = $('chartwrap').getBoundingClientRect(); x = N.clamp(x, 0, Math.max(0, wr.width - el.offsetWidth)); y = N.clamp(y, 0, Math.max(0, wr.height - el.offsetHeight)); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none'; };
  function applyPos(el, key) { const p = C()[key]; if (!p) { ['left', 'top', 'right', 'bottom', 'transform'].forEach(k => el.style.removeProperty(k)); return; } const wr = $('chartwrap').getBoundingClientRect(); if (el.offsetWidth) place(el, p.fx * wr.width, p.fy * wr.height); }
  function makeDraggable(el, grip, key) {
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
    grip.addEventListener('pointerdown', e => { on = true; grip.setPointerCapture(e.pointerId); const wr = $('chartwrap').getBoundingClientRect(), r = el.getBoundingClientRect(); ox = r.left - wr.left; oy = r.top - wr.top; sx = e.clientX; sy = e.clientY; el.classList.add('dragging'); e.preventDefault(); e.stopPropagation(); });
    grip.addEventListener('pointermove', e => { if (on) place(el, ox + e.clientX - sx, oy + e.clientY - sy); });
    const end = () => { if (!on) return; on = false; el.classList.remove('dragging'); const wr = $('chartwrap').getBoundingClientRect(), r = el.getBoundingClientRect(); C()[key] = { fx: (r.left - wr.left) / wr.width, fy: (r.top - wr.top) / wr.height }; N.saveCfg(); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', () => { C()[key] = null; N.saveCfg(); applyPos(el, key); });
  }
  function applyFloatPos() { applyPos($('dock'), 'dockPos'); applyPos($('replayBar'), 'replayPos'); applyPos($('favBar'), 'favPos'); }
  N.resetFloatPos = () => { C().dockPos = C().replayPos = C().favPos = null; N.saveCfg(); applyFloatPos(); N.toast('Floating panels moved back to their default spots', 'info'); };
  makeDraggable($('dock'), $('dockGrip'), 'dockPos'); makeDraggable($('replayBar'), $('rpGrip'), 'replayPos'); makeDragFav = () => { const g = $('favGrip'); if (g && !g._d) { g._d = 1; makeDraggable($('favBar'), g, 'favPos'); } }; renderFav();

  /* ---------- date strip + rotating quotes ---------- */
  let qIdx = -1, qTimer = 0;
  function updateStrip() {
    const now = new Date(), y = now.getFullYear(), start = new Date(y, 0, 1), total = Math.round((new Date(y + 1, 0, 1) - start) / 864e5), dayN = Math.floor((new Date(y, now.getMonth(), now.getDate()) - start) / 864e5) + 1;
    $('stDateTxt').textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    $('stYear').innerHTML = 'Day <b>' + dayN + '</b>/' + total + ' · <b>' + (total - dayN) + '</b> days left';
    $('stYearBar').style.width = (dayN / total * 100).toFixed(1) + '%'; $('stYearBar').parentNode.title = (dayN / total * 100).toFixed(0) + '% of ' + y + ' is gone';
  }
  function showQuote(next) {
    const L2 = window.NTI_QUOTES || []; if (!L2.length) return; qIdx = window.NTI_QUOTE(qIdx); const q = L2[qIdx], el = $('stQuote');
    el.classList.remove('in'); void el.offsetWidth; $('sqT').textContent = '“' + q.q + '”'; $('sqA').textContent = (q.a ? '— ' + q.a + ' · ' : '— ') + q.t; el.classList.add('in');
  }
  function startQuotes() { clearInterval(qTimer); showQuote(); qTimer = setInterval(() => { if (!document.hidden && C().ui.strip) showQuote(); }, Math.max(2, C().quoteSec || 5) * 1000); }
  $('stQuote').onclick = () => { showQuote(); startQuotes(); }; $('stripHide').onclick = () => { C().ui.strip = false; N.saveCfg(); applyUi(); renderObjects(); };
  setInterval(updateStrip, 60000);
  N.startQuotes = startQuotes;

  /* ---------- full-screen chart + refresh ---------- */
  function toggleChartFull(force) {
    const on = force != null ? force : !document.body.classList.contains('chartfull'); document.body.classList.toggle('chartfull', on);
    N.setIcon($('toolFullIc'), on ? 'fullexit' : 'fullscreen'); N.setIcon($('btnFullIc'), on ? 'fullexit' : 'fullscreen');
    try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { }); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => { }); } catch (e) { }
    setTimeout(() => { chart.resize(); applyFloatPos(); }, 60); setTimeout(() => chart.resize(), 400);
    if (on) N.toast('Full-screen chart — tap ⤢ (or press X / Esc) to come back', 'info');
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('chartfull')) toggleChartFull(false); });
  $('btnFull').onclick = $('toolFull').onclick = () => toggleChartFull(); $('fsExit').onclick = () => toggleChartFull(false);
  $('fsTf').onclick = e => $('tfMore').onclick({ currentTarget: e.currentTarget }); $('fsInd').onclick = e => $('btnInd').onclick({ currentTarget: e.currentTarget }); $('fsObj').onclick = () => $('btnObj').click(); $('fsDraw').onclick = e => $('toolDraw').onclick({ currentTarget: e.currentTarget });
  N.hardRefresh = async function () {
    N.toast('Refreshing — fetching the latest version…', 'info');
    try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update().catch(() => { }))); } if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) { }
    setTimeout(() => location.reload(), 350);
  };
  $('btnRefresh').onclick = N.hardRefresh; $('btnDash').onclick = $('openDashBtn').onclick = () => N.openDash();

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
  function restart() { pause(); if (S.pos) closeMarket('RESTART'); S.orders = []; S.sec = M.startSec; chart.resetView(); refresh(); play(); }
  $('jumpLive').onclick = () => { chart.resetView(); refresh(); };

  /* ======================= loading charts ======================= */
  function setPlanDefaults(p) { $('sideTp').value = Math.max(0.1, N.roundTick(p * C().defTpPct / 100)).toFixed(2); $('sideSl').value = Math.max(0.1, N.roundTick(p * C().defSlPct / 100)).toFixed(2); }
  function loadSeed(seed, startSec, paused, opts) {
    pause(); if (S.pos) closeMarket('NEXT');
    if (!opts && !seed && N.FNO) { const r = N.FNO[Math.floor(Math.random() * N.FNO.length)]; opts = { sym: r[0], px: r[1], fit: true }; }
    if (opts && opts.fit) { // first pass measures where the synthetic history lands, second pass re-scales so the replay opens at (about) the real LTP
      seed = seed || 1 + Math.floor(Math.random() * 899999); M.generate(seed, opts); const last = M.priceAt(M.startSec);
      opts = { sym: opts.sym, px: Math.max(0.5, Math.round(opts.px * opts.px / last * 20) / 20) };
    }
    M.generate(seed, opts); M.setDensity(C().tickDensity);
    S.sec = startSec != null ? startSec : M.startSec; S.ic = {}; S.userLines = []; S.draws = []; S.orders = []; chart.selDraw = null; histReset(); renderSelBar(); S.lastKey = ''; chart.measure = null;
    const p = M.priceAt(S.sec); S.price = p; setPlanDefaults(p); N.rcSetEntry(p);
    chart.resetView(); refreshHeader(); refresh(); renderPanels(true);
    if (!paused) play();
  }
  N.loadSeed = (seed, startSec, paused, opts) => loadSeed(seed, startSec, paused, opts);
  function newChart() { loadSeed(0); N.sfx.click(); }
  N.reviewTrade = t => {
    if (!t.seed) return; const start = Math.max(0, (t.t0 != null ? t.t0 : M.startSec) - 900); loadSeed(t.seed, start, true, t.gopt || undefined);
    if (t.t0 != null) {
      const eT = M.clock(t.t0).time, xT = M.clock(t.t1 != null ? t.t1 : t.t0).time, win = t.net >= 0, risk = t.risk > 0 ? t.risk : Math.abs(t.entry - t.exit) || t.entry * 0.005;
      S.draws.push({ id: 'd' + (S.uid++), type: t.dir === 1 ? 'longpos' : 'shortpos', a: { t: eT, p: t.entry }, b: { t: xT, p: t.entry }, tp: t.tp0 != null ? t.tp0 : t.entry + t.dir * risk * 2, sl: t.sl0 != null ? t.sl0 : t.entry - t.dir * risk, qty: t.qty, color: '#94a3b8', width: 1.3, forceLabels: true },
        { id: 'd' + (S.uid++), type: t.dir === 1 ? 'mkup' : 'mkdn', a: { t: eT, p: t.entry }, b: { t: eT, p: t.entry }, color: t.dir === 1 ? '#26a69a' : '#ef5350', text: 'IN', width: 1.2 },
        { id: 'd' + (S.uid++), type: t.dir === 1 ? 'mkdn' : 'mkup', a: { t: xT, p: t.exit }, b: { t: xT, p: t.exit }, color: win ? '#22c55e' : '#f97316', text: 'OUT ' + (t.reason || ''), width: 1.2 });
      histReset(); refresh(); renderObjects();
    }
    if (S.speed < 10) setSpeed(10); play(); if (mobile()) closeSide(); N.toast('Replaying ' + t.sym + ' from 15 min before your entry — ' + S.speed + '× speed (change it on the replay bar)', 'info');
  };

  /* ======================= quantity / ticket wiring ======================= */
  function syncQty(from) { const v = Math.max(1, parseInt($(from).value) || 1); $('sideQty').value = v; $('dockQty').value = v; }
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const inp = b.parentElement.querySelector('input'); inp.value = Math.max(1, (parseInt(inp.value) || 1) + parseInt(b.dataset.step)); syncQty(inp.id); refresh(); });
  $('sideQty').addEventListener('input', () => { syncQty('sideQty'); refresh(); }); $('dockQty').addEventListener('input', () => { syncQty('dockQty'); refresh(); });
  ['sideTp', 'sideSl'].forEach(i => $(i).addEventListener('input', refresh));
  $('dockTp').addEventListener('input', () => { $('sideTp').value = $('dockTp').value; refresh(); }); $('dockSl').addEventListener('input', () => { $('sideSl').value = $('dockSl').value; refresh(); });
  $('btnSize').onclick = () => { const rp = parseFloat($('tkRiskPct').value) || 1, sl = ptsOf('sideSl'), bal = N.balance ? N.balance() : C().capital, q = Math.max(1, Math.floor(bal * rp / 100 / sl)); $('sideQty').value = q; syncQty('sideQty'); N.toast('Qty ' + q + ' = ' + rp + '% of ' + N.inr(bal, 0) + ' risk', 'info'); refresh(); };
  $('sideBuy').onclick = $('dockBuy').onclick = () => openPos(1); $('sideSell').onclick = $('dockSell').onclick = () => openPos(-1);
  $('posClose').onclick = $('dockClose').onclick = () => closeMarket('MANUAL'); $('posRev').onclick = $('dockRev').onclick = reversePos;
  [['sideBuy', 1], ['sideSell', -1], ['dockBuy', 1], ['dockSell', -1]].forEach(([id, d]) => $(id).addEventListener('mouseenter', () => { if (!S.pos && S.plan.dir !== d) { S.plan.dir = d; refresh(); } }));

  /* ======================= side panel / tabs / resizer ======================= */
  function setTab(t) {
    C().tab = t; N.saveCfg();
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.tp').forEach(p => p.classList.toggle('on', p.id === 'tab-' + t));
    if (t === 'stats') N.renderStats(); if (t === 'journal') N.renderJournal(); if (t === 'watch') N.watch.onTab();
  }
  document.querySelectorAll('.stab').forEach(b => b.onclick = () => { N.sfx.click(); setTab(b.dataset.tab); });
  $('sym').style.cursor = 'pointer'; $('sym').title = 'Search / change symbol (watchlist)'; $('sym').onclick = () => { if (mobile()) $('side').classList.add('mob-open'); setTab('watch'); setTimeout(() => { const q = document.getElementById('wlQ'); q && q.focus(); }, 60); };
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
    const tg = (e.target.tagName || '').toLowerCase(); if (tg === 'input' || tg === 'select' || tg === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) { const kk = e.key.toLowerCase(); if (kk === 'z') { e.preventDefault(); histGo(e.shiftKey ? 1 : -1); } else if (kk === 'y') { e.preventDefault(); histGo(1); } return; }
    if (e.altKey) return;
    if ($('modal').classList.contains('show')) return;
    const k = e.key.toLowerCase();
    if (k === 'b') openPos(1); else if (k === 's') openPos(-1); else if (k === 'c') closeMarket('MANUAL'); else if (k === 'v') reversePos();
    else if (k === ' ' || k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); if (!(k === ' ' && e.repeat) && N.watch) N.watch.cycle(k === 'arrowup' ? -1 : 1); }
    else if (k === '`' || k === '~') { e.preventDefault(); N.watch && N.watch.toggleChg(); }
    else if (k === 'p') { e.preventDefault(); toggle(); } else if (k === 'r') restart(); else if (k === 'n') newChart(); else if (k === 'h') toggleNaked(); else if (k === 't') $('btnTheme').click();
    else if (k === 'm') setTool(S.tool === 'measure' ? 'cursor' : 'measure'); else if (k === 'l') setTool(S.tool === 'hline' ? 'cursor' : 'hline'); else if (k === 'f') toggleFloat(); else if (k === 'x') toggleChartFull(); else if (k === 'd') N.openDash(); else if ((k === 'delete' || k === 'backspace') && chart.selDraw) { S.draws = S.draws.filter(d => d.id !== chart.selDraw); chart.selDraw = null; histSnap(); refresh(); renderObjects(); renderSelBar(); } else if (k === 'escape') { if (document.body.classList.contains('chartfull')) toggleChartFull(false); setTool('cursor'); chart.measure = null; chart.sticky = null; chart.selDraw = null; $('ordPop').classList.remove('show'); chart.render(); N.closeMenu(); renderSelBar(); }
    else if (k === 'e') $('chBE').click(); else if (k === 'arrowright') { e.preventDefault(); step(e.shiftKey); }
    else if (k === '[' || k === ']' || k === '=' || k === '+' || k === '-' || k === '_') { const up = (k === ']' || k === '=' || k === '+'); const i = SPEEDS.findIndex(s => s[0] === S.speed); const j = N.clamp(i + (up ? 1 : -1), 0, SPEEDS.length - 1); setSpeed(SPEEDS[j][0]); N.toast('Replay speed ' + SPEEDS[j][1], 'info'); }
    else if (k >= '1' && k <= '9') { const tf = N.TF_ORDER[parseInt(k, 10) - 1]; if (tf !== undefined) setTf(tf); }
  });



  /* ======================= objects panel: show / hide / style / delete everything on the chart ======================= */
  function objRows() {
    const c = C(), R = [], add = (sec, key, name, col, rm, sk) => R.push({ sec, key, name, col, rm, sk }), P1 = c.pk1, P2 = c.pk2;
    if (c.ind.vol) add('Indicators', 'vol', 'Volume', '#8a93a6', () => { c.ind.vol = false; });
    [['vwap', 'VWAP (session)'], ['avwap', '5-day anchored VWAP'], ['ema9', 'EMA 9'], ['ema21', 'EMA 21']].forEach(([k, n]) => { if (c.ind[k]) add('Indicators', k, n, st(k).c, () => { c.ind[k] = false; }, k); });
    if (c.sub !== 'none') add('Indicators', 'sub', c.sub === 'rsi' ? 'RSI (14)' : 'OI flow', '#a78bfa', () => { c.sub = 'none'; });
    if (P1.on) [['zzMajor', 'Zig-zag · major', 'zzMajUp'], ['zzMinor', 'Zig-zag · minor', 'zzMinUp'], ['sd', 'Supply & Demand', 'supply'], ['sr', 'Support / Resistance zones', 'srSup'], ['cd', 'Candle patterns at S/R', 'patBull']].forEach(([k, n, sk]) => { if (P1[k]) add('Market structure pack', 'p1_' + k, n, st(sk).c, () => { P1[k] = false; }, sk); });
    [['ema', 'EMAs 13/21/50/200', 'e21'], ['vwap', 'Weekly / monthly / PD VWAP', 'vWk'], ['av', 'Anchored VWAP + bands', 'av'], ['adx', 'ADX dashboard', 'b1'], ['vb', 'Volume breakout', 'boUp']].forEach(([k, n, sk]) => { if (P2[k]) add('Fibs · VWAP · EMA pack', 'p2_' + k, n, st(sk).c, () => { P2[k] = false; }, sk); });
    ['pd', 'pw', 'pm'].forEach(g => { if (c.lv[g].hl || c.lv[g].fib) add('Levels', 'lv_' + g, { pd: 'Previous day', pw: 'Previous week', pm: 'Previous month' }[g], st(g).c, () => { c.lv[g].hl = c.lv[g].fib = false; }, g); });
    [['dayo', 'Day open'], ['dayhl', 'Day high / low'], ['orb', 'Opening range']].forEach(([k, n]) => { if (c.lv[k]) add('Levels', 'lv_' + k, n, st(k).c, () => { c.lv[k] = false; }, k); });
    S.draws.forEach(d => R.push({ sec: 'Drawings', key: 'draw:' + d.id, name: DRAWT[d.type].n + (d.text ? ' · ' + d.text : ''), col: d.color, draw: d }));
    S.userLines.forEach(u => R.push({ sec: 'Drawings', key: 'uline:' + u.id, name: 'Horizontal line @ ' + u.price.toFixed(2), col: '#f59e0b', uline: u }));
    return R;
  }
  let objOpen = false;
  function renderObjects() {
    const box = $('objPanel'); if (!box || !objOpen) return; const R = objRows(), u = C().ui; let sec = '', h = '';
    R.forEach(r => {
      if (r.sec !== sec) { sec = r.sec; h += '<h4>' + N.esc(sec) + '</h4>'; }
      const hid = r.draw ? !!r.draw.hidden : r.uline ? !!r.uline.hidden : !!C().hidden[r.key];
      h += '<div class="orow' + (hid ? ' off' : '') + '" data-k="' + N.esc(r.key) + '"><button class="oe" data-a="eye" title="' + (hid ? 'Show' : 'Hide') + '">' + N.icon(hid ? 'eyeoff' : 'eye', 16) + '</button>' +
        (r.draw ? '<input type="color" class="oc" value="' + (r.col || '#f59e0b') + '" data-a="col">' : '<span class="osw" style="background:' + N.esc(r.col) + '"></span>') + '<span class="on">' + N.esc(r.name) + '</span>' +
        (r.sk ? '<button class="oe" data-a="gear" title="Colour, width, style">' + N.icon('sliders', 15) + '</button>' : '') + '<button class="oe" data-a="del" title="Remove">' + N.icon('trash', 15) + '</button></div>';
    });
    if (!R.length) h += '<div class="note" style="margin:8px">Nothing on the chart yet. Add indicators from the Indicators menu and draw with the pencil on the left.</div>';
    h += '<h4>Floating controls</h4>' + [['dock', 'Order dock (qty · SL · TP · buy · sell)'], ['replay', 'Replay strip'], ['pills', 'TP / SL pills'], ['lines', 'TP / SL / plan lines on chart'], ['jump', '“Jump to live” button'], ['strip', 'Date & quote strip'], ['orderBtn', '＋ order button on price axis'], ['selbar', 'Drawing toolbar']].map(([k, n]) => '<div class="orow' + (u[k] ? '' : ' off') + '" data-k="ui:' + k + '"><button class="oe" data-a="eye">' + N.icon(u[k] ? 'eye' : 'eyeoff', 16) + '</button><span class="on">' + n + '</span></div>').join('');
    h += '<div class="orow" data-k="act:resetpos"><button class="oe" data-a="act">' + N.icon('restart', 16) + '</button><span class="on">Reset floating panel positions</span></div>';
    box.innerHTML = '<div class="mh"><b>Objects</b><span>show · hide · style · remove</span></div>' + h;
  }
  function openObjects() {
    const box = $('objPanel'); objOpen = !objOpen; if (!objOpen) { box.classList.remove('show'); return; }
    renderObjects(); const a = $('btnObj').getBoundingClientRect(); box.classList.add('show'); const mw = box.offsetWidth; box.style.left = N.clamp(a.right - mw, 8, innerWidth - mw - 8) + 'px'; box.style.top = (a.bottom + 6) + 'px';
  }
  $('btnObj').onclick = openObjects;
  document.addEventListener('pointerdown', e => { if (objOpen && !$('objPanel').contains(e.target) && !$('btnObj').contains(e.target)) { objOpen = false; $('objPanel').classList.remove('show'); } }, true);
  $('objPanel').addEventListener('click', e => {
    const btn = e.target.closest('[data-a]'); if (!btn) return; const row = btn.closest('.orow'), k = row.dataset.k, act = btn.dataset.a; N.sfx.click();
    if (k === 'act:resetpos') { N.resetFloatPos(); return; }
    if (k.startsWith('ui:')) { C().ui[k.slice(3)] = !C().ui[k.slice(3)]; N.saveCfg(); applyUi(); refresh(); renderObjects(); return; }
    const r = objRows().find(x => x.key === k); if (!r) return;
    if (act === 'eye') { if (r.draw) { r.draw.hidden = !r.draw.hidden; histSnap(); }  else if (r.uline) { r.uline.hidden = !r.uline.hidden; histSnap(); } else C().hidden[k] = !C().hidden[k]; }
    else if (act === 'del') { if (r.draw) { S.draws = S.draws.filter(d => d !== r.draw); if (chart.selDraw === r.draw.id) chart.selDraw = null; histSnap(); } else if (r.uline) { S.userLines = S.userLines.filter(d => d !== r.uline); histSnap(); } else { r.rm(); delete C().hidden[k]; } renderSelBar(); }
    else if (act === 'gear') { objOpen = false; $('objPanel').classList.remove('show'); N.openSettings('ind', r.sk); return; }
    N.saveCfg(); S.pk = null; refreshHeader(); refresh(); renderObjects();
  });
  $('objPanel').addEventListener('input', e => { const row = e.target.closest('.orow'); if (!row || e.target.dataset.a !== 'col') return; const r = objRows().find(x => x.key === row.dataset.k); if (r && r.draw) { r.draw.color = e.target.value; refresh(); } });

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

  /* ---------- go to date / replay from a date (bottom bar calendar) ---------- */
  const cal = { y: 0, m: 0, sel: -1 };
  function sessMap() { const mp = {}; M.sessions.forEach((s, i) => { const p = N.istParts(s.time); mp[p.yr + '-' + p.mon + '-' + p.day] = i; }); return mp; }
  function renderCal() {
    const pop = $('calPop'), mp = sessMap(), cur = M.clock(S.sec).sessionIndex, first = new Date(Date.UTC(cal.y, cal.m, 1)), dim = new Date(Date.UTC(cal.y, cal.m + 1, 0)).getUTCDate(), off = (first.getUTCDay() + 6) % 7;
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let g = ''; for (let i = 0; i < off; i++) g += '<u></u>';
    for (let d = 1; d <= dim; d++) { const si = mp[cal.y + '-' + cal.m + '-' + d]; g += si == null ? '<span class="cdis">' + d + '</span>' : '<button class="cday' + (si === cal.sel ? ' sel' : '') + (si === cur ? ' cur' : '') + (si > cur ? ' fut' : '') + '" data-si="' + si + '">' + d + '</button>'; }
    const si = cal.sel, ok = si >= 0, past = ok && si <= cur;
    pop.innerHTML = '<div class="calh"><button class="btn icon sm" data-m="-1">' + N.icon('chev', 14) + '</button><b>' + MN[cal.m] + ' ' + cal.y + '</b><button class="btn icon sm" data-m="1">' + N.icon('chev', 14) + '</button><span class="grow"></span><button class="btn icon sm" data-x="1">' + N.icon('x', 14) + '</button></div><div class="calw"><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i><i>S</i></div><div class="calg">' + g + '</div>' +
      '<div class="calnote">' + (ok ? '<b>' + M.sessions[si].dateStr + '</b>' + (si === cur ? ' · the day you are on' : si > cur ? ' · later than the replay clock' : ' · already played') : 'Pick a trading day. ' + M.sessions.length + ' sessions are available in this chart.') + '</div>' +
      '<div class="calb"><button class="btn solid" data-go="1"' + (past ? '' : ' disabled') + '>Go to date</button><button class="btn buy" data-rp="1"' + (ok ? '' : ' disabled') + '>' + N.icon('play', 13) + ' Replay from here</button></div>';
    pop.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { cal.m += +b.dataset.m; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } renderCal(); });
    pop.querySelectorAll('.cday').forEach(b => b.onclick = () => { cal.sel = +b.dataset.si; renderCal(); });
    pop.querySelector('[data-x]').onclick = () => pop.classList.remove('show');
    pop.querySelector('[data-go]').onclick = () => { if (cal.sel < 0) return; goToSession(cal.sel); pop.classList.remove('show'); };
    pop.querySelector('[data-rp]').onclick = () => { if (cal.sel < 0) return; replayFromSession(cal.sel); pop.classList.remove('show'); };
  }
  function goToSession(si) {
    const t = M.sessions[si].time + 3 * 3600, idx = chart.idxOfTime(t); chart.followLatest = false; chart.hooks.onFollow(false); chart.autoY = true;
    chart.viewEndFloat = N.clamp(idx + chart.viewCount / 2, 8, chart.d.maxEndFloat); chart.render(); N.sfx.click(); N.toast('Showing ' + M.sessions[si].dateStr + ' — press “Jump to live” to come back', 'info');
  }
  function replayFromSession(si) {
    if (S.pos) { if (!confirm('Replaying from another day closes your open position at market. Continue?')) return; closeMarket('NEXT'); }
    pause(); S.orders = []; S.sec = M.sessions[si].i0 * 60 + 1; S.ic = {}; S.lastKey = ''; chart.measure = null;
    const p = M.priceAt(S.sec); S.price = p; setPlanDefaults(p); N.rcSetEntry(p); chart.resetView(); refreshHeader(); refresh(); renderPanels(true);
    N.toast('Replay set to ' + M.sessions[si].dateStr + ' 09:15 — press ▶ to start. Everything after this moment is hidden.', 'info');
  }
  $('stCal').onclick = e => { e.stopPropagation(); const pop = $('calPop'); if (pop.classList.contains('show')) { pop.classList.remove('show'); return; } const cur = M.sessions[M.clock(S.sec).sessionIndex], p = N.istParts(cur.time); cal.y = p.yr; cal.m = p.mon; cal.sel = -1; pop.classList.add('show'); renderCal(); };
  document.addEventListener('pointerdown', e => { const pop = $('calPop'); if (pop.classList.contains('show') && !pop.contains(e.target) && !$('stCal').contains(e.target)) pop.classList.remove('show'); }, true);
  document.querySelectorAll('#stScale button').forEach(b => b.onclick = () => {
    const m = b.dataset.s; const cur = chart.scaleMode; const nx = (m === 'auto') ? 'auto' : (cur === m ? 'auto' : m);
    if (m === 'auto') { chart.resetPrice(); } chart.setScale(nx);
    document.querySelectorAll('#stScale button').forEach(x => x.classList.toggle('on', x.dataset.s === nx && nx !== 'auto')); N.sfx.click();
  });

  /* ======================= boot ======================= */
  function boot() {
    if (C().sub === 'volume') { C().sub = 'none'; C().ind.vol = true; N.saveCfg(); }
    N.hydrate(); applyTheme(); applyUi(); N.statsInit(); N.rcInit(); N.settingsInit();
    document.documentElement.style.setProperty('--panel-width', C().panelW + 'px');
    if (!C().side && !mobile()) { $('side').classList.add('collapsed'); $('resizer').classList.add('collapsed'); }
    $('sideQty').value = C().defQty; $('dockQty').value = C().defQty;
    $('watermark').style.display = C().showWatermark ? '' : 'none'; applyBrand();
    buildTfSeg(); syncRail(); setSpeed(C().speed); setTab(C().tab || 'trade');
    M.setDensity(C().tickDensity);
    loadSeed(0, null, true); play(); updateStrip(); startQuotes(); applyUi(); N.updateBalanceChip && N.updateBalanceChip();
    window.addEventListener('resize', () => { chart.resize(); applyFloatPos(); });
    const sp = $('splash'), hideSp = () => { if (!sp.isConnected) return; sp.classList.add('hide'); setTimeout(() => sp.remove(), 650); }; sp.addEventListener('click', hideSp);
    setTimeout(hideSp, Math.max(300, (C().splashSec || 3.4) * 1000 - performance.now()));
  }
  boot();
})(window.NTI);
