/* NerdyTradeIntuition — indicator packs (ports of @NerdyIntruder's TradingView scripts, labels optional)
   Pack 1: Market Structure ILM|SP ZigZag + Pure S/R + Supply/Demand + Candlesticks at S/R
   Pack 2: Volume Breakout (HawkEye volume + breakout signals). EMA/VWAP/AVWAP/ADX/Fibs live in app.js (steppers) */
(function (N) {
  'use strict';
  const P = N.packs = {};

  function atrArr(bars, n) {
    const out = new Array(bars.length).fill(null); let a = null;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], pc = i ? bars[i - 1].close : b.open, tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
      if (i < n) { a = (a === null ? 0 : a) + tr / n; if (i === n - 1) out[i] = a; } else { a = (a * (n - 1) + tr) / n; out[i] = a; }
    }
    return out;
  }
  P.atr = atrArr;
  function pivotAt(bars, c, L, hi) { // is bar c a pivot high (hi) / low with L bars each side
    const v = hi ? bars[c].high : bars[c].low;
    for (let k = c - L; k <= c + L; k++) {
      if (k === c) continue; const x = hi ? bars[k].high : bars[k].low;
      if (hi) { if (k < c ? x > v : x >= v) return false; } else { if (k < c ? x < v : x <= v) return false; }
    }
    return true;
  }

  /* ---- ILM|SP zig-zag (state machine from the Pine script) ---- */
  function zigzag(bars, len, off, sUp, sDn, out) {
    let dir = 0, cb = -1, cv = 0, last = null, tb = -1, tv = NaN; const n = bars.length, segs = [];
    for (let i = 2 * len; i < n; i++) {
      const c = i - len, ph = pivotAt(bars, c, len, true), pl = pivotAt(bars, c, len, false), h = bars[i].high, l = bars[i].low;
      const resetTemp = hi => { tv = hi ? l : h; tb = i; for (let k = i - len + 1; k <= i; k++) { if (hi ? bars[k].low < tv : bars[k].high > tv) { tv = hi ? bars[k].low : bars[k].high; tb = k; } } };
      if (ph) {
        const v = bars[c].high;
        if (dir === 0) { dir = -1; cb = c; cv = v; resetTemp(true); }
        else if (dir === 1) { last = { i0: cb, p0: cv, i1: c, p1: v, up: true }; segs.push(last); dir = -1; cb = c; cv = v; resetTemp(true); }
        else if (v > cv) { cb = c; cv = v; if (last) { last.i1 = c; last.p1 = v; } resetTemp(true); }
      }
      if (pl) {
        const v = bars[c].low;
        if (dir === 0) { dir = 1; cb = c; cv = v; resetTemp(false); }
        else if (dir === -1) { last = { i0: cb, p0: cv, i1: c, p1: v, up: false }; segs.push(last); dir = 1; cb = c; cv = v; resetTemp(false); }
        else if (v < cv) { cb = c; cv = v; if (last) { last.i1 = c; last.p1 = v; } resetTemp(false); }
      }
      if (dir === 1) { if (h >= tv || isNaN(tv)) { tv = h; tb = i; } } else if (dir === -1) { if (l <= tv || isNaN(tv)) { tv = l; tb = i; } }
    }
    const dsh = x => N.dashOf(x.d);
    segs.forEach(g => { const q = g.up ? sUp : sDn; out.push({ t: 'seg', i0: off + g.i0, p0: g.p0, i1: off + g.i1, p1: g.p1, c: q.c, w: q.w, dash: dsh(q) }); });
    if (dir !== 0 && tb >= 0 && !isNaN(tv)) { const q = dir === 1 ? sUp : sDn; out.push({ t: 'seg', i0: off + cb, p0: cv, i1: off + tb, p1: tv, c: q.c, w: q.w, dash: dsh(q) }); }
    return segs;
  }

  /* ---- Supply & Demand (swing zones, ATR sized, removed when closed through) ---- */
  function supplyDemand(bars, atr50, L, keep, multSup, multDem, off) {
    const zones = []; const n = bars.length;
    for (let i = 2 * L; i < n; i++) {
      const c = i - L, a = atr50[i] || atr50[c]; if (!a) continue;
      // break check on every bar
      for (let z = zones.length - 1; z >= 0; z--) { const zz = zones[z]; if ((zz.sup && bars[i].close > zz.top) || (!zz.sup && bars[i].close < zz.bot)) zones.splice(z, 1); }
      const addZ = sup => {
        const buf = a * (sup ? multSup : multDem) / 10, top = sup ? bars[c].high : bars[c].low + buf, bot = sup ? bars[c].high - buf : bars[c].low, poi = (top + bot) / 2;
        for (const z of zones) if (Math.abs(poi - (z.top + z.bot) / 2) <= a * 2) return;
        zones.unshift({ sup, top, bot, i0: c }); if (zones.length > keep) zones.pop();
      };
      if (pivotAt(bars, c, L, true)) addZ(true);
      if (pivotAt(bars, c, L, false)) addZ(false);
    }
    return zones.map(z => Object.assign(z, { i0: off + z.i0 }));
  }

  /* ---- Pure Support / Resistance (clustered pivots, touch strength) ---- */
  function clusterLevels(bars, win, pl, tol, minTouch) {
    const n = bars.length, s = Math.max(pl, n - win), pts = [];
    for (let c = s; c < n - pl; c++) { if (pivotAt(bars, c, pl, true)) pts.push({ p: bars[c].high, i: c }); if (pivotAt(bars, c, pl, false)) pts.push({ p: bars[c].low, i: c }); }
    pts.sort((a, b) => a.p - b.p); const out = []; let cur = null;
    for (const q of pts) { if (cur && q.p - cur.min <= tol) { cur.list.push(q); } else { if (cur) out.push(cur); cur = { min: q.p, list: [q] }; } }
    if (cur) out.push(cur);
    return out.filter(g => g.list.length >= minTouch).map(g => { const ps = g.list.map(x => x.p), lo = Math.min.apply(0, ps), hi = Math.max.apply(0, ps); return { p: ps.reduce((a, b) => a + b, 0) / ps.length, lo, hi, n: g.list.length, i0: Math.min.apply(0, g.list.map(x => x.i)) }; });
  }
  P.clusterLevels = clusterLevels;

  /* ---- candlestick patterns ---- */
  function patterns(bars, atr14, levels, from, o) {
    const marks = [];
    const near = (b, a) => { for (const L of levels) { const lo = L.lo - a * 0.35, hi = L.hi + a * 0.35; if (b.low <= hi && b.high >= lo) return L.sup ? 1 : L.sup === false ? -1 : 0; } return 0; };
    for (let i = Math.max(3, from); i < bars.length; i++) {
      const b = bars[i], a = atr14[i]; if (!a) continue;
      const loc = near(b, a); if (!loc) continue; // 1 support, -1 resistance
      const body = Math.abs(b.close - b.open), rg = b.high - b.low || 1e-9, up = b.high - Math.max(b.open, b.close), lw = Math.min(b.open, b.close) - b.low, bull = b.close > b.open;
      const p1 = bars[i - 1], p2 = bars[i - 2]; let hit = null;
      if (o.hammer && body <= rg * 0.4 && lw >= 2 * body && up <= Math.max(body, rg * 0.15)) hit = loc === 1 ? [1, 'Hammer'] : [-1, 'Hanging Man'];
      if (!hit && o.inv && body <= rg * 0.4 && up >= 2 * body && lw <= Math.max(body, rg * 0.15)) hit = loc === 1 ? [1, 'Inv Hammer'] : [-1, 'Shooting Star'];
      if (!hit && o.engulf) {
        const pBody = Math.abs(p1.close - p1.open);
        if (loc === 1 && bull && p1.close < p1.open && b.open <= p1.close && b.close >= p1.open && body > pBody) hit = [1, 'Bull Engulf'];
        else if (loc === -1 && !bull && p1.close > p1.open && b.open >= p1.close && b.close <= p1.open && body > pBody) hit = [-1, 'Bear Engulf'];
      }
      if (!hit && o.stars) {
        const b1 = Math.abs(p2.close - p2.open), b2 = Math.abs(p1.close - p1.open), mid = (p2.open + p2.close) / 2;
        if (loc === 1 && p2.close < p2.open && b1 > a * 0.8 && b2 <= b1 * 0.35 && bull && b.close > mid) hit = [1, 'Morning Star'];
        else if (loc === -1 && p2.close > p2.open && b1 > a * 0.8 && b2 <= b1 * 0.35 && !bull && b.close < mid) hit = [-1, 'Evening Star'];
      }
      if (!hit && o.big) {
        if (rg >= a * 1.8 && body >= rg * 0.7) hit = bull ? [1, 'Big Bull Bar'] : [-1, 'Big Bear Bar'];
        else if (loc === 1 && lw >= rg * 0.6 && rg >= a * 0.9) hit = [1, 'Wick Bar'];
        else if (loc === -1 && up >= rg * 0.6 && rg >= a * 0.9) hit = [-1, 'Wick Bar'];
      }
      if (hit) marks.push({ i, dir: hit[0], text: hit[1] });
    }
    return marks;
  }

  /* ---- pack 1 entry ---- */
  P.compute1 = function (all, o, st) {
    const WIN = 1600, s0 = Math.max(0, all.length - WIN), bars = all.slice(s0), off = s0, shapes = [], n = bars.length;
    if (n < 40) return shapes;
    const atr50 = atrArr(bars, 50), atr14 = atrArr(bars, 14), last = bars[n - 1].close;
    if (o.zzMajor) zigzag(bars, 15, off, st('zzMajUp'), st('zzMajDn'), shapes);
    if (o.zzMinor) zigzag(bars, 5, off, st('zzMinUp'), st('zzMinDn'), shapes);
    let levels = [];
    if (o.sd) {
      const sS = st('supply'), sD = st('demand'), zs = supplyDemand(bars, atr50, 10, 20, sS.t, sD.t, off);
      zs.forEach(z => { const q = z.sup ? sS : sD; shapes.push({ t: 'box', i0: z.i0, i1: null, top: z.top, bot: z.bot, fill: N.rgba(q.c, .24), stroke: N.rgba(q.c, .85), kind: 'sd', text: o.labels ? (z.sup ? 'SUPPLY' : 'DEMAND') : '' }); levels.push({ lo: z.bot, hi: z.top, sup: !z.sup }); });
    }
    if (o.sr || o.cd) {
      const win = Math.min(n, 300); let hh = -Infinity, ll = Infinity; for (let i = n - win; i < n; i++) { if (bars[i].high > hh) hh = bars[i].high; if (bars[i].low < ll) ll = bars[i].low; }
      const tol = Math.max((hh - ll) * (o.srWidth || 1) / 100, 1e-6), lv = clusterLevels(bars, win, 5, tol, o.srStrength || 2).map(L => Object.assign(L, { sup: L.p < last }));
      const ab = lv.filter(l => !l.sup).sort((a, b) => a.p - b.p).slice(0, 5), be = lv.filter(l => l.sup).sort((a, b) => b.p - a.p).slice(0, 5);
      const pick = ab.concat(be), srLv = [];
      const sSup = st('srSup'), sRes = st('srRes'), aN = atr14[n - 1] || tol;
      pick.forEach(L => {
        const q = L.sup ? sSup : sRes, half = Math.max(aN * q.t / 20, (L.hi - L.lo) / 2, 0.025);
        if (o.sr) shapes.push({ t: 'box', i0: o.srLeft ? -1e9 : off + L.i0, i1: null, top: L.p + half, bot: L.p - half, fill: N.rgba(q.c, .28), stroke: N.rgba(q.c, .9), kind: 'sr', text: o.labels ? (L.sup ? 'S ' : 'R ') + L.p.toFixed(2) + ' ×' + L.n : '' });
        srLv.push({ lo: L.p - half, hi: L.p + half, sup: L.sup });
      });
      levels = levels.concat(srLv);
    }
    if (o.cd && levels.length) {
      patterns(bars, atr14, levels, n - 350, { hammer: o.pHammer, inv: o.pInv, engulf: o.pEngulf, stars: o.pStars, big: o.pBig }).forEach(m => shapes.push({ t: 'mark', i: off + m.i, dir: m.dir, c: m.dir > 0 ? st('patBull').c : st('patBear').c, text: o.labels ? m.text : '' }));
    }
    return shapes;
  };

  /* ---- pack 2: HawkEye volume colours + breakout signals ---- */
  P.compute2 = function (all, o, trendFn, st) {
    const WIN = 1600, s0 = Math.max(0, all.length - WIN), bars = all.slice(s0), off = s0, n = bars.length, shapes = [], res = { shapes, hawk: null };
    if (n < 30) return res;
    const atr = atrArr(bars, 14), HL = 200, DIV = 3.6;
    const sma = (get, i, len) => { const k = Math.min(len, i + 1); let s = 0; for (let j = i - k + 1; j <= i; j++) s += get(bars[j]); return s / k; };
    const kinds = [], ma = [];
    for (let i = 0; i < n; i++) {
      const b = bars[i], p = i ? bars[i - 1] : b, rg = b.high - b.low, ra = sma(x => x.high - x.low, i, HL), va = sma(x => x.volume, i, HL);
      const mid1 = (p.high + p.low) / 2, u1 = mid1 + (p.high - p.low) / DIV, d1 = mid1 - (p.high - p.low) / DIV;
      const r = (rg > ra && b.close < d1 && b.volume > va) || b.close < mid1;
      const g = b.close > mid1 && ((rg > ra && b.close > u1 && b.volume > va) || (b.high > p.high && rg < ra / 1.5 && b.volume < va) || (b.low < p.low && rg < ra / 1.5 && b.volume > va));
      const gr = (rg > ra && b.close > d1 && b.close < u1 && b.volume > va && b.volume < va * 1.5 && b.close > mid1) || (rg < ra / 1.5 && b.volume < va / 1.5) || (b.close > d1 && b.close < u1);
      kinds.push(r ? 'r' : g ? 'g' : gr ? 'n' : 'b'); ma.push(va);
    }
    res.hawk = { off, kinds, ma };
    // ---- breakout signals ----
    const preset = o.preset || 'Strict', maxBase = preset === 'Strict' ? 5 : preset === 'Balanced' ? 8 : 0, vm = preset === 'Strict' ? 2 : preset === 'Balanced' ? 1.75 : 1.5, vw = preset === 'Strict' ? 1.5 : 1.3, htf = preset !== 'More';
    const LB = 20, BUF = 0.5, CLV = 0.6;
    let lastSig = -99; const sigs = [];
    for (let i = LB + 1; i < n; i++) {
      const a = atr[i]; if (!a) continue; const b = bars[i];
      let hi = -Infinity, lo = Infinity; for (let j = i - LB; j < i; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
      if (maxBase && hi - lo > maxBase * a) continue;
      const rg = b.high - b.low || 1e-9, clv = (b.close - b.low) / rg; let vma = 0; for (let j = i - 20; j < i; j++) vma += (bars[j] ? bars[j].volume : 0); vma /= 20; if (!vma) continue;
      const v3 = (bars[i].volume + bars[i - 1].volume + bars[i - 2].volume) / 3;
      if (b.volume < vm * vma || v3 < vw * vma) continue;
      const tr = htf && trendFn ? trendFn(b) : 0;
      if (b.close > hi + BUF * a && clv >= CLV && (!htf || tr >= 0) && i - lastSig > 8) { sigs.push({ i, dir: 1, lvl: hi }); lastSig = i; }
      else if (b.close < lo - BUF * a && (1 - clv) >= CLV && (!htf || tr <= 0) && i - lastSig > 8) { sigs.push({ i, dir: -1, lvl: lo }); lastSig = i; }
    }
    sigs.slice(-6).forEach(s => { shapes.push({ t: 'mark', i: off + s.i, dir: s.dir, c: s.dir > 0 ? st('boUp').c : st('boDn').c, text: o.labels ? (s.dir > 0 ? 'BO' : 'BD') : '', big: true }); });
    sigs.slice(-2).forEach(s => shapes.push({ t: 'hline', i0: off + s.i, p: s.lvl, c: s.dir > 0 ? st('boUp').c : st('boDn').c, w: (s.dir > 0 ? st('boUp') : st('boDn')).w, dash: null, kind: 'bo', text: '' }));
    // nearest major levels (>=3 touches, aged) above/below as dashed lines
    if (o.lines !== false) {
      const last = bars[n - 1].close, tol = (atr[n - 1] || 0) * 0.5; if (tol) {
        const lv = clusterLevels(bars, Math.min(n, 250), 5, tol * 2, 3).filter(L => n - 1 - L.i0 >= 120);
        const ab = lv.filter(l => l.p > last).sort((a, b) => a.p - b.p)[0], be = lv.filter(l => l.p < last).sort((a, b) => b.p - a.p)[0];
        const qR = st('lvRes'), qS = st('lvSup');
        if (ab) shapes.push({ t: 'hline', i0: off + ab.i0, p: ab.p, c: qR.c, w: qR.w, dash: N.dashOf(qR.d), kind: 'lv', text: '' });
        if (be) shapes.push({ t: 'hline', i0: off + be.i0, p: be.p, c: qS.c, w: qS.w, dash: N.dashOf(qS.d), kind: 'lv', text: '' });
      }
    }
    return res;
  };
})(window.NTI);
