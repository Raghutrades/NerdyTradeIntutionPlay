/* NerdyTradeIntuition — drawing tools engine (extends the Chart): lines, shapes, fib, text, markers, range, long / short risk-reward positions */
(function (N) {
  'use strict';
  const clamp = N.clamp, C = N.Chart.prototype;
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- registry: name, icon, how many anchor points, menu group ---------- */
  N.DRAW = {
    trend: { n: 'Trend line', ic: 'trend', pts: 2, g: 'Lines' },
    ray: { n: 'Ray', ic: 'ray', pts: 2, g: 'Lines' },
    extline: { n: 'Extended line', ic: 'extline', pts: 2, g: 'Lines' },
    arrow: { n: 'Arrow', ic: 'arrow', pts: 2, g: 'Lines' },
    hray: { n: 'Horizontal ray', ic: 'hray', pts: 1, g: 'Lines' },
    vline: { n: 'Vertical line', ic: 'vline', pts: 1, g: 'Lines' },
    channel: { n: 'Parallel channel', ic: 'channel', pts: 3, g: 'Lines' },
    brush: { n: 'Brush (freehand)', ic: 'brush', pts: 'free', g: 'Lines' },
    fib: { n: 'Fib retracement', ic: 'fibi', pts: 2, g: 'Fibonacci' },
    fibext: { n: 'Fib extension (3 point)', ic: 'fibext', pts: 3, g: 'Fibonacci' },
    rect: { n: 'Rectangle', ic: 'rect', pts: 2, g: 'Shapes' },
    ellipse: { n: 'Ellipse', ic: 'ellipse', pts: 2, g: 'Shapes' },
    tri: { n: 'Triangle', ic: 'tri', pts: 3, g: 'Shapes' },
    text: { n: 'Text note', ic: 'text', pts: 1, g: 'Annotate' },
    mkup: { n: 'Buy marker', ic: 'up', pts: 1, g: 'Annotate' },
    mkdn: { n: 'Sell marker', ic: 'down', pts: 1, g: 'Annotate' },
    prange: { n: 'Price & time range', ic: 'prange', pts: 2, g: 'Measure' },
    longpos: { n: 'Long position', ic: 'longpos', pts: 'pos', g: 'Risk / reward' },
    shortpos: { n: 'Short position', ic: 'shortpos', pts: 'pos', g: 'Risk / reward' }
  };
  const isPos = d => d.type === 'longpos' || d.type === 'shortpos';
  N.isPosDraw = isPos;
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], FIBX = [0, 0.382, 0.5, 0.618, 1, 1.272, 1.618, 2, 2.618];
  const DEFCOL = { mkup: '#26a69a', mkdn: '#ef5350', longpos: '#26a69a', shortpos: '#ef5350', text: '#e5e7eb' };
  N.drawColor = t => DEFCOL[t] || N.sty('draw').c;

  /* ---------- geometry in pixels ---------- */
  C._dxy = function (dr) { return this._geo(dr); };
  C._geo = function (dr) {
    const ix = t => this.xAtIdx(this.idxOfTime(t)), g = { xa: ix(dr.a.t), ya: this.yAt(dr.a.p) };
    if (dr.b) { g.xb = ix(dr.b.t); g.yb = this.yAt(dr.b.p); } else { g.xb = g.xa; g.yb = g.ya; }
    if (dr.c) { g.xc = ix(dr.c.t); g.yc = this.yAt(dr.c.p); }
    if (dr.type === 'channel') { g.xc = g.xa; g.yc = this.yAt(dr.a.p + (dr.off || 0)); }
    if (isPos(dr)) { g.yb = g.ya; g.ytp = this.yAt(dr.tp); g.ysl = this.yAt(dr.sl); g.xb = Math.max(g.xb, g.xa + 24); }
    return g;
  };
  C._handles = function (dr, g) {
    const t = dr.type, top = this.pad.top, H = [];
    if (t === 'vline') return [{ k: 'a', x: g.xa, y: top + 14 }];
    if (t === 'brush') return [];
    if (isPos(dr)) return [{ k: 'a', x: g.xa, y: g.ya }, { k: 'b', x: g.xb, y: g.ya }, { k: 'tp', x: g.xb, y: g.ytp }, { k: 'sl', x: g.xb, y: g.ysl }];
    H.push({ k: 'a', x: g.xa, y: g.ya });
    const def = N.DRAW[t]; if (def && def.pts >= 2) H.push({ k: 'b', x: g.xb, y: g.yb });
    if (t === 'channel') H.push({ k: 'c', x: g.xa, y: g.yc });
    if (t === 'tri' || t === 'fibext') H.push({ k: 'c', x: g.xc, y: g.yc });
    return H;
  };
  const segD = (px, py, x1, y1, x2, y2, mode) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l2; if (mode === 'seg') t = Math.max(0, Math.min(1, t)); else if (mode === 'ray') t = Math.max(0, t); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  C._hitDraw = function (x, y, touch) {
    const tol = touch ? 16 : 9, list = (this.d.draws || []).filter(q => !q.hidden && !this.d.hideDraw).reverse();
    for (const dr of list) {
      const g = this._geo(dr), H = this._handles(dr, g);
      if (!dr.locked) for (const h of H) if (Math.hypot(x - h.x, y - h.y) <= tol + 4) return { d: dr, part: h.k };
      if (this._bodyHit(dr, g, x, y, tol)) return { d: dr, part: 'body' };
    }
    return null;
  };
  C._bodyHit = function (dr, g, x, y, tol) {
    const { xa, ya, xb, yb } = g, t = dr.type, R = this.W - this.pad.right;
    const inB = (x1, y1, x2, y2) => x >= Math.min(x1, x2) - tol && x <= Math.max(x1, x2) + tol && y >= Math.min(y1, y2) - tol && y <= Math.max(y1, y2) + tol;
    switch (t) {
      case 'trend': case 'arrow': return segD(x, y, xa, ya, xb, yb, 'seg') <= tol;
      case 'ray': return segD(x, y, xa, ya, xb, yb, 'ray') <= tol;
      case 'extline': return segD(x, y, xa, ya, xb, yb, 'inf') <= tol;
      case 'rect': case 'prange': return inB(xa, ya, xb, yb);
      case 'ellipse': { const cx = (xa + xb) / 2, cy = (ya + yb) / 2, rx = Math.abs(xb - xa) / 2 + tol, ry = Math.abs(yb - ya) / 2 + tol; return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
      case 'tri': { const P = [[xa, ya], [xb, yb], [g.xc, g.yc]]; for (let i = 0; i < 3; i++) { const p = P[i], q = P[(i + 1) % 3]; if (segD(x, y, p[0], p[1], q[0], q[1], 'seg') <= tol) return true; } const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]), me = [x, y], d1 = s(me, P[0], P[1]), d2 = s(me, P[1], P[2]), d3 = s(me, P[2], P[0]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }
      case 'channel': { const dy = g.yc - ya; if (segD(x, y, xa, ya, xb, yb, 'seg') <= tol || segD(x, y, xa, ya + dy, xb, yb + dy, 'seg') <= tol) return true; if (x < Math.min(xa, xb) || x > Math.max(xa, xb) || xb === xa) return false; const l1 = ya + (yb - ya) * (x - xa) / (xb - xa), l2 = l1 + dy; return y >= Math.min(l1, l2) && y <= Math.max(l1, l2); }
      case 'fib': { if (x < Math.min(xa, xb) - tol) return false; return FIB.some(r => Math.abs(y - this.yAt(dr.a.p + (dr.b.p - dr.a.p) * r)) <= tol) || segD(x, y, xa, ya, xb, yb, 'seg') <= tol; }
      case 'fibext': { if (x < Math.min(g.xc, xb) - tol) return false; return FIBX.some(r => Math.abs(y - this.yAt(dr.c.p + (dr.b.p - dr.a.p) * r)) <= tol) || segD(x, y, xa, ya, xb, yb, 'seg') <= tol || segD(x, y, xb, yb, g.xc, g.yc, 'seg') <= tol; }
      case 'vline': return Math.abs(x - xa) <= tol;
      case 'hray': return Math.abs(y - ya) <= tol && x >= xa - tol;
      case 'brush': { const p = dr.pts || []; for (let i = 1; i < p.length; i++) { const x1 = this.xAtIdx(this.idxOfTime(p[i - 1].t)), y1 = this.yAt(p[i - 1].p), x2 = this.xAtIdx(this.idxOfTime(p[i].t)), y2 = this.yAt(p[i].p); if (segD(x, y, x1, y1, x2, y2, 'seg') <= tol) return true; } return false; }
      case 'text': { const b = dr._bb; return !!b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4; }
      case 'mkup': case 'mkdn': return Math.hypot(x - xa, y - ya - (t === 'mkup' ? 12 : -12)) <= 16;
      case 'longpos': case 'shortpos': return x >= xa - tol && x <= xb + tol && y >= Math.min(g.ytp, g.ysl, ya) - tol && y <= Math.max(g.ytp, g.ysl, ya) + tol;
    }
    return false;
  };

  /* ---------- creating / dragging ---------- */
  C._newDraft = function (type, a) {
    const d = { id: 'draft', type, a, b: a, color: N.drawColor(type), width: N.sty('draw').w };
    if (type === 'brush') d.pts = [a];
    if (isPos(d)) { d.tp = a.p; d.sl = a.p; d.qty = 1; }
    return d;
  };
  C._posFromDrag = function (dr) {
    const dp = Math.abs(dr.b.p - dr.a.p) || 0, s = dr.type === 'longpos' ? 1 : -1;
    dr.tp = dr.a.p + s * dp; dr.sl = dr.a.p - s * dp / 2;
  };
  // fill in the extra anchor / defaults a freshly drawn shape needs
  C._finishDraft = function (dr) {
    const rng = this.hi - this.lo || 1, ia = this.idxOfTime(dr.a.t), ib = dr.b ? this.idxOfTime(dr.b.t) : ia;
    if (dr.type === 'channel') dr.off = -rng * 0.12;
    else if (dr.type === 'tri') dr.c = { t: this.timeAt(Math.round((ia + ib) / 2)), p: dr.a.p + (dr.a.p - dr.b.p) * 0.9 };
    else if (dr.type === 'fibext') dr.c = { t: this.timeAt(Math.max(0, ib + Math.max(2, Math.round((ib - ia) * 0.35)))), p: dr.b.p - (dr.b.p - dr.a.p) * 0.45 };
    else if (dr.type === 'vline' || dr.type === 'hray' || dr.type === 'text' || dr.type === 'mkup' || dr.type === 'mkdn') dr.b = dr.a;
    else if (dr.type === 'brush') { dr.a = dr.pts[0]; dr.b = dr.pts[dr.pts.length - 1]; }
    else if (isPos(dr)) {
      const g = this._geo(dr), tiny = Math.hypot(g.xb - g.xa, (this.yAt(dr.tp) - this.yAt(dr.a.p))) < 10;
      if (tiny && this.hooks.posDefaults) this.hooks.posDefaults(dr, this);
      else if (tiny) { const p = dr.a.p * 0.01; dr.tp = dr.a.p + (dr.type === 'longpos' ? p : -p); dr.sl = dr.a.p - (dr.type === 'longpos' ? p : -p) / 2; }
      if (this.idxOfTime(dr.b.t) <= ia + 1) dr.b = { t: this.timeAt(ia + 24), p: dr.a.p };
      dr.b = { t: dr.b.t, p: dr.a.p };
    }
  };
  C._snapDrag = function (d) {
    const q = { a: { t: d.a.t, p: d.a.p }, ia: this.idxOfTime(d.a.t) };
    if (d.b) { q.b = { t: d.b.t, p: d.b.p }; q.ib = this.idxOfTime(d.b.t); }
    if (d.c) { q.c = { t: d.c.t, p: d.c.p }; q.ic = this.idxOfTime(d.c.t); }
    if (d.pts) { q.pts = d.pts.map(p => ({ t: p.t, p: p.p })); q.ipts = d.pts.map(p => this.idxOfTime(p.t)); }
    q.tp = d.tp; q.sl = d.sl; q.off = d.off; return q;
  };
  C._applyDrag = function (q, x, y) {
    const d = q.d, s = q.s, part = q.part, di = Math.round((x - q.x0) / this.slot), dp = this.priceAtY(y) - this.priceAtY(q.y0);
    const mv = (i, p) => ({ t: this.timeAt(Math.max(0, i)), p }), pos = isPos(d), ia = this.idxOfTime(d.a.t);
    if (part === 'body' || (pos && part === 'a')) {
      const noP = d.type === 'vline';
      d.a = mv(s.ia + di, noP ? s.a.p : s.a.p + dp);
      if (s.b) d.b = noP ? d.a : mv(s.ib + di, s.b.p + dp);
      if (s.c) d.c = mv(s.ic + di, s.c.p + dp);
      if (s.pts) d.pts = s.pts.map((p, i) => mv(s.ipts[i] + di, p.p + dp));
      if (pos) { d.tp = s.tp + dp; d.sl = s.sl + dp; d.b = { t: d.b.t, p: d.a.p }; }
      return;
    }
    const pt = this._pt(x, y), rp = N.cfg.snapTicks ? N.roundTick(this.priceAtY(y)) : this.priceAtY(y);
    if (pos) {
      const long = d.type === 'longpos';
      if (part === 'b') d.b = { t: this.timeAt(Math.max(ia + 2, Math.round(this.idxAtX(x)))), p: d.a.p };
      else if (part === 'tp') d.tp = long ? Math.max(rp, d.a.p + N.TICK) : Math.min(rp, d.a.p - N.TICK);
      else if (part === 'sl') d.sl = long ? Math.min(rp, d.a.p - N.TICK) : Math.max(rp, d.a.p + N.TICK);
      return;
    }
    if (part === 'a') d.a = pt; else if (part === 'b') d.b = pt;
    else if (part === 'c') { if (d.type === 'channel') d.off = this.priceAtY(y) - d.a.p; else d.c = pt; }
    if (d.type === 'vline' || d.type === 'hray') d.b = d.a;
  };

  /* ---------- outcome of a position drawn on past candles ---------- */
  C._posOutcome = function (dr) {
    const cs = this.d.candles, n = cs.length, long = dr.type === 'longpos', ia = this.idxOfTime(dr.a.t), ib = Math.min(n - 1, this.idxOfTime(dr.b.t)); let res = null;
    if (ia < n - 1) for (let i = ia + 1; i <= ib; i++) { const b = cs[i], sl = long ? b.low <= dr.sl : b.high >= dr.sl, tp = long ? b.high >= dr.tp : b.low <= dr.tp; if (sl) { res = { k: 'SL', i }; break; } if (tp) { res = { k: 'TP', i }; break; } }
    return { res, ia, last: ia < n ? Math.min(ib, n - 1) : -1 };
  };

  /* ---------- rendering ---------- */
  C._drawOne = function (ctx, dr, X, Y, slot, W, font, fs, sel) {
    if (dr.id === 'draft' && (dr.type === 'tri' || dr.type === 'fibext') && !dr.c) { dr = Object.assign({}, dr); this._finishDraft(dr); }
    const pad = this.pad, col = dr.color || '#f59e0b', lw = dr.width || 1.6, R = W - pad.right, top = pad.top, bot = pad.top + this.plotH, T = dr.type;
    const ix = t => X(this.idxOfTime(t)), xa = ix(dr.a.t), ya = Y(dr.a.p), xb = dr.b ? ix(dr.b.t) : xa, yb = dr.b ? Y(dr.b.p) : ya;
    const dash = dr.dash === 'dashed' ? [6, 4] : dr.dash === 'dotted' ? [2, 3] : [], fa = dr.fillA != null ? dr.fillA : 0.14;
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash);
    let hd = null;
    if (T === 'trend') line(xa, ya, xb, yb);
    else if (T === 'ray' || T === 'extline') {
      if (Math.abs(xb - xa) < 0.5) line(xa, ya, xb, yb);
      else { const k = (yb - ya) / (xb - xa), xr = R + 60, xl = pad.left - 60, x1 = T === 'ray' ? xa : xl, x2 = xb > xa ? xr : (T === 'ray' ? xl : xr); line(x1, ya + k * (x1 - xa), x2, ya + k * (x2 - xa)); }
    } else if (T === 'arrow') {
      line(xa, ya, xb, yb); const an = Math.atan2(yb - ya, xb - xa), hl = 10 + lw * 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xb - hl * Math.cos(an - 0.45), yb - hl * Math.sin(an - 0.45)); ctx.lineTo(xb - hl * Math.cos(an + 0.45), yb - hl * Math.sin(an + 0.45)); ctx.closePath(); ctx.fill();
    } else if (T === 'hray') { line(xa, ya, R + 50, ya); }
    else if (T === 'vline') { if (!dash.length) ctx.setLineDash([5, 4]); line(Math.round(xa) + .5, top, Math.round(xa) + .5, bot); }
    else if (T === 'rect') { ctx.globalAlpha = fa; ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); ctx.globalAlpha = 1; ctx.strokeRect(Math.min(xa, xb) + .5, Math.min(ya, yb) + .5, Math.abs(xb - xa), Math.abs(yb - ya)); }
    else if (T === 'ellipse') { ctx.beginPath(); ctx.ellipse((xa + xb) / 2, (ya + yb) / 2, Math.max(1, Math.abs(xb - xa) / 2), Math.max(1, Math.abs(yb - ya) / 2), 0, 0, 7); ctx.globalAlpha = fa; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); }
    else if (T === 'tri') { const xc = ix(dr.c.t), yc = Y(dr.c.p); ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xc, yc); ctx.closePath(); ctx.globalAlpha = fa; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); }
    else if (T === 'channel') {
      const dy = Y(dr.a.p + (dr.off || 0)) - ya; ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xb, yb + dy); ctx.lineTo(xa, ya + dy); ctx.closePath(); ctx.globalAlpha = fa; ctx.fill(); ctx.globalAlpha = 1;
      line(xa, ya, xb, yb); line(xa, ya + dy, xb, yb + dy); ctx.globalAlpha = .55; ctx.setLineDash([4, 4]); line(xa, ya + dy / 2, xb, yb + dy / 2); ctx.globalAlpha = 1;
    } else if (T === 'brush') { const p = dr.pts || []; ctx.beginPath(); p.forEach((q, i) => { const x = ix(q.t), y = Y(q.p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    else if (T === 'fib') {
      const x0 = Math.min(xa, xb); ctx.font = font(fs - 1, '600'); ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; const yv = r => Y(dr.a.p + (dr.b.p - dr.a.p) * r);
      ctx.globalAlpha = .13; ctx.fillRect(x0, Math.min(yv(.5), yv(.618)), R - x0, Math.abs(yv(.618) - yv(.5))); ctx.globalAlpha = 1;
      FIB.forEach(r => { const y = Math.round(yv(r)) + .5; ctx.globalAlpha = r === 0 || r === 1 ? 1 : .7; line(x0, y, R, y); ctx.globalAlpha = 1; ctx.fillText(r + '  (' + (dr.a.p + (dr.b.p - dr.a.p) * r).toFixed(2) + ')', x0 + 4, y - 2); });
      ctx.setLineDash([3, 3]); ctx.globalAlpha = .6; line(xa, ya, xb, yb); ctx.globalAlpha = 1;
    } else if (T === 'fibext') {
      const xc = ix(dr.c.t), yc = Y(dr.c.p), x0 = Math.min(xc, xb); ctx.font = font(fs - 1, '600'); ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; const yv = r => Y(dr.c.p + (dr.b.p - dr.a.p) * r);
      FIBX.forEach(r => { const y = Math.round(yv(r)) + .5; ctx.globalAlpha = r === 0 || r === 1 ? 1 : .7; line(x0, y, R, y); ctx.globalAlpha = 1; ctx.fillText(r + '  (' + (dr.c.p + (dr.b.p - dr.a.p) * r).toFixed(2) + ')', x0 + 4, y - 2); });
      ctx.setLineDash([3, 3]); ctx.globalAlpha = .6; line(xa, ya, xb, yb); line(xb, yb, xc, yc); ctx.globalAlpha = 1;
    } else if (T === 'text') {
      const sz = dr.size || fs + 3, txt = dr.text || 'Text'; ctx.font = font(sz, '600'); const w = ctx.measureText(txt).width + 14, h = sz + 12, bx = xa - 4, by = ya - h / 2;
      dr._bb = { x: bx, y: by, w, h }; ctx.globalAlpha = .9; ctx.fillStyle = this.colors.tag; rrect(ctx, bx, by, w, h, 6); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 7, by + h / 2 + .5);
    } else if (T === 'mkup' || T === 'mkdn') {
      const up = T === 'mkup', s = 11 + lw * 1.5, yy = ya + (up ? 3 : -3); ctx.setLineDash([]); ctx.beginPath();
      if (up) { ctx.moveTo(xa, yy); ctx.lineTo(xa - s * .75, yy + s * 1.15); ctx.lineTo(xa - s * .28, yy + s * 1.15); ctx.lineTo(xa - s * .28, yy + s * 2); ctx.lineTo(xa + s * .28, yy + s * 2); ctx.lineTo(xa + s * .28, yy + s * 1.15); ctx.lineTo(xa + s * .75, yy + s * 1.15); }
      else { ctx.moveTo(xa, yy); ctx.lineTo(xa - s * .75, yy - s * 1.15); ctx.lineTo(xa - s * .28, yy - s * 1.15); ctx.lineTo(xa - s * .28, yy - s * 2); ctx.lineTo(xa + s * .28, yy - s * 2); ctx.lineTo(xa + s * .28, yy - s * 1.15); ctx.lineTo(xa + s * .75, yy - s * 1.15); }
      ctx.closePath(); ctx.fill();
      if (dr.text) { ctx.font = font(fs - 1, '700'); ctx.textAlign = 'center'; ctx.textBaseline = up ? 'top' : 'bottom'; ctx.fillText(dr.text, xa, up ? yy + s * 2 + 3 : yy - s * 2 - 3); }
    } else if (T === 'prange') {
      const up = dr.b.p >= dr.a.p, c2 = up ? '#2962ff' : '#ef5350'; ctx.strokeStyle = c2; ctx.fillStyle = c2; ctx.globalAlpha = .16; ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); ctx.globalAlpha = 1;
      ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(xa, xb) + .5, Math.min(ya, yb) + .5, Math.abs(xb - xa), Math.abs(yb - ya)); ctx.setLineDash([]);
      const dp = dr.b.p - dr.a.p, bars = Math.round(this.idxOfTime(dr.b.t) - this.idxOfTime(dr.a.t)), sec = Math.abs(dr.b.t - dr.a.t);
      const txt = (dp >= 0 ? '+' : '') + dp.toFixed(2) + ' (' + (dp / dr.a.p * 100).toFixed(2) + '%) · ' + Math.abs(bars) + ' bars' + (N.isIntraday(this.d.tf) ? ' · ' + N.dur(sec) : '');
      ctx.font = font(fs, '700'); const tw = ctx.measureText(txt).width + 16, cx = clamp((xa + xb) / 2 - tw / 2, pad.left + 4, R - tw - 4), cy = clamp(Math.min(ya, yb) - 28, top + 4, bot - 24);
      ctx.fillStyle = c2; rrect(ctx, cx, cy, tw, 22, 5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx + 8, cy + 11.5);
    } else if (isPos(dr)) this._drawPos(ctx, dr, X, Y, font, fs, xa, ya, xb);
    // selection handles
    if (sel) {
      const g = this._geo(dr), H = this._handles(dr, g); ctx.setLineDash([]); ctx.lineWidth = 1.6; ctx.strokeStyle = col;
      H.forEach(h => { ctx.fillStyle = this.colors.bg; ctx.beginPath(); ctx.arc(h.x, h.y, 5.2, 0, 7); ctx.fill(); ctx.stroke(); });
      if (dr.locked) { ctx.fillStyle = col; ctx.font = font(fs, '700'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('🔒', g.xa + 8, g.ya - 12); }
    }
    ctx.restore();
  };
  C._drawPos = function (ctx, dr, X, Y, font, fs, xa, ya, xbRaw) {
    const long = dr.type === 'longpos', ytp = Y(dr.tp), ysl = Y(dr.sl), x0 = xa, x1 = Math.max(xbRaw, xa + 24), tpS = N.sty('posTp').c, slS = N.sty('posSl').c;
    const qty = dr.qty || 1, risk = Math.abs(dr.a.p - dr.sl), rew = Math.abs(dr.tp - dr.a.p), rr = risk > 0 ? rew / risk : 0, ep = dr.a.p;
    ctx.setLineDash([]); ctx.globalAlpha = .2; ctx.fillStyle = tpS; ctx.fillRect(x0, Math.min(ya, ytp), x1 - x0, Math.abs(ytp - ya)); ctx.fillStyle = slS; ctx.fillRect(x0, Math.min(ya, ysl), x1 - x0, Math.abs(ysl - ya)); ctx.globalAlpha = 1;
    ctx.lineWidth = dr.width || 1.4; ctx.strokeStyle = tpS; ctx.beginPath(); ctx.moveTo(x0, Math.round(ytp) + .5); ctx.lineTo(x1, Math.round(ytp) + .5); ctx.stroke();
    ctx.strokeStyle = slS; ctx.beginPath(); ctx.moveTo(x0, Math.round(ysl) + .5); ctx.lineTo(x1, Math.round(ysl) + .5); ctx.stroke();
    ctx.strokeStyle = dr.color || '#94a3b8'; ctx.beginPath(); ctx.moveTo(x0, Math.round(ya) + .5); ctx.lineTo(x1, Math.round(ya) + .5); ctx.stroke();
    ctx.font = font(fs - 1, '700'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const pc = v => (v / ep * 100).toFixed(2) + '%', tpTxt = 'Target ' + dr.tp.toFixed(2) + '  (' + pc(rew) + ')  ' + N.sgnInr(rew * qty, 0), slTxt = 'Stop ' + dr.sl.toFixed(2) + '  (' + pc(risk) + ')  ' + N.sgnInr(-risk * qty, 0);
    const lab = (txt, yEdge, towardsInside, c) => { const w = ctx.measureText(txt).width; if (x1 - x0 < w + 14 && x1 - x0 < 60) return; ctx.fillStyle = c; ctx.fillText(txt, x0 + 7, yEdge + towardsInside * 10); };
    lab(tpTxt, ytp, ytp < ya ? 1 : -1, tpS); lab(slTxt, ysl, ysl < ya ? 1 : -1, slS);
    const { res, ia, last } = this._posOutcome(dr);
    // centre pill on the entry line
    let mid = 'R:R ' + rr.toFixed(2) + '  ·  Qty ' + qty; const cs = this.d.candles;
    if (res) mid += res.k === 'TP' ? '  ·  ✔ TARGET HIT' : '  ·  ✖ STOP HIT';
    else if (last > ia && cs[last]) { const pnl = (cs[last].close - ep) * (long ? 1 : -1) * qty; mid += '  ·  P&L ' + N.sgnInr(pnl, 0) + ' (' + ((cs[last].close - ep) * (long ? 1 : -1) / (risk || 1)).toFixed(1) + 'R)'; }
    ctx.font = font(fs, '700'); const tw = ctx.measureText(mid).width + 16, px = clamp(x0 + (x1 - x0) / 2 - tw / 2, this.pad.left + 2, this.W - this.pad.right - tw - 2);
    ctx.fillStyle = res ? (res.k === 'TP' ? tpS : slS) : 'rgba(30,34,45,.92)'; rrect(ctx, px, ya - 10, tw, 20, 5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(mid, px + 8, ya + .5);
    if (res) { const hx = X(res.i); ctx.strokeStyle = res.k === 'TP' ? tpS : slS; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, Math.min(ya, ytp, ysl) - 2); ctx.lineTo(hx, Math.max(ya, ytp, ysl) + 2); ctx.stroke(); ctx.fillStyle = res.k === 'TP' ? tpS : slS; ctx.beginPath(); ctx.arc(hx, res.k === 'TP' ? ytp : ysl, 4.5, 0, 7); ctx.fill(); }
  };
})(window.NTI);
