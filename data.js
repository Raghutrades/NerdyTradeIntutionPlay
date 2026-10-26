/* NerdyTradeIntuition — market engine: seeded history, tick paths, aggregation, indicators, levels */
(function (N) {
  'use strict';
  const TICK = N.TICK, SESSION_MIN = 375, TOTAL_DAYS = 70, HIST_DAYS = 480, START_DAY = 30;
  const STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'BAJFINANCE', 'TATAMOTORS', 'SUNPHARMA', 'NTPC', 'KOTAKBANK', 'M&M', 'MARUTI', 'ASIANPAINT', 'TATASTEEL', 'TITAN', 'ZOMATO', 'AXISBANK', 'WIPRO', 'ADANIENT', 'HCLTECH'];
  const INTRADAY_TFS = [1, 2, 3, 5, 10, 15, 30, 45, 60, 240];
  N.TF_ORDER = [1, 2, 3, 5, 10, 15, 30, 45, 60, 240, 'D', 'W', 'M'];
  N.tfLabel = tf => tf === 'D' ? '1D' : tf === 'W' ? '1W' : tf === 'M' ? '1M' : tf === 60 ? '1H' : tf === 240 ? '4H' : tf + 'm';
  N.isIntraday = tf => typeof tf === 'number';
  N.SESSION_MIN = SESSION_MIN;

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  N.rng = mulberry32;
  function gaussFrom(R) { return () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }

  /* ---------- IST time helpers ---------- */
  const IST = 5.5 * 3600;
  const istParts = t => { const d = new Date((t + IST) * 1000); return { h: d.getUTCHours(), m: d.getUTCMinutes(), day: d.getUTCDate(), mon: d.getUTCMonth(), yr: d.getUTCFullYear(), dow: d.getUTCDay() }; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = n => String(n).padStart(2, '0');
  N.istParts = istParts;
  N.fmtHM = t => { const p = istParts(t); return p2(p.h) + ':' + p2(p.m); };
  N.fmtDM = t => { const p = istParts(t); return p.day + ' ' + MON[p.mon]; };
  N.fmtDMY = t => { const p = istParts(t); return p.day + ' ' + MON[p.mon] + " '" + String(p.yr).slice(2); };
  N.fmtAxis = (t, tf) => {
    const p = istParts(t);
    if (tf === 'M') return MON[p.mon] + " '" + String(p.yr).slice(2);
    if (tf === 'D' || tf === 'W') return p.day + ' ' + MON[p.mon];
    return (p.h === 9 && p.m === 15) ? p.day + ' ' + MON[p.mon] : p2(p.h) + ':' + p2(p.m);
  };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  N.fmtFull = (t, tf) => (typeof tf === 'number') ? DOW[istParts(t).dow] + ' ' + N.fmtDMY(t) + '  ' + N.fmtHM(t) : DOW[istParts(t).dow] + ' ' + N.fmtDMY(t);
  const weekKey = t => { const p = istParts(t); const d = new Date(Date.UTC(p.yr, p.mon, p.day)); const dd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dd); return d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate(); };
  const monthKey = t => { const p = istParts(t); return p.yr + '-' + p.mon; };

  /* ---------- market state ---------- */
  const M = N.market = {
    seed: 0, ticker: '', dailyHistory: [], sessions: [], base1m: [], dailySim: [], dailyAll: [],
    startSec: START_DAY * SESSION_MIN * 60, maxSec: 0, HIST_DAYS, START_DAY, SESSION_MIN, TOTAL_DAYS, aggCache: {}, pathCache: new Map(), density: 1
  };

  function genRegimeBars(R, G, startPrice, numSteps, o) {
    const bars = []; let price = startPrice; const anchor = startPrice, capPct = o.capPct, baseVol = o.baseVolPct();
    let i = 0;
    while (i < numSteps) {
      const len = o.regimeLenMin + Math.floor(R() * (o.regimeLenMax - o.regimeLenMin));
      const choppy = R() < o.choppyChance;
      const drift = choppy ? 0 : (R() - 0.5) * o.driftPct;
      const volMult = 0.7 + R() * 0.9;
      for (let k = 0; k < len && i < numSteps; k++, i++) {
        const edge = o.edgeMult ? o.edgeMult(i, numSteps) : 1;
        const vol = price * baseVol * volMult * edge;
        const dev = price / anchor - 1;
        const rev = Math.abs(dev) > capPct ? -Math.sign(dev) * o.driftPct * 0.5 : 0;
        const eff = drift * 0.6 + rev * 0.4;
        let shock = 0; if (R() < o.shockChance) shock = G() * vol * o.shockMult;
        const open = price, ret = price * eff + G() * vol + shock;
        const close = Math.max(0.5, open + ret);
        const high = Math.max(open, close) + R() * vol * 0.75;
        const low = Math.max(0.1, Math.min(open, close) - R() * vol * 0.75);
        bars.push({ open, high, low, close, vol: Math.abs(ret) / (price * baseVol + 1e-9) }); price = close;
      }
    }
    return bars;
  }

  M.generate = function (seed) {
    seed = seed || (1 + Math.floor(Math.random() * 899999));
    const R = mulberry32(seed * 2654435761 >>> 0), G = gaussFrom(R);
    M.seed = seed; M.ticker = STOCKS[Math.floor(R() * STOCKS.length)];
    M.aggCache = {}; M.pathCache = new Map();
    let price = Math.floor(R() * 3800) + 200;
    let ms = Date.UTC(2023, 0, 2) + Math.floor(R() * 300) * 86400000;
    const nextBiz = () => { ms += 86400000; let d = new Date(ms).getUTCDay(); while (d === 0 || d === 6) { ms += 86400000; d = new Date(ms).getUTCDay(); } };
    { let d = new Date(ms).getUTCDay(); while (d === 0 || d === 6) { ms += 86400000; d = new Date(ms).getUTCDay(); } }

    const hist = [];
    const dbars = genRegimeBars(R, G, price, HIST_DAYS, { capPct: 0.22 + R() * 0.1, baseVolPct: () => 0.010 + R() * 0.009, regimeLenMin: 8, regimeLenMax: 30, choppyChance: 0.3, driftPct: 0.0042, shockChance: 0.02, shockMult: 3.0 });
    const dayVolBase = 2e6 + R() * 8e6;
    for (const b of dbars) {
      const t = Math.floor((ms + 3.75 * 3600000) / 1000);
      hist.push({ time: t, open: N.r2(N.roundTick(b.open)), high: N.r2(N.roundTick(b.high)), low: N.r2(N.roundTick(b.low)), close: N.r2(N.roundTick(b.close)), volume: Math.round(dayVolBase * (0.6 + 0.9 * R() + 0.3 * Math.min(2, b.vol))), hist: true });
      nextBiz();
    }
    price = hist[hist.length - 1].close;

    const sessions = [], base = [], dailySim = [];
    const sessVolBase = 600 + R() * 1800;
    for (let d = 0; d < TOTAL_DAYS; d++) {
      price = Math.max(1, price * (1 + G() * 0.0032));
      const t0 = Math.floor((ms + 3.75 * 3600000) / 1000);
      const mb = genRegimeBars(R, G, price, SESSION_MIN, {
        capPct: 0.018 + R() * 0.014, baseVolPct: () => 0.0006 + R() * 0.0006, regimeLenMin: 12, regimeLenMax: 40, choppyChance: 0.35, driftPct: 0.0009, shockChance: 0.006, shockMult: 3.2,
        edgeMult: (i, tot) => { const t = i / tot; return 0.85 + 0.5 * Math.pow(Math.abs(2 * t - 1), 1.6); }
      });
      const bars = [], hiPre = [], loPre = []; let hh = -Infinity, ll = Infinity;
      let prevC = null;
      // volume model: persistent (clustered) activity + news-like spikes + coupling to bar size; the open/close bias is brief and noisy, not a smooth U
      const dayLvl = Math.exp(G() * 0.28); let lv = G() * 0.3, spike = 0, fav = 0;
      for (let m = 0; m < SESSION_MIN; m++) {
        const b = mb[m];
        let o = N.roundTick(b.open), c = N.roundTick(b.close);
        let h = Math.max(N.roundTick(b.high), o, c), l = Math.min(N.roundTick(b.low), o, c);
        o = N.r2(o); c = N.r2(c); h = N.r2(h); l = N.r2(l);
        const tt = m / SESSION_MIN, prof = (1 + 1.5 * Math.exp(-m / 6)) * (1 + 0.45 * Math.exp(-(SESSION_MIN - 1 - m) / 14)) * (1 - 0.16 * Math.exp(-Math.pow((tt - 0.5) / 0.14, 2)));
        lv = 0.86 * lv + 0.27 * G(); if (R() < 0.011) spike = 2.0 + R() * 3.2; spike *= 0.5;
        const body = Math.abs(c - o) / Math.max(1e-9, (h - l) || 1), act = 0.4 + 0.7 * Math.min(4, b.vol) + 0.35 * body + (h - l) / Math.max(o, 1) * 380;
        const volume = Math.max(1, Math.round(sessVolBase * 0.8 * dayLvl * prof * Math.exp(lv) * (1 + spike) * act * Math.exp(G() * 0.3)));
        bars.push({ time: t0 + m * 60, open: o, high: h, low: l, close: c, volume, minuteOfDay: m });
        hh = Math.max(hh, h); ll = Math.min(ll, l); hiPre.push(hh); loPre.push(ll); prevC = c;
      }
      price = prevC;
      const si = sessions.length;
      const i0 = base.length;
      bars.forEach(b => base.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, minuteOfDay: b.minuteOfDay, sessionIndex: si, idx: base.length }));
      sessions.push({ dateStr: N.fmtDMY(t0), time: t0, bars, hiPre, loPre, i0, i1: base.length - 1, open: bars[0].open, high: hh, low: ll, close: prevC });
      dailySim.push({ time: t0, open: bars[0].open, high: hh, low: ll, close: prevC, volume: bars.reduce((s, b) => s + b.volume, 0), sessionIndex: si, i0, i1: base.length - 1 });
      nextBiz();
    }
    M.dailyHistory = hist; M.sessions = sessions; M.base1m = base; M.dailySim = dailySim; M.dailyAll = hist.concat(dailySim);
    M.maxSec = base.length * 60 - 0.1;
    M.startSec = START_DAY * SESSION_MIN * 60;
    return M;
  };

  /* ---------- realistic tick path inside each 1-minute bar ---------- */
  function buildPath(bar, idx) {
    const R = mulberry32((M.seed * 7919 + idx * 104729) >>> 0), G = gaussFrom(R);
    const o = bar.open, h = bar.high, l = bar.low, c = bar.close, range = h - l, tr = range / TICK;
    const ts = [], ps = [];
    if (tr < 0.5) { ts.push(0, 59.9); ps.push(o, c); }
    else {
      let n = Math.round((14 + tr * 0.9 + R() * 22) * M.density); n = N.clamp(n, 6, 170);
      const lowFirst = (c >= o) ? R() < 0.62 : R() >= 0.62;
      const t1 = 4 + R() * 26, t2 = t1 + 8 + R() * Math.max(1, 54 - t1 - 8);
      const wp = lowFirst ? [[0, o], [t1, l], [t2, h], [59.9, c]] : [[0, o], [t1, h], [t2, l], [59.9, c]];
      ts.push(0); ps.push(o);
      for (let s = 0; s < 3; s++) {
        const ta = wp[s][0], pa = wp[s][1], tb = wp[s + 1][0], pb = wp[s + 1][1];
        const k = Math.max(2, Math.round(n * (tb - ta) / 60));
        const tt = []; for (let j = 0; j < k - 1; j++) tt.push(ta + (tb - ta) * (0.02 + 0.96 * R())); tt.sort((a, b) => a - b);
        const amp = Math.max(2 * TICK, 0.2 * Math.abs(pb - pa));
        tt.forEach(t => {
          const u = (t - ta) / (tb - ta);
          const e = u + 0.12 * Math.sin(u * Math.PI * (2 + R() * 3));
          let p = pa + (pb - pa) * N.clamp(e, 0, 1) + G() * amp * Math.sqrt(u * (1 - u)) * 0.9;
          if (R() < 0.22) p += (R() < 0.5 ? -TICK : TICK);
          p = N.r2(N.roundTick(N.clamp(p, l, h)));
          ts.push(t); ps.push(p);
        });
        ts.push(tb); ps.push(pb);
      }
    }
    const nT = ts.length, vs = new Array(nT), hs = new Array(nT), ls = new Array(nT);
    let cw = 0, hh = -Infinity, ll = Infinity; const w = [];
    for (let j = 0; j < nT; j++) { const x = 0.35 - Math.log(1 - R() * 0.999); w.push(x); cw += x; }
    let acc = 0;
    for (let j = 0; j < nT; j++) { acc += w[j]; vs[j] = acc / cw; hh = Math.max(hh, ps[j]); ll = Math.min(ll, ps[j]); hs[j] = hh; ls[j] = ll; }
    return { ts, ps, vs, hs, ls, n: nT };
  }
  M.pathFor = function (pi) {
    let p = M.pathCache.get(pi);
    if (!p) { p = buildPath(M.base1m[pi], pi); M.pathCache.set(pi, p); if (M.pathCache.size > 24) M.pathCache.delete(M.pathCache.keys().next().value); }
    return p;
  };
  M.setDensity = d => { M.density = d; M.pathCache = new Map(); };
  function idxAt(path, s) { let lo = 0, hi = path.n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (path.ts[mid] <= s) lo = mid; else hi = mid - 1; } return lo; }
  M.idxAt = idxAt;
  M.partialBar = function (pi, sec) {
    const b = M.base1m[pi];
    if (sec >= 59.9) return b;
    const p = M.pathFor(pi), j = idxAt(p, sec);
    return { time: b.time, open: b.open, high: p.hs[j], low: p.ls[j], close: p.ps[j], volume: Math.round(b.volume * p.vs[j]), minuteOfDay: b.minuteOfDay, sessionIndex: b.sessionIndex, idx: b.idx };
  };
  M.priceAt = function (sec) { const pi = Math.min(M.base1m.length - 1, Math.floor(sec / 60)); return M.partialBar(pi, sec - pi * 60).close; };
  M.clock = function (sec) {
    const pi = Math.min(M.base1m.length - 1, Math.floor(sec / 60)), b = M.base1m[pi];
    return { pi, sec: sec - pi * 60, minuteOfDay: b.minuteOfDay, sessionIndex: b.sessionIndex, time: b.time + (sec - pi * 60) };
  };

  /* ---------- aggregation ---------- */
  function aggIntraday(tf) {
    const out = []; let cur = null;
    for (const b of M.base1m) {
      const bucket = Math.floor(b.minuteOfDay / tf), bt = b.time - (b.minuteOfDay - bucket * tf) * 60;
      if (!cur || cur.time !== bt || cur.sessionIndex !== b.sessionIndex) {
        if (cur) out.push(cur);
        cur = { time: bt, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, sessionIndex: b.sessionIndex, i0: b.idx, i1: b.idx };
      } else { if (b.high > cur.high) cur.high = b.high; if (b.low < cur.low) cur.low = b.low; cur.close = b.close; cur.volume += b.volume; cur.i1 = b.idx; }
    }
    if (cur) out.push(cur); return out;
  }
  function aggByKey(keyFn) {
    const out = []; let cur = null, ck = null;
    M.dailyAll.forEach((b, di) => {
      const k = keyFn(b.time);
      if (k !== ck) { if (cur) out.push(cur); cur = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0, d0: di, d1: di }; ck = k; }
      else { if (b.high > cur.high) cur.high = b.high; if (b.low < cur.low) cur.low = b.low; cur.close = b.close; cur.volume += b.volume || 0; cur.d1 = di; }
    });
    if (cur) out.push(cur); return out;
  }
  function fullFor(tf) {
    let a = M.aggCache[tf]; if (a) return a;
    if (tf === 'D') a = M.dailyAll; else if (tf === 'W') a = aggByKey(weekKey); else if (tf === 'M') a = aggByKey(monthKey); else a = aggIntraday(tf);
    M.aggCache[tf] = a; return a;
  }
  function bsearch(arr, key, val) { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid][key] <= val) lo = mid; else hi = mid - 1; } return lo; }

  // forming accumulators for the 1m range [i0, pi-1] + partial bar
  const acc = { k: '', pi: -1, h: 0, l: 0, v: 0, c: 0 };
  function formRange(i0, pi, part, key) {
    if (acc.k !== key || pi < acc.pi) { acc.k = key; acc.pi = i0; acc.h = -Infinity; acc.l = Infinity; acc.v = 0; acc.c = M.base1m[i0].open; }
    for (let j = acc.pi; j < pi; j++) { const b = M.base1m[j]; if (b.high > acc.h) acc.h = b.high; if (b.low < acc.l) acc.l = b.low; acc.v += b.volume; acc.c = b.close; }
    acc.pi = Math.max(acc.pi, pi);
    return { open: M.base1m[i0].open, high: Math.max(acc.h, part.high), low: Math.min(acc.l, part.low), close: part.close, volume: acc.v + part.volume };
  }

  const feed = M.feed = { key: '', view: [], formIdx: 0, tf: 5 };
  // returns { view, formIdx, key, maxEndFloat, tf }
  M.series = function (tf, sec) {
    const ck = M.clock(sec), pi = ck.pi, part = M.partialBar(pi, ck.sec);
    const full = fullFor(tf);
    let idx, A, progress;
    const dayFrac = (ck.minuteOfDay * 60 + ck.sec) / (SESSION_MIN * 60);
    if (tf === 'D') { idx = HIST_DAYS + ck.sessionIndex; A = full[idx]; progress = dayFrac; }
    else if (tf === 'W' || tf === 'M') { const cd = HIST_DAYS + ck.sessionIndex; idx = bsearch(full, 'd0', cd); A = full[idx]; progress = ((cd - A.d0) + dayFrac) / (A.d1 - A.d0 + 1); }
    else { idx = bsearch(full, 'i0', pi); A = full[idx]; progress = ((ck.minuteOfDay % tf) * 60 + ck.sec) / (tf * 60); }
    const key = tf + ':' + idx + ':' + M.seed;
    if (feed.key !== key) {
      feed.key = key; feed.tf = tf; feed.formIdx = idx;
      feed.view = full.slice(0, idx);
      feed.view.push({ time: A.time, open: A.open, high: A.high, low: A.low, close: A.close, volume: 0, sessionIndex: A.sessionIndex });
    }
    const f = feed.view[idx], sess = M.sessions[ck.sessionIndex];
    let r;
    if (tf === 'W' || tf === 'M') {
      const cd = HIST_DAYS + ck.sessionIndex, day = M.dailySim[ck.sessionIndex];
      const dr = formRange(day.i0, pi, part, 'D' + cd);
      let o = M.dailyAll[A.d0].open, h = -Infinity, l = Infinity, v = 0;
      for (let d = A.d0; d < cd; d++) { const b = M.dailyAll[d]; if (b.high > h) h = b.high; if (b.low < l) l = b.low; v += b.volume || 0; }
      if (A.d0 === cd) o = day.open;
      r = { open: o, high: Math.max(h, dr.high), low: Math.min(l, dr.low), close: dr.close, volume: v + dr.volume };
    } else r = formRange(A.i0 !== undefined ? A.i0 : sess.i0, pi, part, key);
    f.open = r.open; f.high = r.high; f.low = r.low; f.close = r.close; f.volume = r.volume;
    feed.maxEndFloat = idx + progress; feed.progress = progress; feed.clock = ck; feed.part = part; feed.sess = sess;
    return feed;
  };

  /* ---------- indicators: causal step functions ---------- */
  const typ = b => (b.high + b.low + b.close) / 3;
  const IND = N.ind = {
    vwap: {
      init: () => ({ cpv: 0, cv: 0, s: null }),
      step(st, b, cx) { if (cx.intraday && b.sessionIndex !== st.s) { st.cpv = 0; st.cv = 0; st.s = b.sessionIndex; } const t = typ(b); st.cpv += t * b.volume; st.cv += b.volume; return st.cv ? st.cpv / st.cv : t; }
    },
    avwap: {
      init: () => ({ cpv: 0, cv: 0 }),
      step(st, b, cx) { if (b.sessionIndex < cx.anchor) return null; const t = typ(b); st.cpv += t * b.volume; st.cv += b.volume; return st.cv ? st.cpv / st.cv : t; }
    },
    ema: p => ({
      init: () => ({ e: null, s: null }),
      step(st, b, cx) { if (cx.intraday && cx.emaReset && b.sessionIndex !== st.s) { st.e = null; st.s = b.sessionIndex; } const k = 2 / (p + 1); st.e = st.e === null ? b.close : (b.close - st.e) * k + st.e; return st.e; }
    }),
    rsi: {
      init: () => ({ n: 0, prev: null, ag: 0, al: 0 }),
      step(st, b) {
        if (st.prev === null) { st.prev = b.close; return null; }
        const ch = b.close - st.prev; st.prev = b.close; const g = Math.max(0, ch), l = Math.max(0, -ch); st.n++;
        if (st.n <= 14) { st.ag += g / 14; st.al += l / 14; if (st.n < 14) return null; }
        else { st.ag = (st.ag * 13 + g) / 14; st.al = (st.al * 13 + l) / 14; }
        return st.al === 0 ? 100 : 100 - 100 / (1 + st.ag / st.al);
      }
    },
    oi: {
      init: () => ({ cum: 0, s: null }),
      step(st, b, cx) { if (cx.intraday && b.sessionIndex !== st.s) { st.cum = 0; st.s = b.sessionIndex; } st.cum += (b.close >= b.open ? b.volume : -b.volume); return st.cum; }
    }
  };

  const ST = N.ind;
  ST.emaC = p => ({ init: () => ({ e: null, n: 0 }), step(st, b) { const k = 2 / (p + 1); st.n++; st.e = st.e === null ? b.close : (b.close - st.e) * k + st.e; return st.n >= Math.min(p, 5) ? st.e : null; } });
  // period VWAP (key function resets)
  ST.vwapP = kind => ({
    init: () => ({ cpv: 0, cv: 0, k: null }),
    step(st, b) { const k = kind === 'W' ? weekKey(b.time) : kind === 'M' ? monthKey(b.time) : String(N.istDayKey(b.time)); if (k !== st.k) { st.k = k; st.cpv = 0; st.cv = 0; } const t = typ(b); st.cpv += t * b.volume; st.cv += b.volume; return st.cv ? st.cpv / st.cv : t; }
  });
  // previous-day VWAP as a step line through today
  ST.vwapPD = {
    init: () => ({ d: null, cpv: 0, cv: 0, prev: null }),
    step(st, b) { const d = N.istDayKey(b.time); if (d !== st.d) { if (st.d !== null && st.cv) st.prev = st.cpv / st.cv; st.d = d; st.cpv = 0; st.cv = 0; } const t = typ(b); st.cpv += t * b.volume; st.cv += b.volume; return st.prev; }
  };
  // anchored VWAP from an absolute time with volume-weighted SD bands. returns {m, s}
  ST.avwapT = {
    init: () => ({ pv: 0, pv2: 0, v: 0 }),
    step(st, b, cx) { if (b.time < cx.anchorT) return null; const t = typ(b); st.pv += t * b.volume; st.pv2 += t * t * b.volume; st.v += b.volume; const m = st.v ? st.pv / st.v : t, vr = st.v ? Math.max(0, st.pv2 / st.v - m * m) : 0; return { m, s: Math.sqrt(vr) }; }
  };
  // ADX / DI (Wilder RMA)
  ST.adx = n => ({
    init: () => ({ ph: null, pl: null, pc: null, tr: 0, dp: 0, dm: 0, cnt: 0, adx: null, dxs: [], atr: null, sp: 0, sm: 0, str: 0 }),
    step(st, b) {
      if (st.pc === null) { st.ph = b.high; st.pl = b.low; st.pc = b.close; return null; }
      const up = b.high - st.ph, dn = st.pl - b.low, pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0, tr = Math.max(b.high - b.low, Math.abs(b.high - st.pc), Math.abs(b.low - st.pc));
      st.ph = b.high; st.pl = b.low; st.pc = b.close; st.cnt++;
      if (st.cnt <= n) { st.str += tr; st.sp += pdm; st.sm += mdm; if (st.cnt < n) return null; }
      else { st.str = st.str - st.str / n + tr; st.sp = st.sp - st.sp / n + pdm; st.sm = st.sm - st.sm / n + mdm; }
      const pdi = st.str ? 100 * st.sp / st.str : 0, mdi = st.str ? 100 * st.sm / st.str : 0, dx = pdi + mdi ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
      if (st.adx === null) { st.dxs.push(dx); if (st.dxs.length < n) return { adx: null, pdi, mdi }; st.adx = st.dxs.reduce((a, c) => a + c, 0) / n; }
      else st.adx = (st.adx * (n - 1) + dx) / n;
      return { adx: st.adx, pdi, mdi };
    }
  });
  // fold over closed bars; returns {vals, st}
  N.foldInd = function (def, bars, cx) {
    const st = def.init(), vals = [];
    for (let i = 0; i < bars.length; i++) { const v = def.step(st, bars[i], cx); if (v !== null) vals.push({ time: bars[i].time, value: v }); }
    return { vals, st };
  };
  N.extendInd = function (def, base, bar, cx) {
    const st = Object.assign({}, base.st), v = def.step(st, bar, cx);
    return v === null ? base.vals : base.vals.concat([{ time: bar.time, value: v }]);
  };

  /* ---------- levels ---------- */
  function rangeInfo(bars, orderFn) {
    let hi = -Infinity, lo = Infinity, hiI = -1, loI = -1;
    bars.forEach((b, i) => { if (b.high > hi) { hi = b.high; hiI = i; } if (b.low < lo) { lo = b.low; loI = i; } });
    if (!isFinite(hi)) return null;
    let up = loI < hiI; if (loI === hiI) up = orderFn ? orderFn() : true;
    return { hi, lo, up };
  }
  function fibOf(r) {
    const range = r.hi - r.lo, up = r.up;
    return { hi: r.hi, lo: r.lo, l0: up ? r.hi : r.lo, l50: r.lo + range * 0.5, l618: up ? r.hi - range * 0.618 : r.lo + range * 0.618, l786: up ? r.hi - range * 0.786 : r.lo + range * 0.786, l100: up ? r.lo : r.hi };
  }
  const levelCache = {};
  M.levelsFor = function (si) {
    const key = M.seed + ':' + si; if (levelCache.key !== M.seed) { for (const k in levelCache) delete levelCache[k]; levelCache.key = M.seed; }
    if (levelCache[si]) return levelCache[si];
    const cd = HIST_DAYS + si, all = M.dailyAll, out = {};
    const prev = all[cd - 1];
    if (prev) {
      let bars1m = null; if (prev.i0 !== undefined) bars1m = M.base1m.slice(prev.i0, prev.i1 + 1);
      const r = bars1m ? rangeInfo(bars1m) : rangeInfo([prev], () => prev.close < prev.open);
      out.pd = r ? fibOf(r) : null;
    }
    const grp = kf => {
      const ck = kf(all[cd].time); let d = cd - 1; while (d >= 0 && kf(all[d].time) === ck) d--;
      if (d < 0) return null; const pk = kf(all[d].time); const bars = []; while (d >= 0 && kf(all[d].time) === pk) { bars.unshift(all[d]); d--; }
      const r = rangeInfo(bars, () => bars[0].close < bars[0].open); return r ? fibOf(r) : null;
    };
    out.pw = grp(weekKey); out.pm = grp(monthKey);
    levelCache[si] = out; return out;
  };
  M.dayStats = function (ck, part) {
    const s = M.sessions[ck.sessionIndex], m = ck.minuteOfDay;
    const hiC = m > 0 ? s.hiPre[m - 1] : -Infinity, loC = m > 0 ? s.loPre[m - 1] : Infinity;
    const orbN = 15, orbDone = m >= orbN;
    let oh, ol;
    if (m < orbN) { oh = Math.max(hiC, part.high); ol = Math.min(loC, part.low); } else { oh = s.hiPre[orbN - 1]; ol = s.loPre[orbN - 1]; }
    return { open: s.open, high: Math.max(hiC, part.high), low: Math.min(loC, part.low), orbH: oh, orbL: ol, orbDone };
  };
  /* ---------- time helpers for the axis / levels ---------- */
  N.nextBarTime = function (t, tf) {
    const p = istParts(t);
    const skipWk = x => { let q = x, d = istParts(q).dow; while (d === 0 || d === 6) { q += 86400; d = istParts(q).dow; } return q; };
    if (typeof tf === 'number') {
      const mod = p.h * 60 + p.m - 555;
      if (mod + tf >= SESSION_MIN) return skipWk(t - mod * 60 + 86400);
      return t + tf * 60;
    }
    if (tf === 'D') return skipWk(t + 86400);
    if (tf === 'W') return t + 7 * 86400;
    const d = new Date(Date.UTC(p.yr, p.mon + 1, 1)); return Math.floor(d.getTime() / 1000) - IST + 3.75 * 3600;
  };
  N.istDayKey = t => Math.floor((t + IST) / 86400);
  // first session index of the week / month that contains session si
  const perCache = {};
  M.periodStartSession = function (si, kind) {
    const kf = kind === 'W' ? weekKey : monthKey, k = kind + M.seed + ':' + si; if (perCache[k] !== undefined) return perCache[k];
    const key = kf(M.sessions[si].time); let j = si; while (j > 0 && kf(M.sessions[j - 1].time) === key) j--;
    return (perCache[k] = j);
  };
  // weekly trend filter: +1 / -1 / 0 using completed weeks before this session's week (close vs EMA20)
  M.weeklyTrend = function (si) {
    const W = fullFor('W'), cd = HIST_DAYS + si; let wi = bsearch(W, 'd0', cd) - 1; if (wi < 20) return 0;
    let e = W[0].close; const k = 2 / 21; for (let i = 1; i <= wi; i++) e = (W[i].close - e) * k + e;
    return W[wi].close > e ? 1 : W[wi].close < e ? -1 : 0;
  };
  N.STOCKS = STOCKS;
})(window.NTI);
