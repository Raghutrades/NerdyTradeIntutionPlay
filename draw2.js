/* NerdyTradeIntuition — drawing tools, part 2: more lines, fib/gann, harmonic & chart patterns, shapes, annotations, ranges, volume profile.
   Extends the Chart (draw.js). Extra anchor points live in dr.q[]. Hit-testing is automatic: the draw routine is replayed on a hidden canvas. */
(function (N) {
  'use strict';
  const C = N.Chart.prototype, clamp = N.clamp;
  Object.assign(N.ICONS, {
    crossl: '<path d="M12 3v18M3 12h18"/>',
    infol: '<path d="M4 17L20 7"/><circle cx="4" cy="17" r="1.6"/><circle cx="20" cy="7" r="1.6"/><path d="M9 21h8"/>',
    angle: '<path d="M4 19h16M4 19L17 7"/><path d="M12 19a8 8 0 0 0-1.5-4.6"/>',
    regr: '<path d="M3 17L21 8"/><path d="M3 12L21 3M3 22L21 13" opacity=".55"/>',
    fork: '<path d="M3 21L12 12M12 12L21 3M6 11L11 3M13 21l8-9"/>',
    fibfan: '<path d="M4 20L20 4M4 20L20 9M4 20L20 14M4 20h16"/>',
    fibtime: '<path d="M4 4v16M8 4v16M13 4v16M21 4v16"/>',
    fibcirc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    gannb: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M20 4L4 20M12 4v16M4 12h16"/>',
    gannf: '<path d="M4 20L20 4M4 20L20 10M4 20L20 16M4 20L14 4M4 20L9 4"/>',
    abcd: '<path d="M3 18l5-11 6 9 7-12"/>',
    xabcd: '<path d="M3 19L7 5l5 11 4-8 5 11"/>',
    hs: '<path d="M2 18l4-6 3 3 3-11 3 11 3-3 4 6"/>',
    ell: '<path d="M3 20l4-8 3 4 5-12 3 8 3-2"/>',
    circ: '<circle cx="12" cy="12" r="9"/>',
    plabel: '<path d="M3 12l5-4h13v8H8z"/>',
    flag2: '<path d="M6 3v18M6 4h12l-3 4 3 4H6"/>',
    callout: '<path d="M4 4h16v11H11l-4 4v-4H4z"/>',
    drange: '<path d="M5 4v16M19 4v16M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3"/>',
    prange2: '<path d="M4 5h16M4 19h16M12 5v14M9 8l3-3 3 3M9 16l3 3 3-3"/>',
    vprof: '<path d="M4 4v16M4 6h10M4 10h14M4 14h7M4 18h4"/>'
  });

  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const D = {};   // type -> definition (also added to N.DRAW)
  const reg = (type, def) => { D[type] = def; N.DRAW[type] = def; };
  const ptsOf = dr => [dr.a].concat(dr.b && N.DRAW[dr.type].pts >= 2 ? [dr.b] : [], dr.q || []);

  /* ---------- helpers handed to every draw routine ---------- */
  function env(chart, ctx, dr, font, fs) {
    const pad = chart.pad, W = chart.W, X = i => chart.xAtIdx(i), Y = p => chart.yAt(p);
    const e = {
      ctx, X, Y, font, fs, L: pad.left, R: W - pad.right, top: pad.top, bot: pad.top + chart.plotH, col: dr.color || '#f59e0b', lw: dr.width || 1.6, fa: dr.fillA != null ? dr.fillA : 0.14,
      colors: chart.colors, slot: chart.slot,
      P: p => ({ x: X(chart.idxOfTime(p.t)), y: Y(p.p) }),
      line: (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      poly: (P, close) => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (close) ctx.closePath(); },
      ray: (x1, y1, x2, y2) => { if (Math.abs(x2 - x1) < 0.5) return [x1, y1, x2, y2]; const k = (y2 - y1) / (x2 - x1), xr = x2 > x1 ? pad.left + (W - pad.right - pad.left) + 40 : pad.left - 40; return [x1, y1, xr, y1 + k * (xr - x1)]; },
      text: (t, x, y, o) => { o = o || {}; ctx.save(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.font = font(o.size || fs - 1, '700'); ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle'; ctx.fillStyle = o.color || e.col; ctx.fillText(t, x, y); ctx.restore(); },
      pill: (t, cx, cy, bg) => { ctx.save(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.font = font(fs, '700'); const w = ctx.measureText(t).width + 14, x = clamp(cx - w / 2, pad.left + 2, W - pad.right - w - 2), y = clamp(cy - 10, pad.top + 2, pad.top + chart.plotH - 22); ctx.fillStyle = bg || 'rgba(30,34,45,.92)'; rrect(ctx, x, y, w, 20, 5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 7, y + 10.5); ctx.restore(); },
      fillA: (fn) => { ctx.save(); ctx.globalAlpha = e.fa; ctx.fillStyle = e.col; fn(); ctx.restore(); },
      dashed: (fn, a) => { ctx.save(); ctx.setLineDash([4, 4]); ctx.globalAlpha = a || .65; fn(); ctx.restore(); }
    };
    return e;
  }

  /* ---------- the tools ---------- */
  reg('crossline', { n: 'Cross line', ic: 'crossl', pts: 1, g: 'Lines', fin(dr) { dr.b = dr.a; },
    draw(dr, e) { const p = e.P(dr.a); e.line(e.L, p.y, e.R, p.y); e.line(p.x, e.top, p.x, e.bot); } });

  reg('infoline', { n: 'Info line', ic: 'infol', pts: 2, g: 'Lines',
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b); e.line(a.x, a.y, b.x, b.y); const dp = dr.b.p - dr.a.p, bars = Math.round(this.idxOfTime(dr.b.t) - this.idxOfTime(dr.a.t)), ang = Math.round(Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI);
      e.pill((dp >= 0 ? '+' : '') + dp.toFixed(2) + ' (' + (dp / dr.a.p * 100).toFixed(2) + '%) · ' + Math.abs(bars) + ' bars · ' + ang + '°', (a.x + b.x) / 2, (a.y + b.y) / 2 - 18); } });

  reg('trendangle', { n: 'Trend angle', ic: 'angle', pts: 2, g: 'Lines',
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx; e.line(a.x, a.y, b.x, b.y); const base = b.x >= a.x ? 0 : Math.PI, ang = Math.atan2(b.y - a.y, b.x - a.x); let dl = ang - base; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl <= -Math.PI) dl += 2 * Math.PI;
      e.dashed(() => { e.line(a.x, a.y, a.x + (b.x >= a.x ? 1 : -1) * Math.max(60, Math.abs(b.x - a.x)), a.y); ctx.beginPath(); ctx.arc(a.x, a.y, 28, base, base + dl, dl < 0); ctx.stroke(); });
      e.text(Math.round(-dl * 180 / Math.PI * (b.x >= a.x ? 1 : -1)) + '°', a.x + (b.x >= a.x ? 44 : -44), a.y + (dl < 0 ? -12 : 12)); } });

  reg('regression', { n: 'Regression channel', ic: 'regr', pts: 2, g: 'Lines',
    fin(dr) { const r = this._regress(dr); if (r) { dr.a = { t: dr.a.t, p: r.y0 }; dr.b = { t: dr.b.t, p: r.y1 }; } },
    draw(dr, e) { const r = this._regress(dr); if (!r) return; const ctx = e.ctx, X0 = e.X(r.i0), X1 = e.X(r.i1), y = (k, i) => e.Y(r.c + r.m * (i - r.i0) + k * r.s);
      e.fillA(() => { ctx.beginPath(); ctx.moveTo(X0, y(2, r.i0)); ctx.lineTo(X1, y(2, r.i1)); ctx.lineTo(X1, y(-2, r.i1)); ctx.lineTo(X0, y(-2, r.i0)); ctx.closePath(); ctx.fill(); });
      [2, 0, -2].forEach(k => { if (k === 0) { ctx.save(); ctx.setLineDash([5, 4]); } e.line(X0, y(k, r.i0), X1, y(k, r.i1)); if (k === 0) ctx.restore(); });
      e.pill('R² ' + r.r2.toFixed(2) + ' · σ ' + r.s.toFixed(2), (X0 + X1) / 2, Math.min(y(2, r.i0), y(2, r.i1)) - 16); } });
  C._regress = function (dr) {
    const cs = this.d.candles, ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), i0 = Math.max(0, Math.round(Math.min(ia, ib))), i1 = Math.min(cs.length - 1, Math.round(Math.max(ia, ib))), n = i1 - i0 + 1; if (n < 3) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0; for (let i = i0; i <= i1; i++) { const x = i - i0, y = cs[i].close; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
    const den = n * sxx - sx * sx || 1, m = (n * sxy - sx * sy) / den, c = (sy - m * sx) / n; let ss = 0, st = 0; for (let i = i0; i <= i1; i++) { const f = c + m * (i - i0), y = cs[i].close; ss += (y - f) ** 2; st += (y - sy / n) ** 2; }
    return { i0, i1, m, c, s: Math.sqrt(ss / n), r2: st > 0 ? 1 - ss / st : 0, y0: c, y1: c + m * (i1 - i0) };
  };

  reg('pitchfork', { n: 'Andrews pitchfork', ic: 'fork', pts: 2, g: 'Lines',
    fin(dr) { const ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), n = ib - ia, d = dr.b.p - dr.a.p; dr.q = [{ t: this.timeAt(Math.round(ib + Math.max(2, n * 0.35))), p: dr.b.p - d * 0.55 }]; },
    draw(dr, e) { if (!dr.q || !dr.q[0]) return; const ctx = e.ctx, A = e.P(dr.a), B = e.P(dr.b), K = e.P(dr.q[0]), M = { x: (B.x + K.x) / 2, y: (B.y + K.y) / 2 }, dx = M.x - A.x, dy = M.y - A.y; if (Math.abs(dx) < 0.5) return;
      const xr = dx > 0 ? e.R + 40 : e.L - 40, at = p => ({ x: xr, y: p.y + dy / dx * (xr - p.x) }), Be = at(B), Ke = at(K), Me = at(A);
      e.fillA(() => { e.poly([B, Be, Ke, K], true); ctx.fill(); });
      e.line(A.x, A.y, Me.x, Me.y); e.line(B.x, B.y, Be.x, Be.y); e.line(K.x, K.y, Ke.x, Ke.y); e.dashed(() => { e.line(B.x, B.y, K.x, K.y); e.line(A.x, A.y, B.x, B.y); }); } });

  reg('fibfan', { n: 'Fib speed fan', ic: 'fibfan', pts: 2, g: 'Fibonacci',
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), dy = b.y - a.y, ctx = e.ctx; if (Math.abs(b.x - a.x) < 1) return; [0.382, 0.5, 0.618, 0.786, 1].forEach(r => { const t = e.ray(a.x, a.y, b.x, a.y + dy * r); ctx.save(); ctx.globalAlpha = r === 1 ? 1 : .75; e.line(t[0], t[1], t[2], t[3]); ctx.restore(); e.text(String(r), b.x + (b.x >= a.x ? 14 : -14), a.y + dy * r, { size: e.fs - 2 }); });
      e.dashed(() => e.line(a.x, a.y, b.x, a.y), .4); } });

  reg('fibtime', { n: 'Fib time zones', ic: 'fibtime', pts: 2, g: 'Fibonacci',
    draw(dr, e) { const ia = this.idxOfTime(dr.a.t), n = this.idxOfTime(dr.b.t) - ia; if (!n) return; [0, 1, 2, 3, 5, 8, 13, 21, 34, 55].forEach((f, i) => { const x = e.X(ia + n * f); if (x < e.L - 2 || x > e.R + 2) return; e.ctx.save(); e.ctx.globalAlpha = f === 0 || f === 1 ? 1 : .6; e.line(x, e.top, x, e.bot); e.ctx.restore(); e.text(String(f), x + 8, e.top + 10, { size: e.fs - 1 }); }); } });

  reg('fibcircle', { n: 'Fib circles', ic: 'fibcirc', pts: 2, g: 'Fibonacci',
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = Math.hypot(b.x - a.x, b.y - a.y) / 2; [0.382, 0.618, 1, 1.618, 2.618].forEach(k => { ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r * k), 0, 7); ctx.stroke(); e.text(String(k), cx, cy - r * k - 6, { size: e.fs - 2 }); }); e.dashed(() => e.line(a.x, a.y, b.x, b.y)); } });

  reg('gannbox', { n: 'Gann box', ic: 'gannb', pts: 2, g: 'Gann', fillHit: true,
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y); e.fillA(() => ctx.fillRect(x0, y0, w, h)); ctx.strokeRect(x0 + .5, y0 + .5, w, h);
      ctx.save(); ctx.globalAlpha = .55; [0.25, 0.382, 0.5, 0.618, 0.75].forEach(r => { e.line(x0 + w * r, y0, x0 + w * r, y0 + h); e.line(x0, y0 + h * r, x0 + w, y0 + h * r); }); e.line(x0, y0, x0 + w, y0 + h); e.line(x0 + w, y0, x0, y0 + h); ctx.restore(); } });

  reg('gannfan', { n: 'Gann fan', ic: 'gannf', pts: 2, g: 'Gann',
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), dx = b.x - a.x, dy = b.y - a.y, ctx = e.ctx; if (Math.abs(dx) < 1) return;
      [[8, '8×1'], [4, '4×1'], [3, '3×1'], [2, '2×1'], [1, '1×1'], [0.5, '1×2'], [1 / 3, '1×3'], [0.25, '1×4'], [0.125, '1×8']].forEach(([m, lb]) => { const t = e.ray(a.x, a.y, a.x + dx, a.y + dy * m); ctx.save(); ctx.globalAlpha = m === 1 ? 1 : .6; ctx.lineWidth = m === 1 ? e.lw + .6 : e.lw; e.line(t[0], t[1], t[2], t[3]); ctx.restore(); e.text(lb, a.x + dx * 1.04 + (dx >= 0 ? 12 : -12), a.y + dy * m * 1.04, { size: e.fs - 2 }); }); } });

  /* ----- patterns ----- */
  const letters = (e, P, names, up) => P.forEach((p, i) => { const above = up ? up(i) : i % 2 === 0; e.text(names[i], p.x, p.y + (above ? -12 : 12)); e.ctx.save(); e.ctx.beginPath(); e.ctx.arc(p.x, p.y, 2.6, 0, 7); e.ctx.fillStyle = e.col; e.ctx.fill(); e.ctx.restore(); });
  const ratio = (a, b) => (b === 0 ? '—' : Math.abs(a / b).toFixed(3));
  reg('abcd', { n: 'ABCD pattern', ic: 'abcd', pts: 2, g: 'Patterns',
    fin(dr) { const ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), n = Math.max(2, ib - ia), d = dr.b.p - dr.a.p, cp = dr.b.p - d * 0.618, ci = ib + Math.max(2, Math.round(n * 0.6)); dr.q = [{ t: this.timeAt(ci), p: cp }, { t: this.timeAt(Math.round(ci + n)), p: cp + d }]; },
    draw(dr, e) { if (!dr.q || dr.q.length < 2) return; const P = [dr.a, dr.b, dr.q[0], dr.q[1]].map(e.P), ab = dr.b.p - dr.a.p, bc = dr.q[0].p - dr.b.p, cd = dr.q[1].p - dr.q[0].p, ctx = e.ctx;
      e.fillA(() => { e.poly([P[0], P[1], P[2]], true); ctx.fill(); e.poly([P[1], P[2], P[3]], true); ctx.fill(); }); e.poly(P); ctx.stroke(); e.dashed(() => { e.line(P[0].x, P[0].y, P[2].x, P[2].y); e.line(P[1].x, P[1].y, P[3].x, P[3].y); });
      letters(e, P, ['A', 'B', 'C', 'D'], i => (dr.b.p >= dr.a.p) === (i % 2 === 1)); e.text(ratio(bc, ab), (P[1].x + P[2].x) / 2, (P[1].y + P[2].y) / 2, { color: e.colors.dim || '#9ca3af', size: e.fs - 2 }); e.text(ratio(cd, ab), (P[2].x + P[3].x) / 2, (P[2].y + P[3].y) / 2, { color: e.colors.dim || '#9ca3af', size: e.fs - 2 }); } });

  reg('xabcd', { n: 'XABCD (harmonic)', ic: 'xabcd', pts: 2, g: 'Patterns',
    fin(dr) { const ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), n = Math.max(2, ib - ia), d = dr.b.p - dr.a.p, Bp = dr.b.p - d * 0.618, Cp = Bp + (dr.b.p - Bp) * 0.618, Dp = dr.b.p - d * 0.786, i1 = ib + Math.round(n * 0.6), i2 = i1 + Math.round(n * 0.5), i3 = i2 + Math.round(n * 0.7);
      dr.q = [{ t: this.timeAt(i1), p: Bp }, { t: this.timeAt(i2), p: Cp }, { t: this.timeAt(i3), p: Dp }]; },
    draw(dr, e) { if (!dr.q || dr.q.length < 3) return; const pts = [dr.a, dr.b].concat(dr.q), P = pts.map(e.P), ctx = e.ctx, xa = dr.b.p - dr.a.p, ab = dr.q[0].p - dr.b.p, bc = dr.q[1].p - dr.q[0].p, xd = dr.q[2].p - dr.a.p, cd = dr.q[2].p - dr.q[1].p;
      e.fillA(() => { e.poly([P[0], P[1], P[2]], true); ctx.fill(); e.poly([P[2], P[3], P[4]], true); ctx.fill(); }); e.poly(P); ctx.stroke();
      e.dashed(() => { e.line(P[0].x, P[0].y, P[2].x, P[2].y); e.line(P[1].x, P[1].y, P[3].x, P[3].y); e.line(P[2].x, P[2].y, P[4].x, P[4].y); e.line(P[0].x, P[0].y, P[4].x, P[4].y); });
      letters(e, P, ['X', 'A', 'B', 'C', 'D'], i => (dr.b.p >= dr.a.p) === (i % 2 === 1)); const dim = e.colors.dim || '#9ca3af', mid = (p, q) => [(p.x + q.x) / 2, (p.y + q.y) / 2];
      [[P[1], P[2], ab, xa], [P[2], P[3], bc, ab], [P[3], P[4], cd, bc], [P[0], P[4], xd, xa]].forEach(([p, q, n1, d1]) => { const m = mid(p, q); e.text(ratio(n1, d1), m[0], m[1], { color: dim, size: e.fs - 2 }); }); } });

  reg('hs', { n: 'Head & shoulders', ic: 'hs', pts: 2, g: 'Patterns',
    fin(dr) { const ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), n = ib - ia; let h = dr.b.p - dr.a.p; if (Math.abs(h) < N.TICK * 6) h = dr.a.p * 0.02; const base = dr.a.p, pt = (f, g) => ({ t: this.timeAt(Math.round(ia + n * f)), p: base + h * g });
      dr.b = { t: dr.b.t, p: base }; dr.q = [pt(0.17, 0.65), pt(0.31, 0.3), pt(0.5, 1), pt(0.69, 0.3), pt(0.83, 0.65)]; },
    draw(dr, e) { if (!dr.q || dr.q.length < 5) return; const pts = [dr.a].concat(dr.q, [dr.b]), P = pts.map(e.P), ctx = e.ctx, q = dr.q, up = q[2].p >= dr.a.p;
      e.fillA(() => { e.poly([P[1], P[2], P[3]], true); ctx.fill(); e.poly([P[3], P[4], P[5]], true); ctx.fill(); }); e.poly(P); ctx.stroke();
      const nl = e.ray(P[2].x, P[2].y, P[4].x, P[4].y), nl2 = (() => { const k = (P[4].y - P[2].y) / ((P[4].x - P[2].x) || 1); return [P[2].x - 30, P[2].y - 30 * k]; })(); e.dashed(() => { e.line(nl2[0], nl2[1], nl[2], nl[3]); }, .85);
      [[1, 'LS'], [3, 'Head'], [5, 'RS']].forEach(([i, t]) => e.text(t, P[i].x, P[i].y + (up ? -13 : 13))); } });

  reg('elliott', { n: 'Elliott impulse (1-5)', ic: 'ell', pts: 2, g: 'Patterns',
    fin(dr) { const ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), n = Math.max(5, ib - ia), d = dr.b.p - dr.a.p || dr.a.p * 0.03, base = dr.a.p, pt = (f, g) => ({ t: this.timeAt(Math.round(ia + n * f)), p: base + d * g });
      dr.b = { t: this.timeAt(Math.round(ia + n)), p: base + d }; dr.q = [pt(0.15, 0.3), pt(0.3, 0.12), pt(0.55, 0.75), pt(0.72, 0.5)]; },
    draw(dr, e) { if (!dr.q || dr.q.length < 4) return; const P = [dr.a].concat(dr.q, [dr.b]).map(e.P), up = dr.b.p >= dr.a.p; e.poly(P); e.ctx.stroke(); P.forEach((p, i) => { const peak = (i % 2 === 1) === up; e.text(String(i), p.x, p.y + (peak ? -12 : 12)); }); } });

  /* ----- shapes / notes ----- */
  reg('circle', { n: 'Circle', ic: 'circ', pts: 2, g: 'Shapes', fillHit: true,
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, r = Math.hypot(b.x - a.x, b.y - a.y); ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(1, r), 0, 7); e.fillA(() => ctx.fill()); ctx.stroke(); } });

  reg('pricelabel', { n: 'Price label', ic: 'plabel', pts: 1, g: 'Annotate', fillHit: true, fin(dr) { dr.b = dr.a; },
    draw(dr, e) { const p = e.P(dr.a), ctx = e.ctx, t = dr.a.p.toFixed(2); ctx.save(); ctx.font = e.font(e.fs, '700'); const w = ctx.measureText(t).width + 16; ctx.fillStyle = e.col; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 8, p.y - 11); ctx.lineTo(p.x + 8 + w, p.y - 11); ctx.lineTo(p.x + 8 + w, p.y + 11); ctx.lineTo(p.x + 8, p.y + 11); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#0b0f17'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, p.x + 16, p.y + .5); ctx.restore(); } });

  reg('flag', { n: 'Flag mark', ic: 'flag2', pts: 1, g: 'Annotate', fillHit: true, fin(dr) { dr.b = dr.a; },
    draw(dr, e) { const p = e.P(dr.a), ctx = e.ctx; e.line(p.x, p.y, p.x, p.y - 30); ctx.beginPath(); ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.x + 20, p.y - 23); ctx.lineTo(p.x, p.y - 15); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 7); ctx.fill(); } });

  reg('callout', { n: 'Callout (note + pointer)', ic: 'callout', pts: 2, g: 'Annotate', fillHit: true,
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, txt = dr.text || 'Note'; ctx.save(); ctx.font = e.font(e.fs + 1, '600'); const w = ctx.measureText(txt).width + 18, h = 26, bx = b.x - w / 2, by = b.y - h / 2; ctx.restore();
      ctx.save(); ctx.setLineDash([]); e.line(a.x, a.y, clamp(a.x, bx, bx + w), clamp(a.y, by, by + h)); ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, 7); ctx.fill(); ctx.globalAlpha = .95; ctx.fillStyle = e.colors.tag || '#1e2433'; rrect(ctx, bx, by, w, h, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ctx.fillStyle = e.col; ctx.font = e.font(e.fs + 1, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 9, by + h / 2 + .5); ctx.restore(); } });

  /* ----- ranges / profile ----- */
  reg('daterange', { n: 'Date range', ic: 'drange', pts: 2, g: 'Measure', fillHit: true,
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, x0 = Math.min(a.x, b.x), w = Math.abs(b.x - a.x), bars = Math.abs(Math.round(this.idxOfTime(dr.b.t) - this.idxOfTime(dr.a.t))), sec = Math.abs(dr.b.t - dr.a.t), my = (e.top + e.bot) / 2;
      e.fillA(() => ctx.fillRect(x0, e.top, w, e.bot - e.top)); e.line(a.x, e.top, a.x, e.bot); e.line(b.x, e.top, b.x, e.bot); e.line(x0, my, x0 + w, my);
      const hd = b.x >= a.x ? -1 : 1; ctx.beginPath(); ctx.moveTo(b.x, my); ctx.lineTo(b.x + hd * 8, my - 4); ctx.lineTo(b.x + hd * 8, my + 4); ctx.closePath(); ctx.fill();
      e.pill(bars + ' bars · ' + (sec >= 86400 ? Math.round(sec / 86400) + ' d' : N.dur(sec)), x0 + w / 2, my - 18); } });

  reg('pricerange', { n: 'Price range', ic: 'prange2', pts: 2, g: 'Measure', fillHit: true,
    draw(dr, e) { const a = e.P(dr.a), b = e.P(dr.b), ctx = e.ctx, y0 = Math.min(a.y, b.y), h = Math.abs(b.y - a.y), dp = dr.b.p - dr.a.p, cx = clamp(Math.max(a.x, b.x), e.L + 80, e.R - 80);
      e.fillA(() => ctx.fillRect(e.L, y0, e.R - e.L, h)); e.line(e.L, a.y, e.R, a.y); e.line(e.L, b.y, e.R, b.y); e.line(cx, a.y, cx, b.y); e.pill((dp >= 0 ? '+' : '') + dp.toFixed(2) + ' (' + (dp / dr.a.p * 100).toFixed(2) + '%)', cx, y0 + h / 2); } });

  reg('vprofile', { n: 'Volume profile (range)', ic: 'vprof', pts: 2, g: 'Measure', fillHit: true,
    draw(dr, e) { const cs = this.d.candles, ia = this.idxOfTime(dr.a.t), ib = this.idxOfTime(dr.b.t), i0 = Math.max(0, Math.round(Math.min(ia, ib))), i1 = Math.min(cs.length - 1, Math.round(Math.max(ia, ib))); if (i1 - i0 < 1) return;
      let lo = Infinity, hi = -Infinity; for (let i = i0; i <= i1; i++) { lo = Math.min(lo, cs[i].low); hi = Math.max(hi, cs[i].high); } const NB = 32, st = (hi - lo) / NB || 1, v = new Array(NB).fill(0);
      for (let i = i0; i <= i1; i++) { const c = cs[i], b0 = clamp(Math.floor((c.low - lo) / st), 0, NB - 1), b1 = clamp(Math.floor((c.high - lo) / st), 0, NB - 1), share = (c.volume || 1) / (b1 - b0 + 1); for (let b = b0; b <= b1; b++) v[b] += share; }
      let poc = 0, tot = 0; v.forEach((x, i) => { tot += x; if (x > v[poc]) poc = i; }); let a = poc, b = poc, acc = v[poc]; while (acc < tot * 0.7 && (a > 0 || b < NB - 1)) { const up = b < NB - 1 ? v[b + 1] : -1, dn = a > 0 ? v[a - 1] : -1; if (up >= dn) { b++; acc += v[b]; } else { a--; acc += v[a]; } }
      const ctx = e.ctx, x0 = e.X(i0) - e.slot / 2, x1 = e.X(i1) + e.slot / 2, wmax = Math.max(50, (x1 - x0) * 0.6);
      ctx.save(); ctx.setLineDash([]); ctx.globalAlpha = .12; ctx.fillStyle = e.col; ctx.fillRect(x0, e.Y(hi), x1 - x0, e.Y(lo) - e.Y(hi)); ctx.restore();
      v.forEach((x, i) => { const yT = e.Y(lo + (i + 1) * st), yB = e.Y(lo + i * st), w = x / v[poc] * wmax, inVA = i >= a && i <= b; ctx.save(); ctx.globalAlpha = i === poc ? .8 : inVA ? .5 : .28; ctx.fillStyle = i === poc ? '#f59e0b' : e.col; ctx.fillRect(x0, yT + .5, w, Math.max(1, yB - yT - 1)); ctx.restore(); });
      const py = e.Y(lo + (poc + 0.5) * st); e.dashed(() => { ctx.strokeStyle = '#f59e0b'; e.line(x0, py, x1, py); }, .9); e.text('POC ' + (lo + (poc + 0.5) * st).toFixed(2), x1 - 4, py - 8, { align: 'right', color: '#f59e0b' });
      e.text('VAH ' + (lo + (b + 1) * st).toFixed(2) + ' · VAL ' + (lo + a * st).toFixed(2), x0 + 4, e.Y(hi) - 8, { align: 'left', size: e.fs - 2 }); } });

  /* ---------- plug into the engine ---------- */
  const _fin = C._finishDraft; C._finishDraft = function (dr) { const T = D[dr.type]; if (T) { if (T.fin) T.fin.call(this, dr); else if (N.DRAW[dr.type].pts === 1) dr.b = dr.a; return; } return _fin.call(this, dr); };
  const _h = C._handles; C._handles = function (dr, g) {
    const T = D[dr.type]; if (!T) return _h.call(this, dr, g); const H = [{ k: 'a', x: g.xa, y: g.ya }]; if (T.pts >= 2) H.push({ k: 'b', x: g.xb, y: g.yb });
    (dr.q || []).forEach((p, i) => H.push({ k: 'q' + i, x: this.xAtIdx(this.idxOfTime(p.t)), y: this.yAt(p.p) })); return H;
  };
  const _s = C._snapDrag; C._snapDrag = function (d) { const q = _s.call(this, d); if (d.q) { q.qs = d.q.map(p => ({ t: p.t, p: p.p })); q.iq = d.q.map(p => this.idxOfTime(p.t)); } return q; };
  const _ap = C._applyDrag; C._applyDrag = function (q, x, y) {
    const d = q.d, T = D[d.type];
    if (T && q.part && q.part[0] === 'q' && q.part !== 'qq') { const i = +q.part.slice(1); if (d.q && d.q[i]) d.q[i] = this._pt(x, y); return; }
    _ap.call(this, q, x, y);
    if (T && q.part === 'body' && q.s.qs) { const di = Math.round((x - q.x0) / this.slot), dp = this.priceAtY(y) - this.priceAtY(q.y0); d.q = q.s.qs.map((p, i) => ({ t: this.timeAt(Math.max(0, q.s.iq[i] + di)), p: p.p + dp })); }
    if (T && N.DRAW[d.type].pts === 1) d.b = d.a;
  };
  const FONTF = (px, w) => (w || '') + ' ' + px + 'px -apple-system,"Segoe UI",Inter,Roboto,system-ui,sans-serif';
  const _d1 = C._drawOne; C._drawOne = function (ctx, dr, X, Y, slot, W, font, fs, sel) {
    const T = D[dr.type]; if (!T) return _d1.apply(this, arguments);
    if (dr.id === 'draft' && T.fin && !dr.q) { dr = Object.assign({}, dr); T.fin.call(this, dr); }
    const e = env(this, ctx, dr, font, fs), col = e.col, dash = dr.dash === 'dashed' ? [6, 4] : dr.dash === 'dotted' ? [2, 3] : [];
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = e.lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash);
    try { T.draw.call(this, dr, e); } catch (err) { /* a half-built shape must never break the chart */ }
    if (sel) { const g = this._geo(dr), H = this._handles(dr, g); ctx.setLineDash([]); ctx.lineWidth = 1.6; ctx.strokeStyle = col; H.forEach(h => { ctx.fillStyle = this.colors.bg; ctx.beginPath(); ctx.arc(h.x, h.y, 5.2, 0, 7); ctx.fill(); ctx.stroke(); }); if (dr.locked) { ctx.fillStyle = col; ctx.font = font(fs, '700'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('🔒', g.xa + 8, g.ya - 12); } }
    ctx.restore();
  };
  /* hit test = replay the draw routine on a hidden canvas and ask the browser whether the pointer is on the stroke */
  const hcv = document.createElement('canvas'); hcv.width = hcv.height = 4; const hc = hcv.getContext('2d');
  const _b = C._bodyHit; C._bodyHit = function (dr, g, x, y, tol) {
    const T = D[dr.type]; if (!T) return _b.call(this, dr, g, x, y, tol);
    let hit = false;
    const px = new Proxy(hc, {
      get(t, k) {
        if (k === 'stroke') return () => { if (t.isPointInStroke(x, y)) hit = true; };
        if (k === 'fill') return () => { if (T.fillHit && t.isPointInPath(x, y)) hit = true; };
        if (k === 'fillRect') return (a, b2, c, d) => { if (T.fillHit && x >= a && x <= a + c && y >= b2 && y <= b2 + d) hit = true; };
        if (k === 'strokeRect') return (a, b2, c, d) => { const inX = x >= a - tol && x <= a + c + tol, inY = y >= b2 - tol && y <= b2 + d + tol; if (inX && inY && (Math.abs(x - a) < tol || Math.abs(x - a - c) < tol || Math.abs(y - b2) < tol || Math.abs(y - b2 - d) < tol)) hit = true; };
        if (k === 'fillText' || k === 'strokeText' || k === 'setLineDash') return () => { };
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, v) { if (k === 'lineWidth') v = Math.max(v, tol * 2); t[k] = v; return true; }
    });
    const e = env(this, px, dr, FONTF, N.cfg.fontSize || 11);
    try { T.draw.call(this, dr, e); } catch (err) { }
    return hit;
  };

  /* keep the menu tidy: group by section in a fixed order */
  const ORDER = ['Lines', 'Fibonacci', 'Gann', 'Patterns', 'Shapes', 'Annotate', 'Measure', 'Risk / reward'], ent = Object.entries(N.DRAW);
  ent.sort((x, y) => ORDER.indexOf(x[1].g) - ORDER.indexOf(y[1].g)); ent.forEach(([k]) => delete N.DRAW[k]); ent.forEach(([k, v]) => { N.DRAW[k] = v; });
})(window.NTI);
