/* NerdyTradeIntuition — watchlist: the NSE F&O universe with live-flickering synthetic quotes. Tap a symbol to load a fresh practice chart for it. */
(function (N) {
  'use strict';
  const $ = id => document.getElementById(id), esc = N.esc;
  const IDX = [['NIFTY', 22753.2, 22600.0], ['BANKNIFTY', 54366.7, 54285.3], ['SENSEX', 73606.75, 73123.6]];
  const Wt = N.watch = { rows: [], sort: 'def', dir: 1, q: '', favOnly: false, ready: false, tmr: 0 };
  const FAV = () => N.cfg.watchFav || (N.cfg.watchFav = []);
  const fmt = v => v >= 1000 ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(2);
  const vfmt = v => v >= 1e7 ? (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(2) + ' L' : v >= 1e3 ? (v / 1e3).toFixed(1) + ' K' : String(v);
  function build() {
    Wt.rows = IDX.map(r => ({ sym: r[0], ltp: r[1], prev: r[2], px: r[1], hi: r[1] * 1.002, lo: r[1] * 0.997, vol: 0, idx: true, vol1: 0.00006 }))
      .concat((N.FNO || []).map(r => ({ sym: r[0], ltp: r[1], prev: r[2], px: r[1], hi: r[4], lo: r[5], vol: r[6], h52: r[7], l52: r[8], c30: r[9], c365: r[10], idx: false, vol1: 0.00017 })));
    Wt.rows.forEach((r, i) => { r.i = i; r.dir = 0; });
  }
  // random-walk the quotes; mean-revert gently to the snapshot so nothing runs away
  function tick() {
    Wt.rows.forEach(r => {
      if (Math.random() < 0.35) return;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.6, rev = (r.ltp - r.px) / r.ltp * 0.04, mv = r.px * (g * r.vol1 + rev), old = r.px;
      r.px = Math.max(0.05, Math.round((r.px + mv) / 0.05) * 0.05); r.hi = Math.max(r.hi, r.px); r.lo = Math.min(r.lo, r.px); if (!r.idx) r.vol += Math.round(Math.random() * r.vol * 0.00004 + 1);
      r.dir = r.px > old ? 1 : r.px < old ? -1 : 0;
    });
    paint();
  }
  function active() { return N.market && N.market.ticker; }
  function visible() {
    let a = Wt.rows.slice(); const q = Wt.q.trim().toUpperCase(); if (q) a = a.filter(r => r.sym.includes(q)); if (Wt.favOnly) a = a.filter(r => FAV().includes(r.sym));
    const chg = r => (r.px - r.prev) / r.prev;
    if (Wt.sort === 'chg') a.sort((x, y) => (chg(y) - chg(x)) * Wt.dir); else if (Wt.sort === 'name') a.sort((x, y) => x.sym.localeCompare(y.sym) * Wt.dir); else if (Wt.sort === 'px') a.sort((x, y) => (y.px - x.px) * Wt.dir); else if (Wt.sort === 'vol') a.sort((x, y) => (y.vol - x.vol) * Wt.dir);
    return a;
  }
  let els = new Map(), shown = [];
  function renderList() {
    const box = $('wlList'); if (!box) return; shown = visible(); els = new Map(); const act = active();
    box.innerHTML = shown.map(r => '<div class="wrow' + (r.sym === act ? ' on' : '') + '" data-s="' + esc(r.sym) + '"><button class="wstar' + (FAV().includes(r.sym) ? ' on' : '') + '" data-star="' + esc(r.sym) + '" title="Flag / unflag">' + (FAV().includes(r.sym) ? '★' : '☆') + '</button><span class="wsym"><b>' + esc(r.sym) + '</b>' + (r.idx ? '<i>INDEX</i>' : '<i>' + (r.c30 >= 0 ? '+' : '') + r.c30.toFixed(1) + '% 30d</i>') + '</span><span class="wpx num"></span><span class="wchg num"></span></div>').join('') || '<div class="empty" style="padding:20px">No symbols match.</div>';
    box.querySelectorAll('.wrow').forEach((el, i) => els.set(shown[i].sym, { el, px: el.querySelector('.wpx'), ch: el.querySelector('.wchg') }));
    paint(true); $('wlCount').textContent = shown.length + ' symbols';
  }
  function paint(force) {
    const act = active(), M = N.market; let up = 0, dn = 0;
    shown.forEach(r => { const e = els.get(r.sym); if (!e) return; let px = r.px, prev = r.prev;
      if (r.sym === act && N.S && N.S.price) { px = N.S.price; const si = M.clock(N.S.sec).sessionIndex; prev = si > 0 ? M.sessions[si - 1].close : (M.dailyHistory.length ? M.dailyHistory[M.dailyHistory.length - 1].close : px); }
      const ch = px - prev, pc = ch / prev * 100; if (ch > 0) up++; else if (ch < 0) dn++;
      e.px.textContent = fmt(px); e.ch.textContent = (ch >= 0 ? '+' : '') + pc.toFixed(2) + '%'; e.ch.className = 'wchg num ' + (ch >= 0 ? 'pos' : 'neg');
      if (r.dir && !force) { e.px.classList.remove('fu', 'fd'); void e.px.offsetWidth; e.px.classList.add(r.dir > 0 ? 'fu' : 'fd'); } r.dir = 0; });
    const s = $('wlBreadth'); if (s) s.innerHTML = '<b class="pos">▲ ' + up + '</b> <b class="neg">▼ ' + dn + '</b>';
  }
  function load(sym) { const r = Wt.rows.find(x => x.sym === sym); if (!r) return; if (N.S && N.S.pos && !confirm('You have an open position — loading another chart closes it at market. Continue?')) return; N.loadSeed(0, undefined, false, { sym: r.sym, px: r.ltp, fit: true }); renderList(); if (window.innerWidth <= 860) document.getElementById('side').classList.remove('mob-open'); }
  Wt.load = load; Wt.render = renderList;
  Wt.mount = function () {
    const root = $('tab-watch'); if (!root || Wt.ready) return; Wt.ready = true; build();
    root.innerHTML = '<div class="wlhead"><input type="search" id="wlQ" placeholder="Search ' + (N.FNO ? N.FNO.length : 0) + ' F&O symbols…" autocomplete="off"><button class="btn sm solid" id="wlFav" title="Show flagged only">★</button></div>' +
      '<div class="wlsort" id="wlSort"><button data-k="def">Default</button><button data-k="name">Name</button><button data-k="chg">% Chg</button><button data-k="px">Price</button><button data-k="vol">Volume</button><span class="grow"></span><span id="wlBreadth"></span></div><div class="wlnote"><span id="wlCount"></span> · NSE F&amp;O snapshot, 26 Oct 2026 — prices drift synthetically. Tap a symbol to practise on a fresh chart of it.</div><div id="wlList" class="wlist"></div>';
    $('wlQ').oninput = e => { Wt.q = e.target.value; renderList(); };
    $('wlFav').onclick = e => { Wt.favOnly = !Wt.favOnly; e.currentTarget.classList.toggle('on', Wt.favOnly); renderList(); };
    $('wlSort').querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.k; if (Wt.sort === k) Wt.dir = -Wt.dir; else { Wt.sort = k; Wt.dir = 1; } $('wlSort').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === Wt.sort)); renderList(); });
    $('wlSort').querySelector('[data-k="def"]').classList.add('on');
    $('wlList').addEventListener('click', e => { const st = e.target.closest('[data-star]'); if (st) { e.stopPropagation(); const s = st.dataset.star, f = FAV(), i = f.indexOf(s); if (i >= 0) f.splice(i, 1); else f.push(s); N.saveCfg(); N.sfx.click(); renderList(); return; } const r = e.target.closest('.wrow'); if (r) { N.sfx.click(); load(r.dataset.s); } });
    renderList(); clearInterval(Wt.tmr); Wt.tmr = setInterval(() => { if (document.hidden) return; const p = $('tab-watch'); if (p && p.classList.contains('on')) tick(); else Wt.rows.forEach(r => { r.px += (r.ltp - r.px) * 0.02; }); }, 1000);
  };
  Wt.onTab = function () { Wt.mount(); renderList(); };
})(window.NTI);
