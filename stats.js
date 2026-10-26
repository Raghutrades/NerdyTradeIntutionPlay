/* NerdyTradeIntuition — trade store, advanced metrics dashboard, journal (all local browser storage) */
(function (N) {
  'use strict';
  const $ = N.$, esc = N.esc, inr = N.inr, sg = N.sgnInr;
  const KEY = 'nti2_trades';
  const TAGS = ['', 'A+ setup', 'Plan followed', 'Early entry', 'Late entry', 'FOMO', 'Revenge', 'Moved stop', 'Early exit', 'Held too long', 'Oversized', 'Impulse'];

  /* ---------- store ---------- */
  const T = N.tradeStore = {
    list: [],
    load() {
      let l = N.store.get(KEY, null);
      if (!Array.isArray(l)) {
        l = [];
        try { // migrate v1
          const raw = N.store.get('nti_trades_v1', null);
          if (raw && Array.isArray(raw.tradeLog)) {
            const now = Date.now(), n = raw.tradeLog.length;
            raw.tradeLog.slice().reverse().forEach((t, i) => l.push({ id: 'v1-' + i, ts: now - (n - i) * 60000, sym: t.sym, seed: 0, tf: 5, dir: t.dir, entry: t.entry, exit: t.exit, qty: t.qty, gross: t.pnl, charges: 0, net: t.pnl, reason: t.reason || 'MANUAL', risk: null, r: t.r, mfe: null, mae: null, t0: null, t1: null, dur: null, clock: '', tag: '', note: '', legacy: true }));
          }
        } catch (e) { }
      }
      T.list = l; return l;
    },
    save() { if (!N.store.set(KEY, T.list)) N.toast('Storage full — export a backup', 'loss'); },
    add(t) { T.list.push(t); if (T.list.length > 5000) T.list.shift(); T.save(); },
    clear() { T.list = []; T.save(); },
    update(id, patch) { const t = T.list.find(x => x.id === id); if (t) { Object.assign(t, patch); T.save(); } },
    remove(id) { T.list = T.list.filter(x => x.id !== id); T.save(); }
  };

  /* ---------- compute ---------- */
  function sumBy(a, f) { let s = 0; for (const x of a) s += f(x); return s; }
  N.computeStats = function (L, capital) {
    const n = L.length; const S = { n };
    if (!n) return S;
    const wins = L.filter(t => t.net > 0), loss = L.filter(t => t.net < 0), scr = n - wins.length - loss.length;
    S.wins = wins.length; S.losses = loss.length; S.scratch = scr;
    S.gross = sumBy(L, t => t.gross); S.charges = sumBy(L, t => t.charges || 0); S.net = sumBy(L, t => t.net);
    S.grossWin = sumBy(wins, t => t.net); S.grossLoss = Math.abs(sumBy(loss, t => t.net));
    S.winRate = wins.length / n * 100;
    S.avgWin = wins.length ? S.grossWin / wins.length : 0; S.avgLoss = loss.length ? S.grossLoss / loss.length : 0;
    S.payoff = S.avgLoss ? S.avgWin / S.avgLoss : null; S.pf = S.grossLoss ? S.grossWin / S.grossLoss : (S.grossWin > 0 ? Infinity : null);
    S.expect = S.net / n; S.best = Math.max(...L.map(t => t.net)); S.worst = Math.min(...L.map(t => t.net));
    const rs = L.filter(t => t.r != null && isFinite(t.r)).map(t => t.r);
    S.nR = rs.length; S.avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    if (rs.length > 2) { const m = S.avgR, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) * (b - m), 0) / (rs.length - 1)); S.sqn = sd > 0 ? Math.sqrt(Math.min(100, rs.length)) * m / sd : null; }
    const p = S.winRate / 100; S.kelly = S.payoff ? (p - (1 - p) / S.payoff) * 100 : null;
    const nets = L.map(t => t.net), mean = S.net / n; const sd = n > 1 ? Math.sqrt(nets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0; S.sharpe = sd > 0 ? mean / sd : null;
    // equity + drawdown (chronological)
    const eq = [capital]; let peak = capital, mdd = 0, mddPct = 0; const dd = [0];
    for (const t of L) { const v = eq[eq.length - 1] + t.net; eq.push(v); if (v > peak) peak = v; const d = peak - v; dd.push(d); if (d > mdd) mdd = d; if (peak > 0 && d / peak * 100 > mddPct) mddPct = d / peak * 100; }
    S.eq = eq; S.dd = dd; S.maxDD = mdd; S.maxDDPct = mddPct; S.recovery = mdd > 0 ? S.net / mdd : null; S.roi = capital > 0 ? S.net / capital * 100 : null; S.curDD = peak - eq[eq.length - 1];
    // streaks
    let cw = 0, cl = 0, mw = 0, ml = 0; for (const t of L) { if (t.net > 0) { cw++; cl = 0; mw = Math.max(mw, cw); } else if (t.net < 0) { cl++; cw = 0; ml = Math.max(ml, cl); } else { cw = 0; cl = 0; } }
    S.maxWinStreak = mw; S.maxLossStreak = ml; S.curStreak = cw > 0 ? cw : -cl;
    // holds
    const hw = wins.filter(t => t.dur != null), hl = loss.filter(t => t.dur != null), allH = L.filter(t => t.dur != null);
    S.avgHold = allH.length ? sumBy(allH, t => t.dur) / allH.length : null; S.holdWin = hw.length ? sumBy(hw, t => t.dur) / hw.length : null; S.holdLoss = hl.length ? sumBy(hl, t => t.dur) / hl.length : null;
    // MAE / MFE in R + efficiency
    const em = L.filter(t => t.risk > 0 && t.mfe != null);
    if (em.length) {
      S.avgMFE = sumBy(em, t => t.mfe / t.risk) / em.length; S.avgMAE = sumBy(em, t => t.mae / t.risk) / em.length;
      const ef = em.filter(t => t.mfe > 0 && t.net > 0).map(t => Math.max(0, Math.min(1, ((t.exit - t.entry) * t.dir) / t.mfe))); S.eff = ef.length ? ef.reduce((a, b) => a + b, 0) / ef.length * 100 : null;
      const ml2 = L.filter(t => t.net < 0 && t.risk > 0 && t.mfe != null && t.mfe / t.risk >= 1); S.gaveBack = ml2.length; // losers that were at +1R at some point
    }
    // breakdowns
    const grp = (keyf) => { const m = new Map(); for (const t of L) { const k = keyf(t); if (k == null) continue; let g = m.get(k); if (!g) { g = { n: 0, net: 0, w: 0 }; m.set(k, g); } g.n++; g.net += t.net; if (t.net > 0) g.w++; } return m; };
    S.byHour = grp(t => t.clock ? parseInt(t.clock.slice(0, 2), 10) : null);
    S.byExit = grp(t => t.reason || 'MANUAL'); S.byTag = grp(t => t.tag || null);
    S.byDir = { long: L.filter(t => t.dir === 1), short: L.filter(t => t.dir === -1) };
    const dayKey = t => { const d = new Date(t.ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    S.byDay = grp(dayKey); S.dayKey = dayKey;
    // R histogram
    const edges = [-Infinity, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 2, 3, Infinity], labs = ['<-3', '-3', '-2', '-1.5', '-1', '-.5', '0', '.5', '1', '2', '>3']; const bins = new Array(labs.length).fill(0);
    for (const r of rs) { for (let i = 0; i < edges.length - 1; i++) if (r >= edges[i] && r < edges[i + 1]) { bins[i]++; break; } }
    S.rBins = bins; S.rLabs = labs;
    return S;
  };

  /* ---------- helpers ---------- */
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function prep(canvas, h) { const dpr = window.devicePixelRatio || 1, w = Math.max(100, canvas.clientWidth || 300); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px'; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, w, h }; }
  const fk = (s, f) => s == null || !isFinite(s) ? '—' : f(s);
  const kpi = (k, v, sub, cls, extra) => '<div class="kpi ' + (extra || '') + '"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  const cl = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

  function drawEquity(cvs, S, up, dn) {
    const { ctx, w, h } = prep(cvs, 120), eq = S.eq; if (eq.length < 2) return;
    const padL = 4, padR = 4, padT = 8, padB = 8; let mn = Math.min(...eq), mx = Math.max(...eq); if (mn === mx) { mn -= 1; mx += 1; }
    const X = i => padL + i / (eq.length - 1) * (w - padL - padR), Y = v => padT + (1 - (v - mn) / (mx - mn)) * (h - padT - padB);
    const base = eq[0]; ctx.strokeStyle = css('--border'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, Y(base)); ctx.lineTo(w, Y(base)); ctx.stroke(); ctx.setLineDash([]);
    // drawdown shading
    let pk = eq[0]; ctx.fillStyle = dn + '30'; ctx.beginPath(); ctx.moveTo(X(0), Y(eq[0]));
    const peaks = []; eq.forEach(v => { pk = Math.max(pk, v); peaks.push(pk); });
    eq.forEach((v, i) => ctx.lineTo(X(i), Y(v))); for (let i = eq.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(peaks[i])); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, h); const fin = eq[eq.length - 1] >= base; const col = fin ? up : dn; g.addColorStop(0, col + '40'); g.addColorStop(1, col + '00');
    ctx.beginPath(); eq.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))); ctx.lineTo(X(eq.length - 1), h); ctx.lineTo(X(0), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); eq.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(eq.length - 1), Y(eq[eq.length - 1]), 3, 0, 7); ctx.fill();
  }
  function drawBars(cvs, vals, labels, up, dn, opts) {
    opts = opts || {}; const { ctx, w, h } = prep(cvs, opts.h || 90); if (!vals.length) return;
    const padB = labels ? 14 : 4, padT = 6; let mx = Math.max(...vals.map(Math.abs), 1e-9); const zero = opts.positive ? h - padB : padT + (h - padT - padB) / 2; const half = opts.positive ? (h - padT - padB) : (h - padT - padB) / 2;
    const bw = w / vals.length; ctx.strokeStyle = css('--border'); ctx.beginPath(); ctx.moveTo(0, zero + .5); ctx.lineTo(w, zero + .5); ctx.stroke();
    vals.forEach((v, i) => { const hh = Math.abs(v) / mx * (half - 2); ctx.fillStyle = opts.color ? opts.color(v, i) : (v >= 0 ? up : dn); const x = i * bw + bw * 0.14; ctx.fillRect(x, v >= 0 ? zero - hh : zero, bw * 0.72, Math.max(v === 0 ? 0 : 1, hh)); });
    if (labels) { ctx.fillStyle = css('--dim'); ctx.font = '9.5px system-ui'; ctx.textAlign = 'center'; const every = Math.ceil(labels.length / Math.floor(w / 26)); labels.forEach((l, i) => { if (i % every === 0) ctx.fillText(l, i * bw + bw / 2, h - 3); }); }
  }

  /* ---------- stats render ---------- */
  let statsFilter = { range: 'all', sym: '' };
  function filtered() {
    let L = T.list.slice();
    if (statsFilter.sym) L = L.filter(t => t.sym === statsFilter.sym);
    const r = statsFilter.range, now = new Date();
    if (r === 'today') { const k = now.toDateString(); L = L.filter(t => new Date(t.ts).toDateString() === k); }
    else if (r === '7d') { const c = Date.now() - 7 * 864e5; L = L.filter(t => t.ts >= c); }
    else if (r === '20' || r === '50') L = L.slice(-parseInt(r, 10));
    return L;
  }
  N.renderStats = function () {
    const host = $('statsBody'); if (!host) return;
    const symSel = $('stSym'), syms = [...new Set(T.list.map(t => t.sym))].sort();
    if (symSel.options.length - 1 !== syms.length) { const cur = statsFilter.sym; symSel.innerHTML = '<option value="">All symbols</option>' + syms.map(s => '<option>' + esc(s) + '</option>').join(''); symSel.value = cur; }
    const L = filtered(), cap = N.cfg.capital, S = N.computeStats(L, cap), up = N.cfg.upColor, dn = N.cfg.downColor;
    if (!S.n) { host.innerHTML = '<div class="empty">No closed trades in this range yet.<br>Take a few trades — every metric builds from your journal and stays in this browser only.</div>'; return; }
    const hold = s => s == null ? '—' : N.dur(s);
    let h = '<div class="kpis">';
    h += kpi('Net P&L', sg(S.net), S.roi != null ? N.pct(S.roi, 2) + ' on ' + inr(cap) : '', cl(S.net), 'wide hero');
    h += kpi('Win rate', N.pct(S.winRate), S.wins + 'W · ' + S.losses + 'L' + (S.scratch ? ' · ' + S.scratch + 'S' : ''), '');
    h += kpi('Profit factor', S.pf === Infinity ? '∞' : fk(S.pf, v => v.toFixed(2)), 'GW ' + inr(S.grossWin) + ' / GL ' + inr(S.grossLoss), S.pf >= 1 ? 'pos' : S.pf != null ? 'neg' : '');
    h += kpi('Expectancy', sg(S.expect, 0), S.avgR != null ? S.avgR.toFixed(2) + 'R per trade' : 'per trade', cl(S.expect));
    h += kpi('Avg win / loss', inr(S.avgWin) + ' / ' + inr(S.avgLoss), S.payoff != null ? 'Payoff ' + S.payoff.toFixed(2) + ':1' : '', '');
    h += kpi('Max drawdown', inr(S.maxDD), N.pct(S.maxDDPct, 2) + (S.curDD > 0 ? ' · now ' + inr(S.curDD) : ' · at peak'), S.maxDD > 0 ? 'neg' : '');
    h += kpi('Recovery factor', fk(S.recovery, v => v.toFixed(2)), 'net ÷ max DD', '');
    h += kpi('Best / worst', sg(S.best) + ' / ' + sg(S.worst), '', '');
    h += kpi('SQN (R)', fk(S.sqn, v => v.toFixed(2)), S.sqn == null ? 'needs 3+ trades with R' : S.sqn >= 2 ? 'solid system edge' : S.sqn >= 1 ? 'developing' : 'weak', S.sqn >= 2 ? 'pos' : '');
    h += kpi('Kelly (full)', fk(S.kelly, v => v.toFixed(1) + '%'), 'use ¼–½ of it', S.kelly > 0 ? 'pos' : S.kelly != null ? 'neg' : '');
    h += kpi('Streaks', S.maxWinStreak + 'W · ' + S.maxLossStreak + 'L', 'now ' + (S.curStreak > 0 ? S.curStreak + ' win' : S.curStreak < 0 ? (-S.curStreak) + ' loss' : '—') + ' streak', '');
    h += kpi('Charges paid', inr(S.charges), 'gross ' + sg(S.gross) + ' → net', 'neg');
    h += kpi('Avg hold', hold(S.avgHold), 'win ' + hold(S.holdWin) + ' · loss ' + hold(S.holdLoss), '');
    h += kpi('Per-trade Sharpe', fk(S.sharpe, v => v.toFixed(2)), 'mean ÷ stdev', '');
    if (S.avgMFE != null) {
      h += kpi('Avg MFE / MAE', S.avgMFE.toFixed(2) + 'R / ' + S.avgMAE.toFixed(2) + 'R', 'best run vs worst heat', '');
      h += kpi('Exit efficiency', fk(S.eff, v => v.toFixed(0) + '%'), 'winners: % of peak captured', S.eff >= 60 ? 'pos' : '');
      if (S.gaveBack) h += kpi('Winners → losers', S.gaveBack + '', 'losses that were +1R at some point', S.gaveBack ? 'neg' : '', 'wide');
    }
    h += '</div>';
    h += '<div class="card" style="margin-top:10px"><h3>Equity &amp; drawdown <span>' + S.n + ' trades</span></h3><canvas class="mini" id="cvEq"></canvas></div>';
    h += '<div class="card"><h3>Net per trade</h3><canvas class="mini" id="cvPer"></canvas></div>';
    h += '<div class="card"><h3>R-multiple distribution <span>' + S.nR + ' with R</span></h3><canvas class="mini" id="cvR"></canvas></div>';
    // long/short + exits
    const ls = (a) => { const w = a.filter(t => t.net > 0).length, nt = sumBy(a, t => t.net); return a.length ? '<b class="' + cl(nt) + '">' + sg(nt) + '</b> · ' + (w / a.length * 100).toFixed(0) + '% (' + a.length + ')' : '—'; };
    h += '<div class="card"><h3>Direction &amp; exits</h3><div class="kv"><span>Long</span><span>' + ls(S.byDir.long) + '</span></div><div class="kv"><span>Short</span><span>' + ls(S.byDir.short) + '</span></div>';
    const exCols = { TP: up, SL: dn, TRAIL: '#f59e0b', MANUAL: '#8b95a8', REVERSE: '#a78bfa', NEXT: '#64748b', RESTART: '#64748b' };
    h += '<div class="bar-h" style="margin-top:8px">' + [...S.byExit.entries()].map(([k, g]) => '<i style="width:' + (g.n / S.n * 100) + '%;background:' + (exCols[k] || '#64748b') + '"></i>').join('') + '</div><div class="legend-row">' + [...S.byExit.entries()].map(([k, g]) => '<span><b style="background:' + (exCols[k] || '#64748b') + '"></b>' + k + ' ' + g.n + ' <span class="' + cl(g.net) + '">' + sg(g.net) + '</span></span>').join('') + '</div></div>';
    h += '<div class="card"><h3>By hour of entry (IST) <span>net ₹</span></h3><canvas class="mini" id="cvHr"></canvas></div>';
    // calendar
    const cells = []; const today = new Date(); today.setHours(0, 0, 0, 0); const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 4);
    let mxAbs = 1; S.byDay.forEach(g => { mxAbs = Math.max(mxAbs, Math.abs(g.net)); });
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), g = S.byDay.get(k);
      const a = g ? 0.2 + 0.8 * Math.min(1, Math.abs(g.net) / mxAbs) : 0, col = g ? (g.net >= 0 ? up : dn) : null;
      cells.push('<i title="' + k + (g ? ' · ' + g.n + ' trades · ' + sg(g.net) : '') + '" style="' + (col ? 'background:' + col + Math.round(a * 255).toString(16).padStart(2, '0') + ';color:#fff' : '') + '">' + d.getDate() + '</i>');
    }
    h += '<div class="card"><h3>Daily P&amp;L calendar <span>Mon → Sun</span></h3><div class="heat">' + cells.join('') + '</div></div>';
    if (S.byTag.size) {
      h += '<div class="card"><h3>By tag <span>your behaviour</span></h3><table class="tbl"><thead><tr><th>Tag</th><th>#</th><th>Win%</th><th>Net</th></tr></thead><tbody>' + [...S.byTag.entries()].sort((a, b) => a[1].net - b[1].net).map(([k, g]) => '<tr><td>' + esc(k) + '</td><td>' + g.n + '</td><td>' + (g.w / g.n * 100).toFixed(0) + '%</td><td class="' + cl(g.net) + '">' + sg(g.net) + '</td></tr>').join('') + '</tbody></table><div class="note">Tag trades in the Journal tab — the red rows are your most expensive habits.</div></div>';
    }
    host.innerHTML = h;
    drawEquity($('cvEq'), S, up, dn);
    drawBars($('cvPer'), L.map(t => t.net), null, up, dn, { h: 80 });
    drawBars($('cvR'), S.rBins, S.rLabs, up, dn, { h: 84, positive: true, color: (v, i) => i < 6 ? dn : up });
    const hrs = []; for (let hh = 9; hh <= 15; hh++) hrs.push(hh);
    drawBars($('cvHr'), hrs.map(hh => (S.byHour.get(hh) || { net: 0 }).net), hrs.map(hh => hh + 'h'), up, dn, { h: 90 });
  };

  /* ---------- journal ---------- */
  N.renderJournal = function () {
    const host = $('journalBody'); if (!host) return;
    const L = T.list.slice().reverse().slice(0, 150);
    if (!L.length) { host.innerHTML = '<div class="empty">Your journal is empty.<br>Closed trades appear here with MAE/MFE, tags and notes.</div>'; return; }
    host.innerHTML = L.map(t => {
      const d = new Date(t.ts), when = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const win = t.net >= 0;
      return '<div class="jr" data-id="' + t.id + '" style="border-left:3px solid ' + (win ? 'var(--up)' : 'var(--down)') + '">' +
        '<div class="l1"><span><b class="' + (t.dir === 1 ? 'pos' : 'neg') + '">' + (t.dir === 1 ? 'LONG' : 'SHORT') + '</b> <b>' + esc(t.sym) + '</b> ×' + t.qty + '</span><b class="num ' + cl(t.net) + '" style="font-size:14px">' + sg(t.net, 2) + '</b></div>' +
        '<div class="l2 num">' + t.entry.toFixed(2) + ' → ' + t.exit.toFixed(2) + (t.r != null ? ' · <span class="' + cl(t.r) + '">' + (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R</span>' : '') + ' · ' + esc(t.reason || '') + (t.charges ? ' · fees ' + inr(t.charges, 0) : '') + '</div>' +
        '<div class="l2 num">' + when + (t.clock ? ' · chart ' + esc(t.clock) : '') + (t.dur != null ? ' · held ' + N.dur(t.dur) : '') + (t.mfe != null && t.risk ? ' · MFE ' + (t.mfe / t.risk).toFixed(1) + 'R / MAE ' + (t.mae / t.risk).toFixed(1) + 'R' : '') + '</div>' +
        '<div class="l3"><select data-f="tag">' + TAGS.map(g => '<option value="' + esc(g) + '"' + (g === (t.tag || '') ? ' selected' : '') + '>' + (g || '— tag —') + '</option>').join('') + '</select><input type="text" data-f="note" placeholder="note…" value="' + esc(t.note || '') + '"><span style="white-space:nowrap">' + (t.seed ? '<button class="btn sm" data-a="view" title="See this trade on its chart"><i data-ic="candles" data-sz="14"></i></button><button class="btn sm" data-a="review" title="Re-open this chart 40 min before entry"><i data-ic="restart" data-sz="14"></i></button>' : '') + '<button class="btn sm danger" data-a="del" title="Delete"><i data-ic="x" data-sz="14"></i></button></span></div></div>';
    }).join('') + (T.list.length > 150 ? '<div class="note">Showing latest 150 of ' + T.list.length + ' — export CSV for everything.</div>' : '');
    N.hydrate(host);
  };
  function bindJournal() {
    const host = $('journalBody');
    host.addEventListener('change', e => { const tr = e.target.closest('.jr[data-id]'); if (!tr) return; const f = e.target.dataset.f; if (f) { T.update(tr.dataset.id, { [f]: e.target.value }); if (f === 'tag') N.renderStats(); } });
    host.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return; const tr = b.closest('.jr[data-id]'), id = tr.dataset.id, t = T.list.find(x => x.id === id); if (!t) return;
      if (b.dataset.a === 'del') { if (confirm('Delete this trade from your journal?')) { T.remove(id); N.refreshAll(); } }
      else if (b.dataset.a === 'review') N.reviewTrade && N.reviewTrade(t);
      else if (b.dataset.a === 'view') N.openTradeView && N.openTradeView(t, T.list.slice().reverse());
    });
    $('stRange').onchange = e => { statsFilter.range = e.target.value; N.renderStats(); };
    $('stSym').onchange = e => { statsFilter.sym = e.target.value; N.renderStats(); };
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    N.downloadFile = dl;
    $('jrCsv').onclick = () => {
      const cols = ['ts', 'sym', 'seed', 'tf', 'dir', 'qty', 'entry', 'exit', 'gross', 'charges', 'net', 'r', 'risk', 'mfe', 'mae', 'reason', 'clock', 'dur', 'tag', 'note'];
      const rows = [cols.join(',')].concat(T.list.map(t => cols.map(c => { let v = t[c]; if (c === 'ts') v = new Date(v).toISOString(); if (c === 'dir') v = v === 1 ? 'LONG' : 'SHORT'; return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',')));
      dl('nerdytrade-journal.csv', rows.join('\n'), 'text/csv'); N.toast('CSV exported', 'info');
    };
    $('jrJson').onclick = () => { N.exportBackup(); };
    $('jrImport').onclick = () => $('jrFile').click();
    $('jrFile').onchange = e => { const f = e.target.files[0]; if (f) N.importBackup(f); e.target.value = ''; };
    $('jrClear').onclick = () => { if (T.list.length && confirm('Delete ALL ' + T.list.length + ' journal trades? This cannot be undone. (Export a backup first.)')) { T.clear(); N.refreshAll(); N.toast('Journal cleared', 'info'); } };
  }
  N.exportBackup = function () {
    const data = { app: 'NerdyTradeIntuition', version: 2, exportedAt: new Date().toISOString(), cfg: N.cfg, trades: T.list };
    N.downloadFile('nerdytrade-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 1), 'application/json'); N.toast('Backup downloaded', 'info');
  };
  N.importBackup = function (file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result); const arr = Array.isArray(d) ? d : d.trades; if (!Array.isArray(arr)) throw 0;
        const have = new Set(T.list.map(t => t.id)); let add = 0;
        arr.forEach(t => { if (t && t.id && typeof t.net === 'number' && !have.has(t.id)) { T.list.push(t); add++; } });
        T.list.sort((a, b) => a.ts - b.ts); T.save(); N.refreshAll(); N.toast('Restored ' + add + ' new trades', 'win');
      } catch (e) { N.toast('Could not read that backup file', 'loss'); }
    };
    r.readAsText(file);
  };
  N.statsInit = function () { T.load(); bindJournal(); };
})(window.NTI);
