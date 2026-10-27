/* NerdyTradeIntuition — account ledger (deposits, blow-ups), advanced performance dashboard, per-trade chart viewer */
(function (N) {
  'use strict';
  const $ = N.$, esc = N.esc, inr = N.inr, sg = N.sgnInr, T = N.tradeStore, M = N.market;
  const LKEY = 'nti2_ledger', cl = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fx = (v, d) => v == null || !isFinite(v) ? '—' : v.toFixed(d == null ? 2 : d);
  const sum = (a, f) => { let s = 0; for (const x of a) s += f(x); return s; };
  const dstr = ts => { const d = new Date(ts); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  const dtstr = ts => { const d = new Date(ts); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const pct = (v, d) => v == null || !isFinite(v) ? '—' : v.toFixed(d == null ? 1 : d) + '%';

  /* ====================== ledger ====================== */
  const L = N.ledger = {
    list: [],
    load() {
      let l = N.store.get(LKEY, null);
      if (!Array.isArray(l) || !l.length) { const first = T.list.length ? Math.min(T.list[0].ts, Date.now()) - 1000 : Date.now(); l = [{ id: 's0', ts: first, type: 'start', amount: N.cfg.capital, note: 'Starting capital' }]; N.store.set(LKEY, l); }
      L.list = l;
    },
    save() { N.store.set(LKEY, L.list); },
    add(ev) { ev.id = ev.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 4); ev.ts = ev.ts || Date.now(); L.list.push(ev); L.list.sort((a, b) => a.ts - b.ts); L.save(); },
    remove(id) { L.list = L.list.filter(e => e.id !== id); L.save(); }
  };

  // replay ledger events + trades chronologically
  N.account = function (trades) {
    trades = trades || T.list;
    const rows = []; L.list.forEach(e => rows.push({ ts: e.ts, k: 'e', e })); trades.forEach(t => rows.push({ ts: t.ts, k: 't', t }));
    rows.sort((a, b) => a.ts - b.ts || (a.k === 'e' ? -1 : 1));
    let bal = 0, peak = 0, life = null, deposited = 0, withdrawn = 0, topups = 0, blowups = 0, written = 0, maxDD = 0, maxDDPct = 0, tradeLife = {};
    const lives = [], pts = [];
    const open = ts => { life = { n: lives.length + 1, startTs: ts, capital: 0, topups: 0, trades: 0, wins: 0, pnl: 0, endTs: null, blown: false, blowBal: null, minBal: bal, peak: bal, maxDD: 0 }; lives.push(life); peak = bal; };
    rows.forEach(r => {
      if (r.k === 'e') {
        const e = r.e;
        if (e.type === 'start') { if (!life) open(e.ts); bal += e.amount; deposited += e.amount; life.capital += e.amount; peak += e.amount; pts.push({ ts: e.ts, bal, k: 'start', e }); }
        else if (e.type === 'deposit') { if (!life || life.blown) open(e.ts); else { life.topups++; topups++; } bal += e.amount; deposited += e.amount; life.capital += e.amount; peak += e.amount; pts.push({ ts: e.ts, bal, k: 'dep', e }); }
        else if (e.type === 'withdraw') { bal -= e.amount; withdrawn += e.amount; peak -= e.amount; pts.push({ ts: e.ts, bal, k: 'wd', e }); }
        else if (e.type === 'writeoff') { bal -= e.amount; written += e.amount; peak -= e.amount; pts.push({ ts: e.ts, bal, k: 'wo', e }); }
        else if (e.type === 'blowup') { if (life) { life.blown = true; life.endTs = e.ts; life.blowBal = e.amount; } blowups++; pts.push({ ts: e.ts, bal, k: 'blow', e }); }
      } else {
        if (!life) open(r.ts); const t = r.t; bal += t.net; if (bal > peak) peak = bal; const dd = peak - bal; if (dd > maxDD) maxDD = dd; if (peak > 0 && dd / peak * 100 > maxDDPct) maxDDPct = dd / peak * 100;
        life.trades++; if (t.net > 0) life.wins++; life.pnl += t.net; life.minBal = Math.min(life.minBal, bal); life.peak = Math.max(life.peak, bal); if (dd > life.maxDD) life.maxDD = dd; tradeLife[t.id] = life.n; pts.push({ ts: r.ts, bal, k: 't', t });
      }
    });
    const cur = lives[lives.length - 1] || null;
    return { bal, peak, lives, pts, deposited, withdrawn, topups, blowups, written, maxDD, maxDDPct, cur, tradeLife, net: sum(trades, t => t.net) };
  };
  N.balance = () => { try { const a = N.account(); return a.lives.length ? a.bal : N.cfg.capital; } catch (e) { return N.cfg.capital; } };
  N.updateBalanceChip = () => { const el = $('stBal'); if (!el) return; const a = N.account(); el.innerHTML = 'Balance <b class="' + (a.bal >= a.deposited - a.withdrawn - a.written ? 'up' : 'down') + '">' + inr(a.bal, 0) + '</b>' + (a.blowups ? ' · <span class="down">' + a.blowups + '✖</span>' : ''); };

  /* ---------- small dialog helper ---------- */
  function dialog(title, body, buttons) {
    const o = document.createElement('div'); o.className = 'dlg-o'; o.innerHTML = '<div class="dlg"><h3>' + title + '</h3><div class="dlg-b">' + body + '</div><div class="dlg-f"></div></div>'; document.body.appendChild(o);
    const f = o.querySelector('.dlg-f'), close = () => o.remove();
    buttons.forEach(b => { const x = document.createElement('button'); x.className = 'btn ' + (b.cls || 'solid'); x.textContent = b.t; x.onclick = () => { if (b.fn && b.fn(o) === false) return; close(); }; f.appendChild(x); });
    return o;
  }
  N.askCapital = function (mode, cb) {
    const titles = { deposit: 'Add capital', withdraw: 'Withdraw', reset: 'Start a fresh account' };
    const o = dialog(titles[mode] || 'Capital', '<label class="lbl">Amount (₹)</label><input type="number" id="dlgAmt" min="1" step="1000" value="' + (mode === 'withdraw' ? 10000 : N.cfg.capital) + '"><label class="lbl" style="margin-top:8px">Note (optional)</label><input type="text" id="dlgNote" maxlength="60" placeholder="e.g. fresh ₹1L after the blow-up">' + (mode === 'reset' ? '<div class="note">The remaining balance is written off (kept in your history) and a new account life begins with this amount.</div>' : ''), [
      { t: 'Cancel', cls: 'solid' }, { t: mode === 'withdraw' ? 'Withdraw' : mode === 'reset' ? 'Reset & start' : 'Add capital', cls: 'buy', fn: d => { const v = parseFloat(d.querySelector('#dlgAmt').value), note = d.querySelector('#dlgNote').value.trim(); if (!(v > 0)) return false; cb(v, note); } }]);
    setTimeout(() => { const i = o.querySelector('#dlgAmt'); i && i.focus(); i && i.select(); }, 50);
  };
  function applyCapital(mode, amt, note) {
    if (mode === 'deposit') { const a = N.account(); if (a.cur && !a.cur.blown && a.bal <= a.cur.capital * N.cfg.blowPct / 100) L.add({ type: 'blowup', amount: a.bal, note: 'Account blown' }); L.add({ type: 'deposit', amount: amt, note: note || 'Capital added' }); }
    else if (mode === 'withdraw') L.add({ type: 'withdraw', amount: amt, note: note || 'Withdrawal' });
    else if (mode === 'reset') { const a = N.account(); if (a.cur && !a.cur.blown) L.add({ type: 'blowup', amount: a.bal, note: 'Account reset' }); if (a.bal > 0) L.add({ type: 'writeoff', amount: a.bal, note: 'Residual written off' }); L.add({ type: 'deposit', amount: amt, note: note || 'Fresh start' }); }
    N.updateBalanceChip(); if (dashOpen) renderDash(); N.toast(mode === 'withdraw' ? 'Withdrawn ' + inr(amt, 0) : 'Capital added: ' + inr(amt, 0), 'info');
  }
  // change the account's starting capital (rewrites the opening ledger entry, so every curve/ROI re-bases)
  N.setStartCapital = function (v) {
    v = Math.round(v); if (!(v >= 100)) return false;
    N.cfg.capital = v; N.saveCfg && N.saveCfg();
    const e = L.list.find(x => x.type === 'start'); if (e) { e.amount = v; L.save(); }
    N.updateBalanceChip(); if (dashOpen) renderDash(); N.toast('Starting capital set to ' + inr(v, 0), 'info'); return true;
  };
  N.capitalAction = mode => N.askCapital(mode, (v, note) => applyCapital(mode, v, note));
  // called after every closed trade
  N.checkBlowup = function () {
    N.updateBalanceChip(); const a = N.account(), c = a.cur; if (!c || c.blown) return;
    const lvl = c.capital * (N.cfg.blowPct || 0) / 100; if (a.bal > lvl) return;
    const start = c.capital;
    dialog('💥 Account blown', '<p style="margin:0 0 8px">Balance fell to <b class="neg">' + inr(a.bal, 0) + '</b> — at or below ' + N.cfg.blowPct + '% of the ' + inr(start, 0) + ' you put into this account.</p><p class="note" style="margin:0">This is the best lesson the simulator can give you for free. It is recorded in your history (account life #' + c.n + ': ' + c.trades + ' trades, ' + sg(c.pnl, 0) + ').</p><label class="lbl" style="margin-top:10px">Fresh capital to continue (₹)</label><input type="number" id="dlgAmt" min="1" step="1000" value="' + Math.round(start) + '">', [
      { t: 'Not now', cls: 'solid', fn: () => { L.add({ type: 'blowup', amount: a.bal, note: 'Account blown' }); N.updateBalanceChip(); if (dashOpen) renderDash(); } },
      { t: 'Add capital', cls: 'solid', fn: d => { const v = parseFloat(d.querySelector('#dlgAmt').value); if (!(v > 0)) return false; L.add({ type: 'blowup', amount: a.bal, note: 'Account blown' }); L.add({ type: 'deposit', amount: v, note: 'Added after blow-up' }); N.updateBalanceChip(); if (dashOpen) renderDash(); } },
      { t: 'Reset to fresh account', cls: 'buy', fn: d => { const v = parseFloat(d.querySelector('#dlgAmt').value); if (!(v > 0)) return false; L.add({ type: 'blowup', amount: a.bal, note: 'Account blown' }); if (a.bal > 0) L.add({ type: 'writeoff', amount: a.bal, note: 'Residual written off' }); L.add({ type: 'deposit', amount: v, note: 'Fresh start after blow-up' }); N.updateBalanceChip(); if (dashOpen) renderDash(); } }]);
  };

  /* ====================== advanced metrics ====================== */
  const grp = (A, keyf) => { const m = new Map(); for (const t of A) { const k = keyf(t); if (k == null) continue; let g = m.get(k); if (!g) { g = { n: 0, net: 0, w: 0, r: 0, nr: 0 }; m.set(k, g); } g.n++; g.net += t.net; if (t.net > 0) g.w++; if (t.r != null && isFinite(t.r)) { g.r += t.r; g.nr++; } } return m; };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayK = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function advanced(A, cap) {
    const S = N.computeStats(A, cap), n = A.length; if (!n) return S;
    const nets = A.map(t => t.net), mean = S.net / n;
    const dn = Math.sqrt(nets.reduce((a, v) => a + Math.min(0, v) ** 2, 0) / n); S.sortino = dn > 0 ? mean / dn : null;
    const sd = n > 1 ? Math.sqrt(nets.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
    if (sd > 0 && n > 3) { S.skew = nets.reduce((a, v) => a + ((v - mean) / sd) ** 3, 0) / n; S.kurt = nets.reduce((a, v) => a + ((v - mean) / sd) ** 4, 0) / n - 3; }
    // ulcer index from equity
    const eq = S.eq; let pk = eq[0], us = 0; eq.forEach(v => { pk = Math.max(pk, v); const d = pk > 0 ? (pk - v) / pk * 100 : 0; us += d * d; }); S.ulcer = Math.sqrt(us / eq.length);
    // days
    S.byDay = grp(A, t => dayK(t.ts)); const dayNets = [...S.byDay.values()].map(g => g.net); S.days = dayNets.length; S.greenDays = dayNets.filter(v => v > 0).length; S.bestDay = Math.max(...dayNets); S.worstDay = Math.min(...dayNets); S.tpd = n / Math.max(1, S.days);
    if (S.days >= 5) { const dm = sum(dayNets, v => v) / S.days, ds = Math.sqrt(sum(dayNets, v => (v - dm) ** 2) / (S.days - 1)); S.sharpeD = ds > 0 ? dm / ds * Math.sqrt(252) : null; }
    const span = (A[n - 1].ts - A[0].ts) / 864e5; S.span = span; if (span >= 5 && cap > 0 && S.maxDDPct > 0) S.calmar = (S.net / cap * 100 * (365 / span)) / S.maxDDPct;
    // concentration
    const wins = A.filter(t => t.net > 0).sort((a, b) => b.net - a.net); S.top5 = wins.slice(0, 5).reduce((a, t) => a + t.net, 0); S.top5Share = S.grossWin > 0 ? S.top5 / S.grossWin * 100 : null; S.netExTop3 = S.net - wins.slice(0, 3).reduce((a, t) => a + t.net, 0);
    S.avgWinR = (() => { const w = A.filter(t => t.net > 0 && t.r != null); return w.length ? sum(w, t => t.r) / w.length : null; })(); S.avgLossR = (() => { const w = A.filter(t => t.net < 0 && t.r != null); return w.length ? sum(w, t => t.r) / w.length : null; })();
    // time under water
    let since = 0, longest = 0, pk2 = eq[0]; for (let i = 1; i < eq.length; i++) { if (eq[i] >= pk2) { pk2 = eq[i]; since = 0; } else since++; longest = Math.max(longest, since); } S.uwNow = since; S.uwLongest = longest;
    // behaviour
    const after = { w: { n: 0, net: 0, w: 0 }, l: { n: 0, net: 0, w: 0 } }, quick = { n: 0, net: 0 }; let szUp = 0, szN = 0;
    for (let i = 1; i < n; i++) { const p = A[i - 1], t = A[i], g = p.net > 0 ? after.w : p.net < 0 ? after.l : null; if (g) { g.n++; g.net += t.net; if (t.net > 0) g.w++; } if (p.net < 0) { if (t.ts - p.ts < 180000) { quick.n++; quick.net += t.net; } if (p.qty > 0) { szN++; if (t.qty > p.qty * 1.25) szUp++; } } }
    S.after = after; S.quick = quick; S.szUp = szUp; S.szN = szN;
    S.byWd = grp(A, t => new Date(t.ts).getDay()); S.byMonth = grp(A, t => { const d = new Date(t.ts); return d.getFullYear() * 100 + d.getMonth(); });
    S.bySym = grp(A, t => t.sym); S.byTf = grp(A, t => t.tf == null ? null : N.tfLabel(t.tf)); S.byHr = grp(A, t => t.clock ? parseInt(t.clock.slice(0, 2), 10) : null);
    S.byExit = grp(A, t => t.reason || 'MANUAL'); S.byTag = grp(A, t => t.tag || null); S.byDir2 = grp(A, t => t.dir === 1 ? 'Long' : 'Short');
    const hb = [['< 1 min', 60], ['1–5 min', 300], ['5–15 min', 900], ['15–30 min', 1800], ['30–60 min', 3600], ['> 1 hr', 1e12]];
    S.byHold = grp(A.filter(t => t.dur != null), t => { for (let i = 0; i < hb.length; i++) if (t.dur < hb[i][1]) return i; return hb.length - 1; }); S.holdLabs = hb.map(x => x[0]);
    const rk = A.filter(t => t.risk > 0).map(t => t.risk * t.qty).sort((a, b) => a - b); if (rk.length >= 8) { const q1 = rk[Math.floor(rk.length / 3)], q2 = rk[Math.floor(rk.length * 2 / 3)]; S.byRisk = grp(A.filter(t => t.risk > 0), t => { const r = t.risk * t.qty; return r <= q1 ? 0 : r <= q2 ? 1 : 2; }); S.riskCuts = [q1, q2]; }
    // rolling 20
    S.roll = []; for (let i = 19; i < n; i++) { const w = A.slice(i - 19, i + 1); S.roll.push({ wr: w.filter(t => t.net > 0).length / 20 * 100, ex: sum(w, t => t.net) / 20 }); }
    return S;
  }
  // bootstrap Monte-Carlo of the next N trades
  function monteCarlo(A, startBal, steps, paths) {
    const nets = A.map(t => t.net); if (nets.length < 8) return null; steps = steps || 100; paths = paths || 300; const all = []; let up = 0, ruin = 0, dd20 = 0;
    for (let p = 0; p < paths; p++) { let b = startBal, pk = b, md = 0; const arr = [b]; for (let i = 0; i < steps; i++) { b += nets[Math.floor(Math.random() * nets.length)]; arr.push(b); if (b > pk) pk = b; md = Math.max(md, (pk - b) / pk); } all.push(arr); if (b > startBal) up++; if (md >= 0.2) dd20++; if (Math.min(...arr) <= startBal * (N.cfg.blowPct / 100)) ruin++; }
    const q = f => { const out = []; for (let i = 0; i <= steps; i++) { const col = all.map(a => a[i]).sort((x, y) => x - y); out.push(col[Math.floor(f * (paths - 1))]); } return out; };
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), probUp: up / paths * 100, probDD20: dd20 / paths * 100, probRuin: ruin / paths * 100, steps };
  }

  /* ====================== canvas helpers ====================== */
  function prep(cv, h) { const dpr = window.devicePixelRatio || 1, w = Math.max(120, cv.clientWidth || 300); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h }; }
  function lineChart(cv, series, o) {
    o = o || {}; const { x, w, h } = prep(cv, o.h || 150); const padL = 4, padR = 46, padT = 10, padB = 16; let mn = Infinity, mx = -Infinity, nn = 0; series.forEach(s => s.v.forEach(v => { if (v == null) return; mn = Math.min(mn, v); mx = Math.max(mx, v); nn = Math.max(nn, s.v.length); })); if (!isFinite(mn)) return; if (mn === mx) { mn -= 1; mx += 1; } if (o.zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); } const pd = (mx - mn) * 0.08; mn -= pd; mx += pd;
    const X = i => padL + i / Math.max(1, nn - 1) * (w - padL - padR), Y = v => padT + (1 - (v - mn) / (mx - mn)) * (h - padT - padB);
    x.font = '10px system-ui'; x.fillStyle = css('--dim'); x.textAlign = 'left'; x.textBaseline = 'middle'; x.strokeStyle = css('--border'); x.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3, y = Y(v); x.beginPath(); x.setLineDash([2, 4]); x.moveTo(padL, y); x.lineTo(w - padR, y); x.stroke(); x.setLineDash([]); x.fillText(o.fmt ? o.fmt(v) : Math.abs(v) >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : Math.round(v), w - padR + 4, y); }
    if (o.zero) { x.strokeStyle = css('--dim'); x.beginPath(); x.moveTo(padL, Y(0)); x.lineTo(w - padR, Y(0)); x.stroke(); }
    series.forEach(s => {
      if (s.band) { x.fillStyle = s.col + '22'; x.beginPath(); s.band[0].forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); for (let i = s.band[1].length - 1; i >= 0; i--) x.lineTo(X(i), Y(s.band[1][i])); x.closePath(); x.fill(); }
      if (s.fill) { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, s.col + '44'); g.addColorStop(1, s.col + '00'); x.beginPath(); s.v.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.lineTo(X(s.v.length - 1), h - padB); x.lineTo(X(0), h - padB); x.closePath(); x.fillStyle = g; x.fill(); }
      x.strokeStyle = s.col; x.lineWidth = s.w || 1.8; x.lineJoin = 'round'; x.setLineDash(s.dash || []); x.beginPath(); s.v.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.stroke(); x.setLineDash([]);
    });
    if (o.marks) o.marks.forEach(m => { const px = X(m.i), py = Y(m.v); x.fillStyle = m.col; x.strokeStyle = css('--panel'); x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); x.stroke(); });
    return { X, Y, n: nn };
  }
  function barChart(cv, vals, labels, o) {
    o = o || {}; const { x, w, h } = prep(cv, o.h || 90), up = N.cfg.upColor, dn = N.cfg.downColor; if (!vals.length) return;
    const padB = labels ? 15 : 4, padT = 6, mxv = Math.max(...vals.map(Math.abs), 1e-9), zero = o.positive ? h - padB : padT + (h - padT - padB) / 2, half = o.positive ? h - padT - padB : (h - padT - padB) / 2, bw = w / vals.length;
    x.strokeStyle = css('--border'); x.beginPath(); x.moveTo(0, zero + .5); x.lineTo(w, zero + .5); x.stroke();
    vals.forEach((v, i) => { const hh = Math.abs(v) / mxv * (half - 2); x.fillStyle = o.color ? o.color(v, i) : (v >= 0 ? up : dn); x.fillRect(i * bw + bw * .14, v >= 0 ? zero - hh : zero, bw * .72, Math.max(v === 0 ? 0 : 1, hh)); });
    if (labels) { x.fillStyle = css('--dim'); x.font = '9.5px system-ui'; x.textAlign = 'center'; const ev = Math.ceil(labels.length / Math.max(1, Math.floor(w / 28))); labels.forEach((l, i) => { if (i % ev === 0) x.fillText(l, i * bw + bw / 2, h - 3); }); }
  }
  function scatter(cv, pts, o) {
    o = o || {}; const { x, w, h } = prep(cv, o.h || 150), padL = 30, padB = 18, padT = 8, padR = 8; if (!pts.length) return; let x0 = Math.min(0, ...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(0, ...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y)); if (x1 === x0) x1 += 1; if (y1 === y0) y1 += 1;
    const X = v => padL + (v - x0) / (x1 - x0) * (w - padL - padR), Y = v => padT + (1 - (v - y0) / (y1 - y0)) * (h - padT - padB);
    x.strokeStyle = css('--border'); x.lineWidth = 1; x.beginPath(); x.moveTo(padL, Y(0) + .5); x.lineTo(w - padR, Y(0) + .5); x.moveTo(X(0) + .5, padT); x.lineTo(X(0) + .5, h - padB); x.stroke();
    x.fillStyle = css('--dim'); x.font = '9.5px system-ui'; x.textAlign = 'center'; x.fillText(o.xl || '', w / 2, h - 3); x.save(); x.translate(9, h / 2); x.rotate(-Math.PI / 2); x.fillText(o.yl || '', 0, 0); x.restore();
    pts.forEach(p => { x.fillStyle = (p.win ? N.cfg.upColor : N.cfg.downColor) + 'bb'; x.beginPath(); x.arc(X(p.x), Y(p.y), 3.2, 0, 7); x.fill(); });
  }

  /* ====================== dashboard UI ====================== */
  let dashOpen = false, tab = 'overview', F = { range: 'all', sym: '', life: '', dir: '', res: '', tag: '', sort: 'new', q: '', day: '' }, calMonth = null, vis = [], lastS = null;
  const kpi = (k, v, sub, c, ex) => '<div class="kpi tap ' + (ex || '') + '" data-kpi="' + esc(k) + '"><div class="k">' + k + '</div><div class="v ' + (c || '') + '">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  function filtered(acct) {
    let A = T.list.slice(); const now = Date.now();
    if (F.sym) A = A.filter(t => t.sym === F.sym);
    if (F.range === 'today') { const k = dayK(now); A = A.filter(t => dayK(t.ts) === k); } else if (F.range === '7d') A = A.filter(t => t.ts >= now - 7 * 864e5); else if (F.range === '30d') A = A.filter(t => t.ts >= now - 30 * 864e5); else if (F.range === '90d') A = A.filter(t => t.ts >= now - 90 * 864e5); else if (/^\d+$/.test(F.range)) A = A.slice(-parseInt(F.range, 10));
    if (F.life) A = A.filter(t => String(acct.tradeLife[t.id]) === F.life);
    return A;
  }
  function filterBar(acct, withTrades) {
    const syms = [...new Set(T.list.map(t => t.sym))].sort(), lives = acct.lives;
    let h = '<div class="fbar"><select data-f="range">' + [['all', 'All time'], ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['20', 'Last 20'], ['50', 'Last 50'], ['100', 'Last 100']].map(x => '<option value="' + x[0] + '"' + (F.range === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>';
    h += '<select data-f="sym"><option value="">All symbols</option>' + syms.map(s => '<option' + (F.sym === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>';
    if (lives.length > 1) h += '<select data-f="life"><option value="">All account lives</option>' + lives.map(l => '<option value="' + l.n + '"' + (F.life === String(l.n) ? ' selected' : '') + '>Life #' + l.n + (l.blown ? ' ✖' : '') + '</option>').join('') + '</select>';
    return h + '</div>';
  }
  function tabs() { return [['overview', 'gauge', 'Overview'], ['trades', 'list', 'Trades'], ['account', 'wallet', 'Account'], ['insights', 'brain', 'Insights'], ['risk', 'shield', 'Risk lab'], ['discipline', 'target', 'Discipline'], ['calendar', 'calendar', 'Calendar']].map(t => '<button class="dtab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + N.icon(t[1], 16) + '<span>' + t[2] + '</span></button>').join(''); }

  function renderDash() {
    const root = $('dash'); if (!root) return; const acct = N.account(), A = filtered(acct), S = advanced(A, N.cfg.capital); lastS = S; vis = A;
    const scrollTop = root.querySelector('.db') ? root.querySelector('.db').scrollTop : 0;
    root.innerHTML = '<div class="dh"><div class="dt">' + N.icon('dashb', 20) + '<b>Performance dashboard</b></div><div class="dtabs">' + tabs() + '</div><button class="btn icon" id="dashClose" title="Close (Esc)">' + N.icon('x', 18) + '</button></div><div class="db" id="dashBody"></div>';
    const body = $('dashBody'); let h = '';
    if (tab === 'overview') h = vOverview(S, A, acct); else if (tab === 'trades') h = vTrades(A, acct); else if (tab === 'account') h = vAccount(S, acct); else if (tab === 'insights') h = vInsights(S, A); else if (tab === 'risk') h = vRisk(S, A, acct); else if (tab === 'discipline') h = vDisc(S, A, acct); else h = vCalendar(A, acct);
    body.innerHTML = h; N.hydrate(body);
    root.querySelectorAll('.dtab').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderDash(); });
    $('dashClose').onclick = closeDash;
    body.querySelectorAll('[data-f]').forEach(el => el.onchange = el.oninput = () => { F[el.dataset.f] = el.value; if (el.dataset.f === 'q') { clearTimeout(el._t); el._t = setTimeout(renderDash, 250); } else renderDash(); });
    body.querySelectorAll('.kpi.tap').forEach(el => el.onclick = () => explainKpi(el)); body.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => N.resetDialog(b.dataset.reset));
    afterRender(S, A, acct); afterRender2(S, A, acct); body.scrollTop = scrollTop;
  }
  function vOverview(S, A, acct) {
    let h = filterBar(acct);
    if (!S.n) return h + '<div class="empty">No closed trades in this range yet.<br>Take a few trades — every number here builds from your own journal and never leaves this browser.</div>' + vAccountStrip(acct);
    h += vAccountStrip(acct) + '<div class="dgrid kpis">';
    h += kpi('Net P&L', sg(S.net), S.roi != null ? pct(S.roi, 2) + ' on ' + inr(N.cfg.capital, 0) : '', cl(S.net), 'hero');
    h += kpi('Win rate', pct(S.winRate), S.wins + 'W · ' + S.losses + 'L' + (S.scratch ? ' · ' + S.scratch + 'S' : ''));
    h += kpi('Profit factor', S.pf === Infinity ? '∞' : fx(S.pf), 'GW ' + inr(S.grossWin, 0) + ' / GL ' + inr(S.grossLoss, 0), S.pf >= 1 ? 'pos' : 'neg');
    h += kpi('Expectancy', sg(S.expect, 0), S.avgR != null ? fx(S.avgR) + 'R / trade' : 'per trade', cl(S.expect));
    h += kpi('Avg win / loss', inr(S.avgWin, 0) + ' / ' + inr(S.avgLoss, 0), S.payoff != null ? 'payoff ' + fx(S.payoff) + ':1' : '');
    h += kpi('Max drawdown', inr(S.maxDD, 0), pct(S.maxDDPct, 2) + (S.curDD > 0 ? ' · now ' + inr(S.curDD, 0) : ' · at peak'), S.maxDD > 0 ? 'neg' : '');
    h += kpi('Sharpe (trade)', fx(S.sharpe), S.sharpeD != null ? 'daily annualised ' + fx(S.sharpeD) : 'mean ÷ stdev');
    h += kpi('Sortino', fx(S.sortino), 'penalises downside only');
    h += kpi('Calmar', fx(S.calmar), S.calmar == null ? 'needs 5+ days' : 'annualised ROI ÷ max DD');
    h += kpi('Recovery factor', fx(S.recovery), 'net ÷ max drawdown');
    h += kpi('SQN', fx(S.sqn), S.sqn == null ? 'needs 3+ trades with R' : S.sqn >= 3 ? 'excellent' : S.sqn >= 2 ? 'good' : S.sqn >= 1 ? 'developing' : 'weak', S.sqn >= 2 ? 'pos' : '');
    h += kpi('Kelly (full)', S.kelly == null ? '—' : fx(S.kelly, 1) + '%', 'use ¼–½ of it', S.kelly > 0 ? 'pos' : 'neg');
    h += kpi('Ulcer index', fx(S.ulcer), 'depth + duration of drawdowns', S.ulcer > 8 ? 'neg' : '');
    h += kpi('Streaks', S.maxWinStreak + 'W · ' + S.maxLossStreak + 'L', 'now ' + (S.curStreak > 0 ? S.curStreak + ' wins' : S.curStreak < 0 ? -S.curStreak + ' losses' : '—'));
    h += kpi('Avg hold', S.avgHold == null ? '—' : N.dur(S.avgHold), 'win ' + (S.holdWin == null ? '—' : N.dur(S.holdWin)) + ' · loss ' + (S.holdLoss == null ? '—' : N.dur(S.holdLoss)));
    h += kpi('Charges paid', inr(S.charges, 0), 'gross ' + sg(S.gross, 0), 'neg');
    h += kpi('Trading days', S.days + '', S.greenDays + ' green · ' + (S.days - S.greenDays) + ' red · ' + fx(S.tpd, 1) + ' trades/day');
    h += kpi('Best / worst day', sg(S.bestDay, 0) + ' / ' + sg(S.worstDay, 0));
    h += kpi('Top-5 wins share', S.top5Share == null ? '—' : fx(S.top5Share, 0) + '%', 'of gross profit · without top 3: ' + sg(S.netExTop3, 0), S.netExTop3 > 0 ? '' : 'neg');
    h += kpi('Avg R win / loss', S.avgWinR == null ? '—' : fx(S.avgWinR) + 'R / ' + fx(S.avgLossR) + 'R');
    if (S.avgMFE != null) { h += kpi('Avg MFE / MAE', fx(S.avgMFE) + 'R / ' + fx(S.avgMAE) + 'R', 'best run vs worst heat'); h += kpi('Exit efficiency', S.eff == null ? '—' : fx(S.eff, 0) + '%', 'of peak captured on winners', S.eff >= 60 ? 'pos' : ''); }
    if (S.skew != null) h += kpi('Skew · kurtosis', fx(S.skew) + ' · ' + fx(S.kurt), S.skew > 0 ? 'right tail: big winners' : 'left tail: big losers', S.skew > 0 ? 'pos' : 'neg');
    h += '</div>';
    h += '<div class="dcols"><div class="dcard"><h3>Equity curve <span>deposits ● blow-ups ✖ marked</span></h3><canvas id="cvEq"></canvas></div><div class="dcard"><h3>Drawdown <span>% below peak</span></h3><canvas id="cvDd"></canvas></div></div>';
    h += '<div class="dcols"><div class="dcard"><h3>Net per trade</h3><canvas id="cvPer"></canvas></div><div class="dcard"><h3>R-multiple distribution <span>' + S.nR + ' with R</span></h3><canvas id="cvR"></canvas></div></div>';
    h += '<div class="dcols"><div class="dcard"><h3>Rolling 20 trades <span>win rate % · expectancy ₹</span></h3><canvas id="cvRoll"></canvas></div><div class="dcard"><h3>Next 100 trades — Monte Carlo <span>10–90% fan from your own results</span></h3><canvas id="cvMc"></canvas><div class="note" id="mcNote"></div></div></div>';
    return h;
  }
  function vAccountStrip(acct) {
    const c = acct.cur; return '<div class="astrip"><span>Balance <b>' + inr(acct.bal, 0) + '</b></span><span>Deposited <b>' + inr(acct.deposited, 0) + '</b></span><span>Top-ups <b>' + acct.topups + '</b></span><span>Blow-ups <b class="' + (acct.blowups ? 'neg' : '') + '">' + acct.blowups + '</b></span><span>Lives <b>' + acct.lives.length + '</b></span>' + (c ? '<span>This life <b>#' + c.n + '</b></span>' : '') + '<span class="grow"></span><button class="btn sm solid" data-cap="deposit">' + N.icon('plus', 13) + ' Add capital</button></div>';
  }
  function vTrades(A, acct) {
    let L2 = A.slice();
    if (F.dir) L2 = L2.filter(t => (t.dir === 1 ? 'L' : 'S') === F.dir);
    if (F.res === 'win') L2 = L2.filter(t => t.net > 0); else if (F.res === 'loss') L2 = L2.filter(t => t.net < 0); else if (F.res && F.res.startsWith('x:')) L2 = L2.filter(t => (t.reason || 'MANUAL') === F.res.slice(2));
    if (F.tag) L2 = L2.filter(t => (t.tag || '') === F.tag); if (F.day) L2 = L2.filter(t => dayK(t.ts) === F.day);
    if (F.q) { const q = F.q.toLowerCase(); L2 = L2.filter(t => (t.sym + ' ' + (t.note || '') + ' ' + (t.tag || '')).toLowerCase().includes(q)); }
    const so = { new: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts, best: (a, b) => b.net - a.net, worst: (a, b) => a.net - b.net, r: (a, b) => (b.r || -99) - (a.r || -99), hold: (a, b) => (b.dur || 0) - (a.dur || 0) }[F.sort] || ((a, b) => b.ts - a.ts); L2.sort(so); vis = L2;
    const net = sum(L2, t => t.net), w = L2.filter(t => t.net > 0).length;
    const tags = [...new Set(T.list.map(t => t.tag).filter(Boolean))], exits = [...new Set(T.list.map(t => t.reason || 'MANUAL'))];
    let h = filterBar(acct) + '<div class="fbar chips">' +
      [['', 'All'], ['win', 'Winners'], ['loss', 'Losers']].map(x => '<button class="chip' + (F.res === x[0] ? ' on' : '') + '" data-set="res:' + x[0] + '">' + x[1] + '</button>').join('') +
      [['', 'L+S'], ['L', 'Long'], ['S', 'Short']].map(x => '<button class="chip' + (F.dir === x[0] ? ' on' : '') + '" data-set="dir:' + x[0] + '">' + x[1] + '</button>').join('') +
      '<select data-f="res"><option value="">Any exit</option>' + exits.map(x => '<option value="x:' + esc(x) + '"' + (F.res === 'x:' + x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>' +
      (tags.length ? '<select data-f="tag"><option value="">Any tag</option>' + tags.map(x => '<option' + (F.tag === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>' : '') +
      '<select data-f="sort">' + [['new', 'Newest'], ['old', 'Oldest'], ['best', 'Best P&L'], ['worst', 'Worst P&L'], ['r', 'Best R'], ['hold', 'Longest hold']].map(x => '<option value="' + x[0] + '"' + (F.sort === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
      '<input type="search" data-f="q" placeholder="search symbol / note" value="' + esc(F.q) + '">' + (F.day ? '<button class="chip on" data-set="day:">' + F.day + ' ✕</button>' : '') + '</div>';
    h += '<div class="astrip"><span>Showing <b>' + L2.length + '</b></span><span>Net <b class="' + cl(net) + '">' + sg(net, 0) + '</b></span><span>Win rate <b>' + (L2.length ? pct(w / L2.length * 100, 0) : '—') + '</b></span><span class="grow"></span><span class="dim">tap a trade to see its chart</span></div>';
    if (!L2.length) return h + '<div class="empty">No trades match these filters.</div>';
    h += '<div class="tlist">' + L2.slice(0, 300).map((t, i) => {
      const win = t.net >= 0, rr = t.r != null ? (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R' : '';
      return '<div class="trow" data-i="' + i + '" style="border-left:3px solid ' + (win ? 'var(--up)' : 'var(--down)') + '"><div class="t1"><span><b class="' + (t.dir === 1 ? 'pos' : 'neg') + '">' + (t.dir === 1 ? 'LONG' : 'SHORT') + '</b> <b>' + esc(t.sym) + '</b> ×' + t.qty + ' <i class="tg">' + esc(t.reason || '') + '</i>' + (t.tag ? ' <i class="tg">' + esc(t.tag) + '</i>' : '') + '</span><b class="num ' + cl(t.net) + '">' + sg(t.net, 2) + '</b></div><div class="t2 num">' + t.entry.toFixed(2) + ' → ' + t.exit.toFixed(2) + (rr ? ' · <span class="' + cl(t.r) + '">' + rr + '</span>' : '') + ' · ' + dtstr(t.ts) + (t.dur != null ? ' · ' + N.dur(t.dur) : '') + '</div></div>';
    }).join('') + '</div>' + (L2.length > 300 ? '<div class="note">Showing the first 300 of ' + L2.length + '.</div>' : '');
    return h;
  }
  function vAccount(S, acct) {
    let h = '<div class="dgrid kpis">';
    h += kpi('Balance', inr(acct.bal, 0), 'incl. all trades', '', 'hero');
    h += kpi('Capital put in', inr(acct.deposited, 0), acct.topups + ' top-ups after start');
    h += kpi('Withdrawn', inr(acct.withdrawn, 0)); h += kpi('Written off', inr(acct.written, 0), 'after blow-ups', acct.written ? 'neg' : '');
    h += kpi('Blow-ups', acct.blowups + '', acct.blowups ? 'dropped to ≤ ' + N.cfg.blowPct + '% of capital' : 'none yet — keep it that way', acct.blowups ? 'neg' : 'pos');
    h += kpi('Account lives', acct.lives.length + '', 'each blow-up + fresh start = a new life');
    h += kpi('Total net P&L', sg(acct.net, 0), 'all trades ever', cl(acct.net)); h += kpi('Max DD (all)', inr(acct.maxDD, 0), pct(acct.maxDDPct, 1), acct.maxDD ? 'neg' : '');
    h += '</div><div class="btnrow"><button class="btn solid" data-cap="deposit">' + N.icon('plus', 14) + ' Add capital</button><button class="btn solid" data-cap="withdraw">' + N.icon('minus', 14) + ' Withdraw</button><button class="btn solid" data-cap="reset">' + N.icon('restart', 14) + ' Reset / fresh account</button></div>';
    h += '<div class="dcard"><h3>Account lives <span>one row per account — a blow-up ends a life</span></h3><div class="twrap"><table class="tbl"><thead><tr><th>#</th><th>Started</th><th>Capital</th><th>Top-ups</th><th>Trades</th><th>Win%</th><th>P&amp;L</th><th>Max DD</th><th>Ended</th></tr></thead><tbody>' + acct.lives.slice().reverse().map(l => '<tr><td>' + l.n + '</td><td>' + dstr(l.startTs) + '</td><td>' + inr(l.capital, 0) + '</td><td>' + l.topups + '</td><td>' + l.trades + '</td><td>' + (l.trades ? Math.round(l.wins / l.trades * 100) + '%' : '—') + '</td><td class="' + cl(l.pnl) + '">' + sg(l.pnl, 0) + '</td><td class="neg">' + inr(l.maxDD, 0) + '</td><td>' + (l.blown ? '<b class="neg">✖ blown ' + dstr(l.endTs) + '</b>' : '<span class="pos">active</span>') + '</td></tr>').join('') + '</tbody></table></div></div>';
    h += '<div class="dcard"><h3>Ledger <span>capital events</span></h3><div class="ledger">' + L.list.slice().reverse().map(e => { const meta = { start: ['Start', 'pos', '+'], deposit: ['Deposit', 'pos', '+'], withdraw: ['Withdraw', 'neg', '−'], writeoff: ['Write-off', 'neg', '−'], blowup: ['Blow-up', 'neg', '✖'] }[e.type] || [e.type, '', '']; return '<div class="lrow"><span class="lt ' + meta[1] + '">' + meta[0] + '</span><span class="num">' + (e.type === 'blowup' ? 'at ' + inr(e.amount, 0) : meta[2] + inr(e.amount, 0)) + '</span><span class="dim">' + dstr(e.ts) + (e.note ? ' · ' + esc(e.note) : '') + '</span>' + (e.type !== 'start' ? '<button class="btn icon sm" data-delev="' + e.id + '" title="Remove entry">' + N.icon('x', 13) + '</button>' : '') + '</div>'; }).join('') + '</div></div>';
    h += '<div class="dcard"><h3>Reset <span>start clean — back up first</span></h3><div class="btnrow"><button class="btn solid" data-reset="trades">' + N.icon('trash', 14) + ' Reset all trades</button><button class="btn solid" data-reset="capital">' + N.icon('wallet', 14) + ' Reset capital</button><button class="btn sell" data-reset="all">' + N.icon('restart', 14) + ' Reset everything</button></div></div>';
    h += '<div class="dcard"><h3>Starting capital <span>the base for ROI, drawdown % and the blow-up level</span></h3><div class="frow"><div class="ft"><span>Default / starting capital (₹)</span><span class="fs">Editing it re-bases your whole history; use “Add capital” for a top-up instead</span></div><div class="ctl"><input type="number" id="startCap" min="100" step="1000" value="' + (L.list.find(x => x.type === 'start') || { amount: N.cfg.capital }).amount + '"><button class="btn sm solid" id="startCapBtn">Save</button></div></div></div>';
    h += '<div class="dcard"><h3>Blow-up threshold</h3><div class="frow"><div class="ft"><span>Account counts as blown at</span><span class="fs">% of the capital you put into that account life</span></div><div class="ctl"><input type="number" id="blowPct" min="0" max="90" step="5" value="' + N.cfg.blowPct + '"><span class="val">%</span></div></div></div>';
    return h;
  }
  function tbl(title, map, labelFn, sortFn, note) {
    if (!map || !map.size) return ''; let rows = [...map.entries()]; rows.sort(sortFn || ((a, b) => a[0] > b[0] ? 1 : -1));
    return '<div class="dcard"><h3>' + title + '</h3><div class="twrap"><table class="tbl"><thead><tr><th></th><th>#</th><th>Win%</th><th>Avg</th><th>Net</th></tr></thead><tbody>' + rows.map(([k, g]) => '<tr><td>' + esc(labelFn ? labelFn(k) : k) + '</td><td>' + g.n + '</td><td>' + Math.round(g.w / g.n * 100) + '%</td><td class="' + cl(g.net) + '">' + sg(g.net / g.n, 0) + '</td><td class="' + cl(g.net) + '">' + sg(g.net, 0) + '</td></tr>').join('') + '</tbody></table></div>' + (note ? '<div class="note">' + note + '</div>' : '') + '</div>';
  }
  function insightsText(S) {
    const out = [], G = (m, f) => { const a = [...m.entries()].filter(([, g]) => g.n >= 3); return a.length ? a.sort(f) : []; };
    const hr = G(S.byHr, (a, b) => b[1].net - a[1].net); if (hr.length > 1) { out.push('Your best entry hour is <b>' + hr[0][0] + ':00</b> (' + sg(hr[0][1].net, 0) + ' over ' + hr[0][1].n + ' trades); your worst is <b>' + hr[hr.length - 1][0] + ':00</b> (' + sg(hr[hr.length - 1][1].net, 0) + '). Skipping the worst hour would have changed your net by ' + sg(-hr[hr.length - 1][1].net, 0) + '.'); }
    const tg = G(S.byTag, (a, b) => a[1].net - b[1].net); if (tg.length) out.push('Your most expensive habit is <b>' + esc(tg[0][0]) + '</b>: ' + sg(tg[0][1].net, 0) + ' over ' + tg[0][1].n + ' trades.');
    const L1 = S.byDir2.get('Long'), S1 = S.byDir2.get('Short'); if (L1 && S1 && L1.n >= 3 && S1.n >= 3) out.push('Longs: ' + sg(L1.net, 0) + ' (' + Math.round(L1.w / L1.n * 100) + '% wins) vs shorts: ' + sg(S1.net, 0) + ' (' + Math.round(S1.w / S1.n * 100) + '%). ' + (L1.net > S1.net ? 'You read upside better.' : 'You read downside better.'));
    if (S.after.l.n >= 4 && S.after.w.n >= 4) { const a = S.after.l.w / S.after.l.n * 100, b = S.after.w.w / S.after.w.n * 100; out.push('After a loss your next-trade win rate is <b>' + a.toFixed(0) + '%</b> vs <b>' + b.toFixed(0) + '%</b> after a win' + (a < b - 8 ? ' — losses are costing you focus. Consider a 5-minute break rule after any loss.' : '.')); }
    if (S.quick.n >= 3) out.push('<b>' + S.quick.n + '</b> trades were closed within 3 minutes of a losing trade (net ' + sg(S.quick.net, 0) + ')' + (S.quick.net < 0 ? ' — classic revenge / re-entry pattern.' : '.')); if (S.szN >= 4 && S.szUp / S.szN > 0.25) out.push('You sized up by 25%+ right after a loss in <b>' + S.szUp + ' of ' + S.szN + '</b> cases — a tilt signal.');
    if (S.gaveBack) out.push('<b>' + S.gaveBack + '</b> of your losing trades were at least +1R at some point. A rule to scale out or move the stop to breakeven at +1R would have saved them.');
    if (S.avgMFE != null && S.eff != null) out.push('On winners you capture about <b>' + S.eff.toFixed(0) + '%</b> of the best price reached. ' + (S.eff < 50 ? 'You are exiting early — consider a trail.' : 'Healthy exit efficiency.'));
    if (S.top5Share != null && S.top5Share > 60) out.push('Top-5 winners make up <b>' + S.top5Share.toFixed(0) + '%</b> of gross profit — results lean on a few big trades; keep your stops honest so you stay alive for them.');
    if (S.uwNow > 0) out.push('You are <b>' + S.uwNow + ' trades</b> below your equity peak (longest stretch so far: ' + S.uwLongest + ').');
    return out;
  }
  function vInsights(S, A) {
    let h = filterBar(N.account()); if (!S.n) return h + '<div class="empty">Not enough trades yet.</div>';
    const ins = insightsText(S); h += '<div class="dcard"><h3>Edge report <span>generated from your trades</span></h3>' + (ins.length ? '<ul class="ins">' + ins.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '<div class="note">Keep trading — patterns need a few more trades per bucket.</div>') + '</div>';
    h += '<div class="dcols"><div class="dcard"><h3>By hour of entry <span>net ₹</span></h3><canvas id="cvHr"></canvas></div><div class="dcard"><h3>By weekday <span>net ₹</span></h3><canvas id="cvWd"></canvas></div></div>';
    h += '<div class="dcols"><div class="dcard"><h3>MAE vs MFE <span>R — heat taken vs best run</span></h3><canvas id="cvMm"></canvas></div><div class="dcard"><h3>Hold time vs P&amp;L</h3><canvas id="cvHold"></canvas></div></div>';
    h += '<div class="dcols">' + tbl('Direction', S.byDir2) + tbl('Exit reason', S.byExit, null, (a, b) => b[1].n - a[1].n) + '</div>';
    h += '<div class="dcols">' + tbl('By hold time', S.byHold, k => S.holdLabs[k], (a, b) => a[0] - b[0]) + (S.byRisk ? tbl('By position risk', S.byRisk, k => ['Small (≤ ' + inr(S.riskCuts[0], 0) + ')', 'Medium', 'Large (> ' + inr(S.riskCuts[1], 0) + ')'][k], (a, b) => a[0] - b[0]) : '') + '</div>';
    h += '<div class="dcols">' + tbl('By symbol', S.bySym, null, (a, b) => b[1].net - a[1].net) + tbl('By timeframe', S.byTf, null, (a, b) => b[1].n - a[1].n) + '</div>';
    if (S.byTag.size) h += tbl('By tag — your behaviour', S.byTag, null, (a, b) => a[1].net - b[1].net, 'Tag trades in the Journal or the trade viewer. Red rows are your most expensive habits.');
    h += '<div class="dcols">' + tbl('By month', S.byMonth, k => MO[k % 100] + " '" + String(Math.floor(k / 100)).slice(2), (a, b) => a[0] - b[0]) + tbl('After a win / loss', new Map([['After a win', S.after.w], ['After a loss', S.after.l]].filter(x => x[1].n)), null, (a, b) => 0) + '</div>';
    return h;
  }
  function vCalendar(A, acct) {
    const now = new Date(); if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
    const by = grp(vis, t => dayK(t.ts)), first = new Date(calMonth.y, calMonth.m, 1), nd = new Date(calMonth.y, calMonth.m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7; let mx = 1, mnet = 0, mn = 0, wins = 0, gd = 0, rd = 0; by.forEach((g, k) => { const d = new Date(k + 'T00:00:00'); if (d.getFullYear() === calMonth.y && d.getMonth() === calMonth.m) { mx = Math.max(mx, Math.abs(g.net)); mnet += g.net; mn += g.n; wins += g.w; if (g.net > 0) gd++; else if (g.net < 0) rd++; } });
    let h = filterBar(acct) + '<div class="astrip"><button class="btn icon sm" data-cal="-1">' + N.icon('chev', 14) + '</button><b style="min-width:110px;text-align:center">' + MO[calMonth.m] + ' ' + calMonth.y + '</b><button class="btn icon sm" data-cal="1">' + N.icon('chev', 14) + '</button><span class="grow"></span><span>Net <b class="' + cl(mnet) + '">' + sg(mnet, 0) + '</b></span><span>' + mn + ' trades</span><span>' + gd + ' green · ' + rd + ' red days</span></div>';
    h += '<div class="cal"><div class="cw">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => '<i>' + x + '</i>').join('') + '</div><div class="cg">';
    for (let i = 0; i < lead; i++) h += '<u></u>';
    for (let d = 1; d <= nd; d++) { const k = calMonth.y + '-' + String(calMonth.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), g = by.get(k), a = g ? 0.18 + 0.72 * Math.min(1, Math.abs(g.net) / mx) : 0; h += '<b class="cd' + (g ? ' has' : '') + '" ' + (g ? 'data-day="' + k + '"' : '') + ' style="' + (g ? 'background:' + (g.net >= 0 ? N.cfg.upColor : N.cfg.downColor) + Math.round(a * 255).toString(16).padStart(2, '0') : '') + '"><em>' + d + '</em>' + (g ? '<span>' + sg(g.net, 0) + '</span><small>' + g.n + ' tr</small>' : '') + '</b>'; }
    h += '</div></div><div class="note">Tap a day to list that day\'s trades.</div>';
    return h;
  }
  function afterRender(S, A, acct) {
    const body = $('dashBody'), up = N.cfg.upColor, dn = N.cfg.downColor;
    body.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => N.capitalAction(b.dataset.cap));
    body.querySelectorAll('[data-delev]').forEach(b => b.onclick = () => { if (confirm('Remove this ledger entry?')) { L.remove(b.dataset.delev); N.updateBalanceChip(); renderDash(); } });
    body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.set.split(':'); F[k] = F[k] === v ? '' : v; renderDash(); });
    body.querySelectorAll('.trow').forEach(r => r.onclick = () => N.openTradeView(vis[+r.dataset.i], vis));
    body.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => { calMonth.m += +b.dataset.cal; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } renderDash(); });
    body.querySelectorAll('.cd.has').forEach(c => c.onclick = () => { F.day = c.dataset.day; tab = 'trades'; renderDash(); });
    const sc = $('startCapBtn'); if (sc) sc.onclick = () => { if (!N.setStartCapital(parseFloat($('startCap').value))) N.toast('Enter at least ₹100', 'error'); };
    const bp = $('blowPct'); if (bp) bp.onchange = () => { N.cfg.blowPct = Math.max(0, Math.min(90, parseFloat(bp.value) || 25)); N.saveCfg(); };
    if (tab === 'overview' && S.n) {
      // equity from the ledger timeline restricted to the visible trades
      const pts = acct.pts.filter(p => p.k !== 't' || A.some(t => t === p.t)), bals = pts.map(p => p.bal), marks = [];
      pts.forEach((p, i) => { if (p.k === 'dep' || p.k === 'start') { if (p.k === 'dep') marks.push({ i, v: p.bal, col: '#22c55e' }); } else if (p.k === 'blow') marks.push({ i, v: p.bal, col: '#ef4444' }); else if (p.k === 'wd') marks.push({ i, v: p.bal, col: '#f59e0b' }); });
      lineChart($('cvEq'), [{ v: bals, col: bals[bals.length - 1] >= bals[0] ? up : dn, fill: 1 }], { h: 170, marks });
      let pk = -Infinity; const dd = bals.map(v => { pk = Math.max(pk, v); return pk > 0 ? -(pk - v) / pk * 100 : 0; });
      lineChart($('cvDd'), [{ v: dd, col: dn, fill: 1 }], { h: 170, zero: 1, fmt: v => v.toFixed(0) + '%' });
      barChart($('cvPer'), A.map(t => t.net), null, { h: 100 });
      barChart($('cvR'), S.rBins, S.rLabs, { h: 100, positive: true, color: (v, i) => i < 6 ? dn : up });
      if (S.roll.length) lineChart($('cvRoll'), [{ v: S.roll.map(r => r.wr), col: '#60a5fa' }], { h: 130, fmt: v => v.toFixed(0) + '%' }); else { const c = $('cvRoll'); prep(c, 40); c.parentNode.insertAdjacentHTML('beforeend', '<div class="note">Needs 20+ trades.</div>'); }
      const mc = monteCarlo(A, acct.bal, 100, 300);
      if (mc) { lineChart($('cvMc'), [{ v: mc.p50, col: '#a78bfa', w: 2, band: [mc.p10, mc.p90] }, { v: mc.p10, col: '#a78bfa55', w: 1, dash: [3, 3] }, { v: mc.p90, col: '#a78bfa55', w: 1, dash: [3, 3] }], { h: 130 }); $('mcNote').innerHTML = 'Resampling your trades 300 times over the next 100: <b>' + mc.probUp.toFixed(0) + '%</b> chance of finishing above today · <b>' + mc.probDD20.toFixed(0) + '%</b> chance of a 20% drawdown on the way · <b>' + mc.probRuin.toFixed(0) + '%</b> chance of a blow-up. Assumes the future looks like your past.'; }
      else { prep($('cvMc'), 40); $('mcNote').textContent = 'Needs at least 8 trades.'; }
    } else if (tab === 'insights' && S.n) {
      const hrs = []; for (let h2 = 9; h2 <= 15; h2++) hrs.push(h2);
      barChart($('cvHr'), hrs.map(h2 => (S.byHr.get(h2) || { net: 0 }).net), hrs.map(h2 => h2 + 'h'), { h: 110 });
      const wd = [1, 2, 3, 4, 5, 6, 0]; barChart($('cvWd'), wd.map(d => (S.byWd.get(d) || { net: 0 }).net), wd.map(d => WD[d]), { h: 110 });
      scatter($('cvMm'), A.filter(t => t.risk > 0 && t.mfe != null).map(t => ({ x: t.mae / t.risk, y: t.mfe / t.risk, win: t.net > 0 })), { h: 170, xl: 'MAE (R) →', yl: 'MFE (R)' });
      scatter($('cvHold'), A.filter(t => t.dur != null).map(t => ({ x: t.dur / 60, y: t.net, win: t.net > 0 })), { h: 170, xl: 'hold (min) →', yl: 'net ₹' });
    }
  }
  function openDash(t) { if (t) tab = t; dashOpen = true; $('dash').classList.add('show'); document.body.classList.add('dash-open'); renderDash(); }
  function closeDash() { dashOpen = false; $('dash').classList.remove('show'); document.body.classList.remove('dash-open'); closeTradeView(); }
  N.openDash = openDash; N.closeDash = closeDash; N.dashRefresh = () => { if (dashOpen) renderDash(); };


  /* ---------- tap any metric tile → what it means ---------- */
  const GLOSS = {
    'net p&l': ['Everything you made or lost after charges, summed over the trades in view.', 'Σ (exit − entry) × qty × direction − charges', 'The headline, but it hides how you got there — read it with drawdown and expectancy.'],
    'win rate': ['Share of trades that closed in profit.', 'winners ÷ all trades', 'Meaningless alone: a 35% win rate with 3:1 payoff is a fine system, a 70% win rate with tiny wins and big losses is not.'],
    'profit factor': ['How many rupees you win for each rupee you lose.', 'gross profit ÷ gross loss', 'Below 1 you are losing. 1.3–2 is healthy for discretionary traders; above 3 on a small sample is usually luck.'],
    'expectancy': ['What one average trade is worth — the number that decides whether you have an edge.', 'win% × avg win − loss% × avg loss', 'Positive = edge. Shown in ₹ and in R (multiples of the risk you took). Aim for +0.2R or better, repeatable.'],
    'avg win / loss': ['Your average winner next to your average loser.', 'mean(winning trades) / mean(losing trades)', 'The payoff ratio under it tells you how much win rate you need: payoff 2:1 needs only 34% winners to break even.'],
    'max drawdown': ['Deepest fall from an equity peak to the next low.', 'max(peak − trough)', 'Decides whether you can survive and keep trading the system. Plan for 2× your historical worst.'],
    'sharpe (trade)': ['Return per unit of trade-to-trade volatility.', 'mean(trade P&L) ÷ stdev(trade P&L)', 'Higher is steadier. Above ~0.3 per trade is good; negative means the average trade loses.'],
    'sortino': ['Like Sharpe, but only downside swings are penalised.', 'mean ÷ downside deviation', 'Better than Sharpe for options-style payoffs with big winners.'],
    'calmar': ['Annualised return relative to the deepest drawdown.', 'annual return % ÷ max drawdown %', 'Above 1 means you earn more per year than the worst pain you suffered. Needs 5+ trading days.'],
    'recovery factor': ['How many times your profit covers your worst drawdown.', 'net profit ÷ max drawdown', 'Above 3 = the edge comfortably outruns its bad patches.'],
    'sqn': ["Van Tharp's System Quality Number — a t-score of your R-multiples.", '√N × mean(R) ÷ stdev(R)', '<1.6 poor · 2–2.5 average · 3+ good · 5+ excellent. Needs 30+ trades to trust.'],
    'kelly (full)': ['The bet size that would maximise long-run growth if your stats are exactly true.', 'W − (1−W) ÷ payoff', 'Never trade full Kelly — it is brutally volatile. ¼–½ Kelly is the grown-up version. Negative means: do not trade this system.'],
    'ulcer index': ['Depth and duration of drawdowns combined into one stress number.', '√mean(drawdown%²)', 'Lower is calmer. Two equity curves with the same return can have very different ulcer indices.'],
    'streaks': ['Your longest winning and losing runs and where you are now.', 'consecutive wins / losses', 'Losing streaks are normal — the test is whether your size and rules stay the same during them.'],
    'avg hold': ['How long you stay in a trade, with winners and losers split.', 'mean(exit time − entry time)', 'If losers are held much longer than winners, you are hoping instead of following the stop.'],
    'charges paid': ['Brokerage, STT, exchange fees, GST, stamp duty you would have paid.', 'sum of the per-trade cost model (Settings → Costs)', 'If gross profit is positive but net is not, your edge is being eaten by costs — trade less, or larger and slower.'],
    'trading days': ['Days with at least one closed trade, and how many were green or red.', 'count of days', 'Consistency lives here: many small green days beat a single huge one.'],
    'best / worst day': ['Your single best and single worst session.', 'max / min(daily P&L)', 'If the worst day wipes out the best, tighten your daily loss rule (Discipline tab).'],
    'top-5 wins share': ['How much of your gross profit came from your five best trades.', 'top-5 winners ÷ gross profit', 'Very high = results depend on a few lucky outliers. Look at the figure “without top 3”.'],
    'avg r win / loss': ['Average winner and loser measured in R (multiples of the risk you set).', 'mean(R of winners) / mean(R of losers)', 'Healthy: winners ≥ 1.5R, losers close to −1R. Losers far beyond −1R mean stops are being moved.'],
    'avg mfe / mae': ['MFE = best open profit a trade reached; MAE = worst open loss it suffered, in R.', 'mean(max favourable) / mean(max adverse)', 'Big MFE on losers = you had the exit and missed it. Big MAE on winners = your stop is too wide.'],
    'exit efficiency': ['How much of the best available move you captured on winners.', 'exit profit ÷ MFE (winners)', '40–60% is normal. Under 30% = you exit far too early or give it back.'],
    'skew · kurtosis': ['Shape of your P&L distribution. Skew < 0 = big losers; kurtosis = fat tails.', 'standardised 3rd / 4th moments', 'Negative skew is the signature of “small wins, rare disasters”. Prefer positive skew.'],
    'balance': ['Current account value: capital plus all trade P&L, minus withdrawals.', 'ledger + trades', 'This is the number your blow-up level is measured against.'],
    'capital put in': ['Total money deposited across every account life.', 'start + top-ups', 'Compare with balance: a rising balance fed only by top-ups is not progress.'],
    'withdrawn': ['Money you took out.', 'sum of withdrawals', ''], 'written off': ['Residual balance abandoned when an account was reset after a blow-up.', 'sum of write-offs', 'The true cost of blow-ups.'],
    'blow-ups': ['Times an account fell to your blow-up level (Account tab → threshold).', 'count', 'Each blow-up is a lesson the simulator gives free. Look at what the last 10 trades before it had in common.'],
    'account lives': ['Each blow-up + fresh start begins a new life.', 'count', 'Compare lives: is the second one better than the first?'],
    'total net p&l': ['All-time net across every account life.', 'Σ net', ''], 'max dd (all)': ['Deepest drawdown across all your history.', 'max(peak − trough)', ''],
    'risk of ruin': ['Probability, from your own results, that the balance ever falls to your blow-up level.', 'exp(−2·μ·U ÷ σ²) on R-multiples; U = cushion in R', 'Under 5% is comfortable. Halving risk per trade squares your ruin odds. Needs trades that had a stop (R data).'],
    'var 95% / trade': ['Value at Risk: one trade in twenty is worse than this.', '5th percentile of trade P&L', 'Set your daily loss limit relative to this.'],
    'cvar 95%': ['Expected shortfall: the average of those worst 5% of trades.', 'mean of trades ≤ VaR', 'A truer picture of a bad day than VaR.'],
    'tail ratio': ['Do your best trades beat your worst ones?', '95th percentile ÷ |5th percentile|', 'Above 1 = fat right tail (good). Below 1 = you cut winners and let losers run.'],
    'gain-to-pain': ['Net profit relative to all the pain (sum of losses).', 'net ÷ Σ|losses|', 'Above 1 is excellent, 0.25–0.5 decent.'],
    'growth-optimal risk': ['The % of equity per trade that would maximise compounded growth on your recorded R-multiples.', 'argmax Σ ln(1 + f·R)', 'Trade a quarter to half of it. If it shows 0 your edge is non-positive.'],
    'your avg risk': ['What you actually risk per trade as % of capital.', 'mean(stop distance × qty) ÷ capital', 'Keep it under the growth-optimal figure and under 1–2% for intraday.'],
    'longest losing streak': ['Your longest run of losing trades vs what pure luck would give at your win rate.', 'ln(n·w) ÷ ln(1/(1−w))', 'Far above the luck figure = tilt rather than variance.'],
    'size consistency': ['How much your ₹ risk varies from trade to trade.', 'stdev ÷ mean of risk per trade', 'Under 25% is steady. Large swings mean you size by emotion.'],
    'p(profit, next 150)': ['Monte-Carlo odds of being ahead after 150 more trades like these.', '500 resampled futures', 'Only as good as your sample — 50+ trades before trusting it.'],
    'p(−20% drawdown)': ['Odds of a 20% drawdown at some point in the next 150 trades.', '500 resampled futures', 'If above 30%, your size is too big for your edge.']
  };
  function explainKpi(el) {
    const name = el.dataset.kpi || '', g = GLOSS[name.toLowerCase().replace(/&amp;/g, '&')], val = el.querySelector('.v'), sub = el.querySelector('.s'), c = val ? val.className.replace('v', '').trim() : '';
    const body = '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px"><b class="num ' + c + '" style="font-size:24px">' + (val ? val.innerHTML : '') + '</b><span class="dim">' + (sub ? sub.innerHTML : '') + '</span></div>' +
      (g ? '<p style="margin:0 0 8px">' + g[0] + '</p>' + (g[1] ? '<div class="note" style="margin:0 0 8px"><b>Formula</b> · ' + g[1] + '</div>' : '') + (g[2] ? '<p style="margin:0"><b>How to read it</b> — ' + g[2] + '</p>' : '') : '<p style="margin:0" class="dim">A derived figure from your journal. Filter by symbol, date range or account life above to see how it changes.</p>');
    dialog(name, body, [{ t: 'Close', cls: 'solid' }]);
  }
  // wipe trades / capital (with an amount for the fresh start)
  N.resetDialog = function (kind) {
    const what = { trades: 'Delete ALL logged trades (journal, stats, dashboard history)?', capital: 'Reset the capital ledger — top-ups, withdrawals and blow-up records — to a single fresh start?', all: 'Erase EVERYTHING: all trades, journal notes and the capital history?' }[kind];
    const o = dialog('Reset ' + (kind === 'all' ? 'everything' : kind), '<p style="margin:0 0 10px">' + what + ' <b class="neg">This cannot be undone</b> — back up first (Settings → Data) if you might want it.</p>' + (kind !== 'trades' ? '<label class="lbl">Starting capital (₹)</label><input type="number" id="dlgAmt" min="100" step="1000" value="' + N.cfg.capital + '">' : ''),
      [{ t: 'Cancel', cls: 'solid' }, { t: 'Yes, reset', cls: 'sell', fn: d => {
        const a = d.querySelector('#dlgAmt'), v = a ? parseFloat(a.value) : null; if (a && !(v >= 100)) return false;
        if (kind !== 'capital') { T.clear(); }
        if (kind !== 'trades') { N.cfg.capital = v; N.saveCfg && N.saveCfg(); const first = T.list.length ? Math.min(T.list[0].ts, Date.now()) - 1000 : Date.now(); L.list = [{ id: 's0', ts: first, type: 'start', amount: v, note: 'Starting capital' }]; L.save(); }
        N.updateBalanceChip(); try { N.refreshAll && N.refreshAll(); N.renderStats && N.renderStats(); N.renderJournal && N.renderJournal(); } catch (e) { } if (dashOpen) renderDash(); N.toast('Reset done', 'info'); } }]);
  };
  /* ====================== risk lab + discipline lab ====================== */
  const quant = (arr, p) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y), i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const median = arr => quant(arr, 0.5), clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function riskStats(A, acct) {
    const n = A.length, nets = A.map(t => t.net), R = A.filter(t => t.r != null).map(t => t.r), o = {};
    const losses = sum(nets.filter(v => v < 0), v => -v), wins = sum(nets.filter(v => v > 0), v => v);
    o.gtp = losses > 0 ? (wins - losses) / losses : null;
    const p95 = quant(nets, 0.95), p05 = quant(nets, 0.05); o.tail = p05 < 0 ? p95 / Math.abs(p05) : null; o.var95 = p05; const worst = nets.filter(v => v <= p05); o.cvar95 = worst.length ? sum(worst, v => v) / worst.length : p05;
    const cap = acct.cur ? acct.cur.capital : N.cfg.capital, rk = A.filter(t => t.risk > 0).map(t => t.risk * t.qty);
    if (rk.length) { const m = sum(rk, v => v) / rk.length, sd = Math.sqrt(sum(rk, v => (v - m) ** 2) / rk.length); o.avgRisk = m; o.sizeCv = m > 0 ? sd / m : null; o.riskPct = cap > 0 ? m / cap * 100 : null; }
    if (R.length >= 5) {
      const m = sum(R, v => v) / R.length, sd = Math.sqrt(sum(R, v => (v - m) ** 2) / (R.length - 1)); o.eR = m; o.sdR = sd;
      const ruinAmt = cap * (1 - (N.cfg.blowPct || 0) / 100), U = o.avgRisk > 0 ? ruinAmt / o.avgRisk : null; o.U = U;
      o.ror = m <= 0 ? 1 : (U && sd > 0 ? Math.min(1, Math.exp(-2 * m * U / (sd * sd))) : null);
      let bestF = 0, bestG = -Infinity; for (let f = 0; f <= 0.5; f += 0.0025) { let g = 0, ok = true; for (const r of R) { const x = 1 + f * r; if (x <= 0) { ok = false; break; } g += Math.log(x); } if (ok && g > bestG) { bestG = g; bestF = f; } } o.kellyF = bestF;
    }
    let cur = 0, mx = 0; nets.forEach(v => { if (v < 0) { cur++; mx = Math.max(mx, cur); } else cur = 0; }); o.maxLoseStreak = mx; const w = nets.filter(v => v > 0).length / n, l = 1 - w; o.expStreak = l > 0 && l < 1 && n * w > 1 ? Math.log(n * w) / Math.log(1 / l) : null;
    const eq = [0]; nets.forEach(v => eq.push(eq[eq.length - 1] + v)); const dds = []; let pk = 0, pi = 0, c2 = null;
    for (let i = 1; i < eq.length; i++) { if (eq[i] >= pk) { if (c2) { c2.rec = i - c2.peakI; dds.push(c2); c2 = null; } pk = eq[i]; pi = i; } else { if (!c2) c2 = { peakI: pi, depth: 0, troughI: i, rec: null }; const d = pk - eq[i]; if (d > c2.depth) { c2.depth = d; c2.troughI = i; c2.pk = pk; } } }
    if (c2) dds.push(c2); o.dds = dds.sort((a, b) => b.depth - a.depth).slice(0, 5); o.cap = cap; return o;
  }
  function vRisk(S, A, acct) {
    let h = filterBar(acct); if (A.length < 5) return h + '<div class="empty">The risk lab needs at least 5 closed trades in this range.</div>';
    const o = riskStats(A, acct), mc = monteCarlo(A, acct.bal, 150, 500); lastMc = mc;
    h += '<div class="dgrid kpis">' + kpi('Risk of ruin', o.ror != null ? pct(o.ror * 100, 1) : '—', o.U ? 'of falling to ' + N.cfg.blowPct + '% of capital · cushion ≈ ' + o.U.toFixed(0) + 'R' : 'needs trades with a stop (R data)', o.ror != null ? (o.ror > 0.2 ? 'neg' : o.ror < 0.05 ? 'pos' : '') : '', 'hero')
      + kpi('VaR 95% / trade', sg(o.var95, 0), '1 trade in 20 is worse than this', 'neg') + kpi('CVaR 95%', sg(o.cvar95, 0), 'average of those worst trades', 'neg')
      + kpi('Tail ratio', o.tail != null ? o.tail.toFixed(2) : '—', 'best 5% ÷ worst 5% (above 1 = fat right tail)', o.tail != null ? (o.tail >= 1 ? 'pos' : 'neg') : '') + kpi('Gain-to-pain', o.gtp != null ? o.gtp.toFixed(2) : '—', 'net ÷ sum of all losses', o.gtp != null ? cl(o.gtp) : '')
      + kpi('Growth-optimal risk', o.kellyF != null ? pct(o.kellyF * 100, 1) : '—', 'full Kelly on your R-multiples — trade ¼ to ½ of it')
      + kpi('Your avg risk', o.riskPct != null ? pct(o.riskPct, 2) : '—', 'of capital per trade', o.riskPct != null && o.kellyF != null ? (o.riskPct > o.kellyF * 100 ? 'neg' : 'pos') : '')
      + kpi('Longest losing streak', o.maxLoseStreak + '', o.expStreak != null ? 'pure luck at your win rate ≈ ' + o.expStreak.toFixed(1) : '', o.expStreak != null && o.maxLoseStreak > o.expStreak * 1.6 ? 'neg' : '')
      + kpi('Size consistency', o.sizeCv != null ? pct(o.sizeCv * 100, 0) : '—', 'spread of ₹ risk per trade — lower is steadier', o.sizeCv != null ? (o.sizeCv > 0.6 ? 'neg' : o.sizeCv < 0.25 ? 'pos' : '') : '')
      + (mc ? kpi('P(profit, next 150)', pct(mc.probUp, 0), 'if the next trades resemble these') + kpi('P(−20% drawdown)', pct(mc.probDD20, 0), 'at some point in 150 trades', mc.probDD20 > 30 ? 'neg' : '') : '') + '</div>';
    h += '<div class="dcard"><h3>Where your account could go <span>500 resampled futures · 150 trades · bands are 10th–90th percentile</span></h3><canvas id="cvMc2"></canvas><div class="note" id="mcNote2"></div></div>';
    h += '<div class="dcard"><h3>Deepest drawdowns <span>measured on closed-trade P&amp;L</span></h3>' + (o.dds.length ? '<div class="twrap"><table class="tbl"><thead><tr><th>#</th><th>Depth</th><th>% of capital</th><th>Peak after trade</th><th>Bottom at trade</th><th>Recovered</th></tr></thead><tbody>' + o.dds.map((d, i) => '<tr><td>' + (i + 1) + '</td><td class="neg">−' + inr(d.depth, 0) + '</td><td>' + pct(d.depth / o.cap * 100, 1) + '</td><td>#' + d.peakI + '</td><td>#' + d.troughI + '</td><td>' + (d.rec != null ? 'after ' + d.rec + ' trades' : '<b class="neg">not yet</b>') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="note">No drawdown yet — every trade made a new high.</div>') + '</div>';
    const adv = []; if (o.riskPct != null && o.kellyF) adv.push(o.riskPct > o.kellyF * 100 ? 'You risk <b>' + pct(o.riskPct, 2) + '</b> per trade, more than the growth-optimal <b>' + pct(o.kellyF * 100, 1) + '</b> — above Kelly, drawdowns grow faster than returns. Size down.' : 'Your <b>' + pct(o.riskPct, 2) + '</b> risk per trade is under full Kelly (' + pct(o.kellyF * 100, 1) + ') — a sane place to be.');
    if (o.ror != null && o.ror > 0.1) adv.push('Risk of ruin <b>' + pct(o.ror * 100, 1) + '</b> is high: raise your edge (expectancy) or cut size; halving risk per trade squares the ruin odds.');
    if (o.tail != null && o.tail < 1) adv.push('Tail ratio below 1: your worst trades are bigger than your best — the classic “cut winners, ride losers” signature.');
    if (o.expStreak != null && o.maxLoseStreak > o.expStreak * 1.6) adv.push('Your longest losing streak (' + o.maxLoseStreak + ') is far above what luck alone gives (≈' + o.expStreak.toFixed(1) + ') — streaks of that length usually mean tilt, not variance.');
    if (adv.length) h += '<div class="dcard"><h3>Read-out</h3><ul class="ins">' + adv.map(x => '<li>' + x + '</li>').join('') + '</ul></div>';
    return h;
  }
  function discipline(A) {
    const o = { rows: [] }, n = A.length, sorted = A.slice().sort((a, b) => a.ts - b.ts), byDay = new Map();
    sorted.forEach(t => { const k = dayK(t.ts); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(t); });
    const riskAmts = sorted.filter(t => t.risk > 0).map(t => t.risk * t.qty), medRisk = riskAmts.length ? median(riskAmts) : 0, avgDay = n / byDay.size, maxT = N.cfg.maxTradesDay > 0 ? N.cfg.maxTradesDay : Math.max(4, Math.round(avgDay * 1.5)), lim = N.cfg.dayLossLimit > 0 ? N.cfg.dayLossLimit : 0;
    const flags = new Map(); const flag = (t, k) => { if (!flags.has(t)) flags.set(t, new Set()); flags.get(t).add(k); };
    o.dayIdx = new Map();
    byDay.forEach(list => { let cum = 0, breached = false; list.forEach((t, i) => { o.dayIdx.set(t, i);
      const p = list[i - 1]; if (p && p.net < 0) { const gap = (p.seed === t.seed && p.t1 != null && t.t0 != null) ? t.t0 - p.t1 : (t.ts - p.ts) / 1000 * 1; if (gap <= (p.seed === t.seed && p.t1 != null ? 300 : 90)) flag(t, 'revenge'); }
      if (i >= maxT) flag(t, 'over'); if (breached) flag(t, 'limit'); cum += t.net; if (lim && cum <= -lim) breached = true; }); });
    sorted.forEach(t => { if (medRisk > 0 && t.risk > 0 && t.risk * t.qty > medRisk * 1.5) flag(t, 'size'); if (!(t.risk > 0)) flag(t, 'nostop'); const ex = (t.exit - t.entry) * t.dir; if (t.mfe != null && t.mfe > 0 && t.net > 0 && ex < t.mfe * 0.5) flag(t, 'early'); });
    const def = [['revenge', 'Revenge re-entries', 'taken right after a loss'], ['size', 'Oversized trades', '1.5× your median risk or more'], ['over', 'Over-trading', 'beyond ' + maxT + ' trades in a day'], ['limit', 'Past your daily loss limit', lim ? 'after losing ' + inr(lim, 0) + ' that day' : 'set a limit below to track this'], ['nostop', 'No stop defined', 'risk could not be measured'], ['early', 'Winners cut early', 'closed under half of the best run']];
    def.forEach(([k, nm, sub]) => { const L = sorted.filter(t => flags.has(t) && flags.get(t).has(k)), net = sum(L, t => t.net); o.rows.push({ k, nm, sub, n: L.length, net, avg: L.length ? net / L.length : 0, wr: L.length ? L.filter(t => t.net > 0).length / L.length * 100 : 0, list: L }); });
    o.flags = flags; o.medRisk = medRisk; o.maxT = maxT; o.lim = lim; o.sorted = sorted;
    const share = k => o.rows.find(r => r.k === k).n / n, cv = (() => { if (riskAmts.length < 3) return null; const m = sum(riskAmts, v => v) / riskAmts.length, sd = Math.sqrt(sum(riskAmts, v => (v - m) ** 2) / riskAmts.length); return m > 0 ? sd / m : null; })();
    const wn = sorted.filter(t => t.net > 0 && t.mfe > 0), cap = wn.length ? sum(wn, t => clampN(((t.exit - t.entry) * t.dir) / t.mfe, 0, 1)) / wn.length : null;
    o.comp = [['Stops defined', 100 * (1 - share('nostop')), 'every trade has a measurable risk', 1.2], ['Revenge control', clampN(100 * (1 - share('revenge') * 2.5), 0, 100), 'no instant re-entries after a loss', 1.2], ['Size consistency', cv == null ? null : clampN(100 * (1 - cv), 0, 100), 'same ₹ risk each time', 1], ['Patience', clampN(100 * (1 - share('over') * 2), 0, 100), 'no over-trading days', 1], ['Letting winners run', cap == null ? null : clampN(cap * 130, 0, 100), 'share of the best run captured on winners', 1], ['Daily-loss rule', lim ? clampN(100 * (1 - share('limit') * 3), 0, 100) : null, 'stopped when the limit was hit', 1.2]].filter(c => c[1] != null);
    const wsum = sum(o.comp, c => c[3]); o.score = Math.round(sum(o.comp, c => c[1] * c[3]) / wsum);
    // what-if lab
    const base = sum(sorted, t => t.net), sc = [], add = (nm, v, note) => sc.push({ nm, v, d: v - base, note });
    ['revenge', 'size', 'over', 'limit'].forEach(k => { const r = o.rows.find(x => x.k === k); if (r.n && (k !== 'limit' || lim)) add('Skip the ' + r.nm.toLowerCase(), base - r.net, r.n + ' trades'); });
    add('Cap every loss at 1R', sum(sorted, t => t.risk > 0 && t.net < -t.risk * t.qty - (t.charges || 0) ? -t.risk * t.qty - (t.charges || 0) : t.net), 'perfect stop discipline');
    add('Let winners reach 60% of their best run', sum(sorted, t => t.net > 0 && t.mfe > 0 ? Math.max(t.net, t.mfe * 0.6 * t.qty - (t.charges || 0)) : t.net), 'not “perfect”, just patient');
    const hrs = grp(sorted, t => t.clock ? parseInt(t.clock.slice(0, 2), 10) : null); let bh = null, wh = null; hrs.forEach((g, k) => { if (!bh || g.net > hrs.get(bh).net) bh = k; if (!wh || g.net < hrs.get(wh).net) wh = k; });
    if (hrs.size > 2 && wh != null && hrs.get(wh).net < 0) add('Never trade in the ' + wh + ':00 hour', base - hrs.get(wh).net, hrs.get(wh).n + ' trades');
    o.base = base; o.scen = sc; return o;
  }
  function vDisc(S, A, acct) {
    let h = filterBar(acct); if (A.length < 5) return h + '<div class="empty">The discipline lab needs at least 5 closed trades in this range.</div>';
    const o = discipline(A), tape = o.sorted.slice(-90), sc = o.score, scCol = sc >= 75 ? 'var(--up)' : sc >= 50 ? '#f59e0b' : 'var(--down)';
    h += '<div class="dcard"><h3>Trade tape <span>last ' + tape.length + ' trades · green = win · red = loss · dot = rule broken</span></h3><div class="tape">' + tape.map(t => { const f = o.flags.get(t); return '<i class="' + (t.net > 0 ? 'w' : t.net < 0 ? 'l' : 'b') + (f ? ' x' : '') + '" title="' + esc(t.sym) + ' ' + sg(t.net, 0) + (f ? ' · ' + [...f].join(', ') : '') + '"></i>'; }).join('') + '</div></div>';
    h += '<div class="dcols"><div class="dcard"><h3>Discipline score</h3><div class="score" style="color:' + scCol + '">' + sc + '<small>/100</small></div><div class="sbar"><i style="width:' + sc + '%;background:' + scCol + '"></i></div>' + o.comp.map(c => '<div class="comp"><span>' + c[0] + '<em>' + c[2] + '</em></span><b style="color:' + (c[1] >= 75 ? 'var(--up)' : c[1] >= 50 ? '#f59e0b' : 'var(--down)') + '">' + Math.round(c[1]) + '</b></div>').join('') + '</div>' +
      '<div class="dcard"><h3>Your rules <span>saved on this device</span></h3><div class="frow"><div class="ft"><span>Daily loss limit (₹)</span><span class="fs">0 = off. Trades after you hit it count as rule-breaks</span></div><div class="ctl"><input type="number" id="ruleLoss" min="0" step="500" value="' + (N.cfg.dayLossLimit || 0) + '"></div></div><div class="frow"><div class="ft"><span>Max trades per day</span><span class="fs">0 = auto (1.5× your average day)</span></div><div class="ctl"><input type="number" id="ruleMax" min="0" step="1" value="' + (N.cfg.maxTradesDay || 0) + '"></div></div></div></div>';
    h += '<div class="dcard"><h3>What your bad habits cost <span>trades flagged by each rule</span></h3><div class="twrap"><table class="tbl"><thead><tr><th>Behaviour</th><th>Trades</th><th>Win %</th><th>Net P&amp;L</th><th>Per trade</th></tr></thead><tbody>' + o.rows.map(r => '<tr><td><b>' + r.nm + '</b><div class="dim" style="font-size:10.5px">' + r.sub + '</div></td><td>' + r.n + '</td><td>' + (r.n ? pct(r.wr, 0) : '—') + '</td><td class="' + cl(r.net) + '">' + (r.n ? sg(r.net, 0) : '—') + '</td><td class="' + cl(r.avg) + '">' + (r.n ? sg(r.avg, 0) : '—') + '</td></tr>').join('') + '</tbody></table></div></div>';
    h += '<div class="dcard"><h3>What-if lab <span>replaying your own trades with better behaviour · actual net ' + sg(o.base, 0) + '</span></h3><div class="twrap"><table class="tbl"><thead><tr><th>Scenario</th><th>New net</th><th>Difference</th></tr></thead><tbody>' + o.scen.map(s => '<tr><td>' + s.nm + '<div class="dim" style="font-size:10.5px">' + s.note + '</div></td><td class="' + cl(s.v) + '">' + sg(s.v, 0) + '</td><td class="' + cl(s.d) + '"><b>' + sg(s.d, 0) + '</b></td></tr>').join('') + '</tbody></table></div><div class="note">Approximations from each trade’s recorded risk, best run (MFE) and charges — directional, not exact.</div></div>';
    // by trade number of the day and after streaks
    const byN = grp(o.sorted, t => Math.min(3, o.dayIdx.get(t))), lab = ['1st trade of the day', '2nd trade', '3rd trade', '4th or later'];
    const aft = { 1: { n: 0, net: 0, w: 0 }, 2: { n: 0, net: 0, w: 0 } }; for (let i = 1; i < o.sorted.length; i++) { let k = 0; for (let j = i - 1; j >= 0 && o.sorted[j].net < 0; j--) k++; if (k >= 1) { const g = aft[Math.min(2, k)]; g.n++; g.net += o.sorted[i].net; if (o.sorted[i].net > 0) g.w++; } }
    h += '<div class="dcols"><div class="dcard"><h3>By trade number of the day</h3>' + [...byN.entries()].sort((a, b) => a[0] - b[0]).map(([k, g]) => '<div class="kv"><span>' + lab[k] + ' · ' + g.n + '</span><b class="' + cl(g.net) + '">' + sg(g.net, 0) + ' · ' + pct(g.w / g.n * 100, 0) + ' win</b></div>').join('') + '</div>' +
      '<div class="dcard"><h3>After losses <span>do you tilt?</span></h3>' + [[1, 'right after 1 loss'], [2, 'after 2+ losses in a row']].map(([k, nm]) => { const g = aft[k]; return '<div class="kv"><span>' + nm + ' · ' + g.n + '</span><b class="' + (g.n ? cl(g.net) : '') + '">' + (g.n ? sg(g.net / g.n, 0) + ' / trade · ' + pct(g.w / g.n * 100, 0) + ' win' : '—') + '</b></div>'; }).join('') + '</div></div>';
    // hour x direction heat map
    const hrs = [9, 10, 11, 12, 13, 14, 15], cell = (dir, hr) => { const L = o.sorted.filter(t => t.dir === dir && t.clock && parseInt(t.clock.slice(0, 2), 10) === hr); return { n: L.length, net: sum(L, t => t.net) }; }, cells = []; hrs.forEach(hr => [1, -1].forEach(d => cells.push(cell(d, hr)))); const mx = Math.max(1, ...cells.map(c => Math.abs(c.net)));
    h += '<div class="dcard"><h3>When and which way you win <span>net ₹ by entry hour and direction</span></h3><div class="heat" style="grid-template-columns:54px repeat(' + hrs.length + ',1fr)"><i></i>' + hrs.map(x => '<i class="hh">' + x + ':00</i>').join('') + ['Long', 'Short'].map((nm, di) => '<i class="hh">' + nm + '</i>' + hrs.map((hr, hi) => { const c = cells[hi * 2 + di], a = c.n ? 0.15 + 0.7 * Math.abs(c.net) / mx : 0; return '<span style="background:' + (c.n ? (c.net >= 0 ? 'rgba(34,197,94,' + a + ')' : 'rgba(239,68,68,' + a + ')') : 'transparent') + '">' + (c.n ? sg(c.net, 0) + '<small>' + c.n + '×</small>' : '') + '</span>'; }).join('')).join('') + '</div></div>';
    return h;
  }
  let lastMc = null;
  function afterRender2(S, A, acct) {
    if (tab === 'risk' && A.length >= 5) { const mc = lastMc; if (mc) { lineChart($('cvMc2'), [{ v: mc.p50, col: '#a78bfa', w: 2, band: [mc.p10, mc.p90] }, { v: mc.p10, col: '#a78bfa66', w: 1, dash: [3, 3] }, { v: mc.p90, col: '#a78bfa66', w: 1, dash: [3, 3] }], { h: 190 }); $('mcNote2').innerHTML = 'Median outcome <b>' + inr(mc.p50[mc.p50.length - 1], 0) + '</b> · pessimistic (10th pct) <b>' + inr(mc.p10[mc.p10.length - 1], 0) + '</b> · optimistic (90th) <b>' + inr(mc.p90[mc.p90.length - 1], 0) + '</b>. Resamples only your recorded trades, so it assumes your future edge matches your past.'; } else { prep($('cvMc2'), 40); $('mcNote2').textContent = 'Needs at least 8 trades.'; } }
    const rl = $('ruleLoss'), rm = $('ruleMax'); if (rl) rl.onchange = () => { N.cfg.dayLossLimit = Math.max(0, parseFloat(rl.value) || 0); N.saveCfg(); renderDash(); }; if (rm) rm.onchange = () => { N.cfg.maxTradesDay = Math.max(0, parseInt(rm.value) || 0); N.saveCfg(); renderDash(); };
  }

  /* ====================== per-trade chart viewer ====================== */
  N.withSeed = function (seed, fn, opts) { const cur = M.seed, co = M.opts, same = (a, b) => (a && a.sym) === (b && b.sym) && (a && a.px) === (b && b.px); if (cur === seed && same(co, opts)) return fn(); M.generate(seed, opts); M.setDensity(N.cfg.tickDensity); try { return fn(); } finally { M.generate(cur, co); M.setDensity(N.cfg.tickDensity); M.feed.key = ''; } };
  let tvChart = null, tvTrade = null, tvList = [], tvTf = null;
  function tvData(t, tf) {
    return N.withSeed(t.seed, () => {
      const ahead = typeof tf === 'number' ? tf * 60 * 28 : 86400 * 3, end = Math.min(M.maxSec, (t.t1 != null ? t.t1 : t.t0) + ahead), f = M.series(tf, end);
      const eT = M.clock(t.t0).time, xT = M.clock(t.t1 != null ? t.t1 : t.t0).time;
      return { candles: f.view.slice(), maxEndFloat: f.maxEndFloat, eT, xT, sym: M.ticker };
    }, t.gopt || undefined);
  }
  function openTradeView(t, list) {
    if (!t) return; tvTrade = t; tvList = list || vis || []; const root = $('tview');
    if (!t.seed || t.t0 == null) { root.innerHTML = '<div class="tv"><div class="tvh"><b>' + esc(t.sym) + '</b><button class="btn icon" id="tvClose">' + N.icon('x', 18) + '</button></div><div class="empty">This trade was logged by an older version, so its chart can’t be rebuilt.</div></div>'; root.classList.add('show'); $('tvClose').onclick = closeTradeView; return; }
    if (tvTf == null) tvTf = typeof t.tf === 'number' ? t.tf : 5;
    const idx = tvList.indexOf(t), win = t.net >= 0, rr = t.r != null ? (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R' : '—', TAGS = ['', 'A+ setup', 'Plan followed', 'Early entry', 'Late entry', 'FOMO', 'Revenge', 'Moved stop', 'Early exit', 'Held too long', 'Oversized', 'Impulse'];
    root.innerHTML = '<div class="tv"><div class="tvh"><div><b class="' + (t.dir === 1 ? 'pos' : 'neg') + '">' + (t.dir === 1 ? 'LONG' : 'SHORT') + '</b> <b>' + esc(t.sym) + '</b> ×' + t.qty + ' <span class="dim">' + dtstr(t.ts) + '</span></div><div class="tvr"><b class="num ' + cl(t.net) + '">' + sg(t.net, 2) + '</b><span class="' + cl(t.r) + '">' + rr + '</span></div><div class="grow"></div><button class="btn icon sm" id="tvPrev" title="Previous trade">' + N.icon('chev', 15) + '</button><button class="btn icon sm" id="tvNext" title="Next trade">' + N.icon('chev', 15) + '</button><button class="btn icon" id="tvClose" title="Close">' + N.icon('x', 18) + '</button></div>' +
      '<div class="tvtf">' + [1, 3, 5, 15, 60].map(x => '<button class="chip' + (tvTf === x ? ' on' : '') + '" data-tf="' + x + '">' + N.tfLabel(x) + '</button>').join('') + '<span class="grow"></span><button class="chip on" id="tvPlay">' + N.icon('play', 12) + ' Replay this trade</button><button class="chip" id="tvSpd" title="Replay speed">2×</button><button class="chip" id="tvMain" title="Reload this day in the main chart and play it there">' + N.icon('candles', 12) + ' Main chart</button></div>' +
      '<div class="tvwrap"><canvas id="tvCanvas"></canvas></div><div class="tvbody" id="tvBody"></div></div>';
    root.classList.add('show');
    root.querySelector('#tvClose').onclick = closeTradeView; root.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { tvTf = +b.dataset.tf; openTradeView(tvTrade, tvList); });
    root.querySelector('#tvMain').onclick = () => { closeDash(); N.reviewTrade && N.reviewTrade(t); };
    const go = d => { const i = tvList.indexOf(tvTrade) + d; if (i >= 0 && i < tvList.length) openTradeView(tvList[i], tvList); };
    root.querySelector('#tvPrev').onclick = () => go(-1); root.querySelector('#tvNext').onclick = () => go(1); root.querySelector('#tvPrev').style.transform = 'rotate(90deg)'; root.querySelector('#tvNext').style.transform = 'rotate(-90deg)';
    const D = tvData(t, tvTf); const cv = $('tvCanvas'); if (tvChart) { try { tvChart._ro.disconnect(); } catch (e) { } } tvChart = new N.Chart(cv); tvChart.noPlus = true; tvChart.colors = Object.assign({}, N.chart.colors);
    const risk = t.risk > 0 ? t.risk : Math.abs(t.entry - t.exit) || t.entry * 0.005, sl0 = t.sl0 != null ? t.sl0 : t.entry - t.dir * risk, tp0 = t.tp0 != null ? t.tp0 : t.entry + t.dir * risk * 2;
    let eI = 0, xI = 0; D.candles.forEach((c, i) => { if (c.time <= D.eT) eI = i; if (c.time <= D.xT) xI = i; });
    const paint = k => {
      const cs = k == null ? D.candles : D.candles.slice(0, k), last = cs.length - 1, inT = k == null || last >= eI, outT = k == null || last >= xI, draws = [];
      if (inT) draws.push({ id: 'p', type: t.dir === 1 ? 'longpos' : 'shortpos', a: { t: D.eT, p: t.entry }, b: { t: outT ? D.xT : Math.max(D.eT + 60, cs[last].time), p: t.entry }, tp: tp0, sl: sl0, qty: t.qty, color: '#94a3b8', width: 1.3, forceLabels: true },
        { id: 'e', type: t.dir === 1 ? 'mkup' : 'mkdn', a: { t: D.eT, p: t.entry }, b: { t: D.eT, p: t.entry }, color: t.dir === 1 ? '#26a69a' : '#ef5350', text: 'IN', width: 1.2 });
      if (outT) draws.push({ id: 'x', type: t.dir === 1 ? 'mkdn' : 'mkup', a: { t: D.xT, p: t.exit }, b: { t: D.xT, p: t.exit }, color: win ? '#22c55e' : '#f97316', text: 'OUT ' + (t.reason || ''), width: 1.2 });
      tvChart.setData({ draws, hideDraw: false, hidePills: true, shapes: [], hud: null, vol: { on: true, pct: 0.18, alpha: 0.45 }, candles: cs, overlays: [], lines: [], zones: [], sub: { mode: 'none' }, maxEndFloat: k == null ? D.maxEndFloat : Math.min(D.maxEndFloat, k), tf: tvTf, style: N.cfg.style === 'line' || N.cfg.style === 'area' ? 'candle' : N.cfg.style, countdown: null, symbol: D.sym, tfLabel: N.tfLabel(tvTf) });
    };
    paint(null);
    tvChart.resize();
    const iE = tvChart.idxOfTime(D.eT), n = D.candles.length; tvChart.viewCount = Math.max(30, Math.min(n, Math.round(n - iE + 38))); tvChart.followLatest = true; tvChart.resize();
    // in-viewer replay: reveal the candles bar by bar from a little before entry
    { let k = null, tm = 0, spd = 2; const SP = [1, 2, 4, 8], pb = root.querySelector('#tvPlay'), sb = root.querySelector('#tvSpd');
      const stop = () => { clearInterval(tm); tm = 0; pb.innerHTML = N.icon('play', 12) + (k != null && k < n ? ' Resume' : ' Replay this trade'); pb.classList.add('on'); };
      const step = () => { k++; if (k >= n) { k = null; paint(null); stop(); return; } paint(k); tvChart.followLatest = true; tvChart.resize(); };
      pb.onclick = () => { if (tm) { stop(); return; } if (k == null) { k = Math.max(12, eI - 22); paint(k); tvChart.viewCount = 60; tvChart.followLatest = true; tvChart.resize(); } pb.innerHTML = N.icon('pause', 12) + ' Pause'; tm = setInterval(step, 900 / spd); };
      sb.onclick = () => { spd = SP[(SP.indexOf(spd) + 1) % SP.length]; sb.textContent = spd + '×'; if (tm) { clearInterval(tm); tm = setInterval(step, 900 / spd); } };
      root._stopRep = () => clearInterval(tm); }
    // what happened after the exit
    const iX = tvChart.idxOfTime(D.xT); let after = '—'; if (iX < n - 2) { let hi = -Infinity, lo = Infinity; for (let i = iX + 1; i < n; i++) { hi = Math.max(hi, D.candles[i].high); lo = Math.min(lo, D.candles[i].low); } const fav = t.dir === 1 ? hi - t.exit : t.exit - lo, adv = t.dir === 1 ? t.exit - lo : hi - t.exit; after = 'next ' + (n - 1 - iX) + ' bars: best ' + sg(fav * t.qty, 0) + ' (' + fx(fav / risk) + 'R) further, worst ' + sg(-adv * t.qty, 0) + ' (' + fx(-adv / risk) + 'R)'; }
    const kv = (k, v, c) => '<div class="kv"><span>' + k + '</span><b class="' + (c || '') + '">' + v + '</b></div>';
    $('tvBody').innerHTML = '<div class="tvgrid">' + kv('Entry → exit', t.entry.toFixed(2) + ' → ' + t.exit.toFixed(2)) + kv('Stop / target (set)', sl0.toFixed(2) + ' / ' + tp0.toFixed(2)) + kv('Gross · charges', sg(t.gross, 2) + ' · ' + inr(t.charges, 2)) + kv('Net · R', sg(t.net, 2) + ' · ' + rr, cl(t.net)) + kv('Exit reason', esc(t.reason || '—')) + kv('Held', t.dur != null ? N.dur(t.dur) : '—') + kv('MFE · MAE', t.risk > 0 && t.mfe != null ? fx(t.mfe / t.risk) + 'R · ' + fx(t.mae / t.risk) + 'R' : '—') + kv('Market clock', esc(t.clock || '—') + ' · seed ' + t.seed) + '</div><div class="note">After your exit — ' + after + '</div><div class="l3 tvedit"><select id="tvTag">' + TAGS.map(g => '<option value="' + esc(g) + '"' + (g === (t.tag || '') ? ' selected' : '') + '>' + (g || '— tag —') + '</option>').join('') + '</select><input type="text" id="tvNote" placeholder="what did you see / feel? (saved to journal)" value="' + esc(t.note || '') + '"></div>';
    $('tvTag').onchange = e => { T.update(t.id, { tag: e.target.value }); N.refreshAll(); }; $('tvNote').onchange = e => T.update(t.id, { note: e.target.value });
  }
  function closeTradeView() { const r = $('tview'); if (r) { r._stopRep && r._stopRep(); r._stopRep = null; r.classList.remove('show'); r.innerHTML = ''; } if (tvChart) { try { tvChart._ro.disconnect(); } catch (e) { } tvChart = null; } }
  N.openTradeView = openTradeView; N.closeTradeView = closeTradeView;

  /* ====================== init ====================== */
  const _si = N.statsInit;
  N.statsInit = function () {
    _si(); L.load(); N.updateBalanceChip();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('tview').classList.contains('show')) closeTradeView(); else if (dashOpen) closeDash(); } });
  };
})(window.NTI);
