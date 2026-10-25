/* NerdyTradeIntuition — canvas chart engine (no libraries) */
(function (N) {
  'use strict';
  const clamp = N.clamp;
  function niceStep(raw) { const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function valAt(vals, t) { if (!vals || !vals.length) return null; let lo = 0, hi = vals.length - 1; if (t < vals[0].time) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (vals[m].time <= t) lo = m; else hi = m - 1; } return vals[lo].time === t ? vals[lo].value : null; }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  class Chart {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.d = { candles: [], overlays: [], lines: [], zones: [], sub: { mode: 'none' }, maxEndFloat: 0, tf: 5 };
      this.colors = { bg: '#0f131c', grid: '#1f2433', axis: '#2a2e39', text: '#d1d4dc', dim: '#7d8695', up: '#26a69a', down: '#ef5350', cross: '#9aa1b2', tag: '#1b2030', accent: '#2962ff' };
      this.viewCount = 100; this.followLatest = true; this.viewEndFloat = 0;
      this.autoY = true; this.manualLo = null; this.manualHi = null;
      this.hoverX = null; this.hoverY = null; this.tool = 'cursor'; this.measure = null;
      this.pad = { top: 8, right: 66, bottom: 24, left: 4 };
      this.hooks = {}; this._pills = []; this.draggingLine = null; this.hoverLine = null; this.dragPrice = null;
      this._raf = 0;
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
      this._bind(); this.resize();
    }
    setData(d) { this.d = d; }
    _isDrag(l) { return !!(this.draggingLine && l.id !== undefined && this.draggingLine.id === l.id); }
    setTool(t) { this.tool = t; this.measure = null; this.canvas.style.cursor = 'crosshair'; this.render(); }
    requestRender() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }
    resetView() { this.followLatest = true; this.autoY = true; this.manualLo = this.manualHi = null; this.hooks.onFollow && this.hooks.onFollow(true); }
    resetPrice() { this.autoY = true; this.manualLo = this.manualHi = null; this.requestRender(); }
    resize() {
      const dpr = window.devicePixelRatio || 1, r = this.canvas.parentElement.getBoundingClientRect();
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.render();
    }
    priceAtY(y) { if (this.lo == null) return null; return this.lo + (1 - (y - this.pad.top) / this.plotH) * (this.hi - this.lo); }
    yAt(p) { return this.pad.top + (1 - (p - this.lo) / (this.hi - this.lo)) * this.plotH; }
    idxAtX(x) { return (x - this.pad.left) / this.slot + (this.endFloat - this.count) - 0.5; }
    xAtIdx(i) { return this.pad.left + (i - (this.endFloat - this.count)) * this.slot + this.slot / 2; }

    _hitLine(x, y, touch) {
      if (x < this.pad.left || x > this.W - this.pad.right) return null;
      let best = null, bd = touch ? 16 : 7;
      for (const l of this.d.lines) { if (!l.draggable) continue; const yy = this.yAt(l.price); const dd = Math.abs(y - yy); if (dd <= bd) { bd = dd; best = l; } }
      return best;
    }
    _hitDelete(x, y) { for (const p of this._pills) if (p.del && x >= p.dx && x <= p.dx + p.dw && y >= p.y && y <= p.y + p.h) return p.line; return null; }

    _bind() {
      const cv = this.canvas, ptrs = new Map();
      let mode = null, sx = 0, sy = 0, sEnd = 0, bLo = 0, bHi = 1, ppp = 1, bCount = 100, bSlot = 10, pinchD = 0, pinchC = 100, movedY = false;
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) { this._panBars(e.deltaX / this.slot); return; }
        const f = e.deltaY > 0 ? 1.1 : 0.9, rect = cv.getBoundingClientRect(), x = e.clientX - rect.left;
        const n = this.d.candles.length, old = this.viewCount;
        const nc = clamp(old * f, 12, Math.max(12, n));
        if (!this.followLatest) { const anchor = this.idxAtX(x); const frac = (x - this.pad.left) / this.plotW; this.viewCount = nc; this.viewEndFloat = anchor + 0.5 + (1 - frac) * nc; }
        else this.viewCount = nc;
        this.render();
      }, { passive: false });
      cv.addEventListener('mousemove', e => {
        const r = cv.getBoundingClientRect(); this.hoverX = e.clientX - r.left; this.hoverY = e.clientY - r.top;
        if (!mode) {
          const h = this._hitLine(this.hoverX, this.hoverY, false); this.hoverLine = h;
          const dl = this._hitDelete(this.hoverX, this.hoverY);
          cv.style.cursor = dl ? 'pointer' : h ? 'ns-resize' : 'crosshair';
        }
        if (N.cfg.showCrosshair || this.tool === 'measure') this.requestRender();
      });
      cv.addEventListener('mouseleave', () => { this.hoverX = null; this.hoverLine = null; this.requestRender(); });
      cv.addEventListener('pointerdown', e => {
        cv.setPointerCapture(e.pointerId);
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, touch = e.pointerType === 'touch';
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touch) { this.hoverX = x; this.hoverY = y; }
        if (ptrs.size === 1) {
          const del = this._hitDelete(x, y); if (del) { mode = 'none'; this.hooks.onLineDelete && this.hooks.onLineDelete(del); return; }
          const inPlot = x >= this.pad.left && x <= this.W - this.pad.right && y >= this.pad.top && y <= this.pad.top + this.plotH;
          const hit = this._hitLine(x, y, touch);
          if (hit) { mode = 'dragline'; this.draggingLine = hit; this.dragPrice = hit.price; cv.style.cursor = 'ns-resize'; this.hooks.onLineGrab && this.hooks.onLineGrab(hit); this.render(); return; }
          if (this.tool === 'hline' && inPlot) { mode = 'none'; this.hooks.onHline && this.hooks.onHline(this.priceAtY(y)); return; }
          if (this.tool === 'measure' && inPlot) { mode = 'measure'; const a = { i: this.idxAtX(x), p: this.priceAtY(y) }; this.measure = { a, b: a, done: false }; this.render(); return; }
          mode = x > this.W - this.pad.right ? 'price' : (y > this.H - this.pad.bottom ? 'time' : 'pan');
          sx = e.clientX; sy = e.clientY; movedY = false;
          sEnd = this.followLatest ? this.d.maxEndFloat + this.viewCount * N.cfg.rightBars : this.viewEndFloat;
          bLo = this.lo != null ? this.lo : 0; bHi = this.hi != null ? this.hi : 1; ppp = this.plotH / (bHi - bLo || 1); bCount = this.viewCount; bSlot = this.slot || 10;
        } else if (ptrs.size === 2) {
          mode = 'pinch'; const p = [...ptrs.values()]; pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1; pinchC = this.viewCount;
        }
      });
      cv.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (mode === 'pinch' && ptrs.size === 2) {
          const p = [...ptrs.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
          this.viewCount = clamp(pinchC * pinchD / d, 12, Math.max(12, this.d.candles.length)); this.render(); return;
        }
        if (ptrs.size !== 1) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (e.pointerType === 'touch') { this.hoverX = x; this.hoverY = y; }
        if (mode === 'dragline') { const p = this.priceAtY(y); this.dragPrice = p; this.hooks.onLineDrag && this.hooks.onLineDrag(this.draggingLine, p); this.render(); return; }
        if (mode === 'measure') { this.measure.b = { i: this.idxAtX(x), p: this.priceAtY(y) }; this.render(); return; }
        if (mode === 'pan') {
          this.followLatest = false; this.hooks.onFollow && this.hooks.onFollow(false);
          this.viewEndFloat = clamp(sEnd - dx / bSlot, 8, this.d.maxEndFloat + this.viewCount * 0.9);
          if (movedY || Math.abs(dy) > 8) { movedY = true; const sh = dy / ppp; this.manualLo = bLo + sh; this.manualHi = bHi + sh; this.autoY = false; }
          this.render();
        } else if (mode === 'price') {
          const mid = (bLo + bHi) / 2, half = (bHi - bLo) / 2, nh = clamp(half * Math.exp(dy * 0.006), half * 0.15, half * 8);
          this.manualLo = mid - nh; this.manualHi = mid + nh; this.autoY = false; this.render();
        } else if (mode === 'time') { this.viewCount = clamp(bCount * Math.exp(-dx * 0.006), 12, Math.max(12, this.d.candles.length)); this.render(); }
      });
      const end = e => {
        if (mode === 'dragline' && this.draggingLine) {
          const r = cv.getBoundingClientRect(), p = this.priceAtY(e.clientY - r.top);
          const l = this.draggingLine; this.draggingLine = null; this.dragPrice = null;
          this.hooks.onLineDrop && this.hooks.onLineDrop(l, p); cv.style.cursor = 'crosshair';
        }
        if (mode === 'measure' && this.measure) { this.measure.done = true; }
        ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; if (ptrs.size === 0) { mode = null; if (e.pointerType === 'touch') { this.hoverX = null; this.render(); } }
      };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('dblclick', () => this.resetView());
      cv.addEventListener('contextmenu', e => e.preventDefault());
    }
    _panBars(db) { this.followLatest = false; this.hooks.onFollow && this.hooks.onFollow(false); this.viewEndFloat = clamp((this.followLatest ? this.d.maxEndFloat : this.viewEndFloat) + db, 8, this.d.maxEndFloat + this.viewCount * 0.9); this.render(); }

    _ha(candles, s, e) {
      const out = []; let po = null, pc = null; const from = Math.max(0, s - 40);
      for (let i = from; i < e; i++) {
        const b = candles[i], c = (b.open + b.high + b.low + b.close) / 4, o = po === null ? (b.open + b.close) / 2 : (po + pc) / 2;
        const o2 = { time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c, volume: b.volume, sessionIndex: b.sessionIndex };
        po = o; pc = c; if (i >= s) out.push(o2);
      }
      return out;
    }

    render() {
      const ctx = this.ctx, c = this.colors, cf = N.cfg, d = this.d, W = this.W, H = this.H, pad = this.pad;
      const fs = cf.fontSize || 11, font = (px, w) => (w || '') + ' ' + px + 'px -apple-system,"Segoe UI",Inter,Roboto,system-ui,sans-serif';
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = cf.chartBg || c.bg; ctx.fillRect(0, 0, W, H);
      const cs = d.candles, n = cs.length; this._pills = [];
      if (!n) return;
      const sub = d.sub || { mode: 'none' }, showSub = sub.mode && sub.mode !== 'none';
      const subH = showSub ? Math.max(60, Math.round(H * 0.2)) : 0, subGap = showSub ? 10 : 0;
      const plotW = Math.max(1, W - pad.left - pad.right), plotH = Math.max(1, H - pad.top - pad.bottom - subH - subGap);
      const subTop = pad.top + plotH + subGap;
      this.plotW = plotW; this.plotH = plotH;
      const count = clamp(this.viewCount, 12, Math.max(12, n)); this.viewCount = count;
      const liveEnd = d.maxEndFloat + count * cf.rightBars;
      const endFloat = this.followLatest ? liveEnd : clamp(this.viewEndFloat, 8, d.maxEndFloat + count * 0.9);
      this.viewEndFloat = endFloat; this.endFloat = endFloat; this.count = count;
      const slot = plotW / count; this.slot = slot;
      const startIdx = Math.max(0, Math.floor(endFloat - count)), endIdx = Math.min(n, Math.ceil(endFloat) + 1);
      const raw = cs.slice(startIdx, endIdx), vis = d.style === 'heikinashi' ? this._ha(cs, startIdx, endIdx) : raw;
      const X = i => pad.left + (i - (endFloat - count)) * slot + slot / 2;
      const firstT = vis.length ? vis[0].time : 0, lastT = vis.length ? vis[vis.length - 1].time : 0;

      // price range
      let lo, hi;
      if (this.autoY || this.manualLo == null) {
        lo = Infinity; hi = -Infinity;
        for (const b of vis) { if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high; }
        for (const o of d.overlays) { const v = o.vals; for (let k = v.length - 1; k >= 0 && v[k].time >= firstT; k--) { if (v[k].time > lastT) continue; if (v[k].value < lo) lo = v[k].value; if (v[k].value > hi) hi = v[k].value; } }
        for (const l of d.lines) if (l.autoscale) { if (l.price < lo) lo = l.price; if (l.price > hi) hi = l.price; }
        if (!isFinite(lo) || lo === hi) { lo = (lo || 0) - 1; hi = (hi || 1) + 1; }
        const rg = hi - lo; lo -= rg * 0.07; hi += rg * 0.09;
      } else { lo = this.manualLo; hi = this.manualHi; }
      this.lo = lo; this.hi = hi;
      const Y = p => pad.top + (1 - (p - lo) / (hi - lo)) * plotH;

      // session breaks
      if (cf.showSessionBreaks && N.isIntraday(d.tf)) {
        ctx.strokeStyle = c.axis; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath();
        for (let i = 0; i < vis.length; i++) {
          const gi = startIdx + i, prev = i === 0 ? cs[gi - 1] : vis[i - 1];
          if (prev && prev.sessionIndex !== vis[i].sessionIndex) { const x = Math.round(X(gi) - slot / 2) + .5; if (x > pad.left && x < W - pad.right) { ctx.moveTo(x, pad.top); ctx.lineTo(x, subTop + subH); } }
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // zones
      for (const z of d.zones) { const a = Y(z.from), b = Y(z.to); ctx.fillStyle = z.color; ctx.fillRect(pad.left, Math.min(a, b), plotW, Math.max(1, Math.abs(b - a))); }

      // grid + price axis
      const step = niceStep((hi - lo) / Math.max(3, plotH / 58));
      ctx.font = font(fs); ctx.textBaseline = 'middle';
      const gm = cf.gridMode, ga = cf.gridAlpha;
      ctx.globalAlpha = ga;
      if (gm === 'both' || gm === 'h') {
        ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath();
        for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) { const y = Math.round(Y(p)) + .5; ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); }
        ctx.stroke();
      }
      const everyN = Math.max(1, Math.ceil(84 / slot));
      if (gm === 'both' || gm === 'v') {
        ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < vis.length; i++) { const gi = startIdx + i; if (gi % everyN !== 0) continue; const x = Math.round(X(gi)) + .5; ctx.moveTo(x, pad.top); ctx.lineTo(x, subTop + subH); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.dim; ctx.textAlign = 'left';
      for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) { const y = Y(p); if (y > pad.top + 6 && y < pad.top + plotH - 6) ctx.fillText(p.toFixed(step < 1 ? 2 : (step < 10 ? 1 : 0)), W - pad.right + 7, y); }
      // axis line
      ctx.strokeStyle = c.axis; ctx.beginPath(); ctx.moveTo(W - pad.right + .5, pad.top); ctx.lineTo(W - pad.right + .5, subTop + subH); ctx.moveTo(pad.left, H - pad.bottom + .5); ctx.lineTo(W - pad.right, H - pad.bottom + .5); ctx.stroke();
      // time labels
      ctx.fillStyle = c.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < vis.length; i++) { const gi = startIdx + i; if (gi % everyN !== 0) continue; const x = X(gi); if (x > pad.left + 16 && x < W - pad.right - 16) ctx.fillText(N.fmtAxis(vis[i].time, d.tf), x, H - pad.bottom + 6); }

      // candles
      const bw = Math.max(1, slot * cf.bodyRatio), style = d.style || 'candle';
      const upC = cf.upColor, dnC = cf.downColor, hollow = style === 'hollow' || cf.hollowUp;
      ctx.save(); ctx.beginPath(); ctx.rect(pad.left, pad.top, plotW, plotH); ctx.clip();
      if (style === 'line' || style === 'area') {
        ctx.beginPath(); let first = true, fx = 0, lx = 0;
        for (let i = 0; i < vis.length; i++) { const x = X(startIdx + i), y = Y(vis[i].close); if (first) { ctx.moveTo(x, y); fx = x; first = false; } else ctx.lineTo(x, y); lx = x; }
        if (style === 'area') {
          ctx.save(); ctx.lineTo(lx, pad.top + plotH); ctx.lineTo(fx, pad.top + plotH); ctx.closePath();
          const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH); g.addColorStop(0, upC + '55'); g.addColorStop(1, upC + '05'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
          ctx.beginPath(); first = true; for (let i = 0; i < vis.length; i++) { const x = X(startIdx + i), y = Y(vis[i].close); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
        }
        ctx.strokeStyle = upC; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      } else {
        for (let i = 0; i < vis.length; i++) {
          const b = vis[i], x = X(startIdx + i); if (x < pad.left - slot || x > W - pad.right + slot) continue;
          const up = b.close >= b.open, col = up ? upC : dnC, wick = cf.wick === 'neutral' ? c.dim : col;
          const yH = Y(b.high), yL = Y(b.low), yO = Y(b.open), yC = Y(b.close), top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
          if (style === 'bar') {
            ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, Math.min(2.4, slot * 0.14));
            ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.moveTo(x - bw / 2, yO); ctx.lineTo(x, yO); ctx.moveTo(x, yC); ctx.lineTo(x + bw / 2, yC); ctx.stroke();
          } else {
            const xw = Math.round(x) + .5;
            ctx.strokeStyle = wick; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xw, yH); ctx.lineTo(xw, yL); ctx.stroke();
            const bx = Math.round(x - bw / 2), bww = Math.max(1, Math.round(bw));
            if (up && hollow) { ctx.fillStyle = cf.chartBg || c.bg; ctx.fillRect(bx, top, bww, bh); ctx.strokeStyle = col; ctx.lineWidth = 1; if (bww > 2) ctx.strokeRect(bx + .5, top + .5, bww - 1, Math.max(1, bh - 1)); else { ctx.fillStyle = col; ctx.fillRect(bx, top, bww, bh); } }
            else { ctx.fillStyle = col; ctx.fillRect(bx, top, bww, bh); if (cf.borderOn && bww > 3) { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, top + .5, bww - 1, Math.max(1, bh - 1)); } }
          }
        }
      }
      // overlays
      ctx.lineJoin = 'round';
      for (const o of d.overlays) {
        const v = o.vals; if (!v.length) continue;
        ctx.strokeStyle = o.color; ctx.lineWidth = cf.indWidth; ctx.beginPath(); let st = false;
        // find first visible by binary search on time
        let a = 0, b2 = v.length - 1; while (a < b2) { const m = (a + b2) >> 1; if (v[m].time < firstT) a = m + 1; else b2 = m; }
        for (let k = Math.max(0, a - 1); k < v.length; k++) {
          if (v[k].time > lastT) break;
          const gi = this._timeIdx(v[k].time, startIdx, vis); if (gi < 0) continue; const x = X(gi), y = Y(v[k].value);
          const brk = k > 0 && o.breakOnSession && o.session && o.session(v[k].time) !== o.session(v[k - 1].time);
          if (!st || brk) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // lines
      ctx.lineJoin = 'miter'; const usedL = [];
      for (const l of d.lines) {
        const price = (this._isDrag(l) && this.dragPrice != null) ? this.dragPrice : l.price; const y = Y(price);
        if (y < pad.top - 2 || y > pad.top + plotH + 2) continue;
        const hot = this._isDrag(l) || (this.hoverLine && l.id !== undefined && this.hoverLine.id === l.id);
        ctx.strokeStyle = l.color; ctx.lineWidth = (l.width || cf.levelWidth) + (hot ? 0.8 : 0); ctx.setLineDash(l.dashed ? [6, 4] : []);
        ctx.globalAlpha = l.alpha || 1; ctx.beginPath(); ctx.moveTo(pad.left, Math.round(y) + .5); ctx.lineTo(W - pad.right, Math.round(y) + .5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (cf.levelLabels && l.label && !l.pill) { ctx.fillStyle = l.color; ctx.font = font(fs - 1, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; let ly = y - 3; while (usedL.some(u => Math.abs(u - ly) < fs + 1)) ly -= fs + 1; usedL.push(ly); ctx.fillText(l.label, pad.left + 6, ly); }
      }
      ctx.restore();

      // sub panel
      if (showSub) this._drawSub(ctx, sub, vis, startIdx, X, slot, bw, subTop, subH, c, font, fs, firstT, lastT);

      // line axis tags + pills
      ctx.textBaseline = 'middle';
      for (const l of d.lines) {
        const price = (this._isDrag(l) && this.dragPrice != null) ? this.dragPrice : l.price; const y = Y(price);
        if (y < pad.top || y > pad.top + plotH) continue;
        if (l.tag !== false) { ctx.fillStyle = l.color; ctx.fillRect(W - pad.right, y - 8, pad.right - 1, 16); ctx.fillStyle = l.tagText || '#fff'; ctx.font = font(fs - 1, '700'); ctx.textAlign = 'left'; ctx.fillText(price.toFixed(2), W - pad.right + 6, y + .5); }
        if (l.pill) {
          const txt = (this._isDrag(l) && l.dragPill) ? l.dragPill(price) : l.pill;
          ctx.font = font(fs, '700'); const tw = ctx.measureText(txt).width, ph = 20, grip = l.draggable ? 14 : 0, del = l.deletable ? 18 : 0, pw = tw + 16 + grip + del;
          const px = W - pad.right - pw - 10, py = y - ph / 2;
          ctx.fillStyle = l.pillBg || l.color; ctx.globalAlpha = 0.95; rrect(ctx, px, py, pw, ph, 5); ctx.fill(); ctx.globalAlpha = 1;
          if (l.draggable) { ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(px + 6 + a * 4, py + 5.5 + b * 4.5, 1.1, 0, 7); ctx.fill(); } }
          ctx.fillStyle = l.pillText || '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, px + 8 + grip, y + .5);
          if (l.deletable) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6; const cx = px + pw - 12, cy = y; ctx.beginPath(); ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3); ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3); ctx.stroke(); }
          this._pills.push({ line: l, x: px, y: py, w: pw, h: ph, del: !!l.deletable, dx: px + pw - 20, dw: 20 });
        }
      }

      // last price tag + countdown
      const last = vis[vis.length - 1];
      if (last) {
        const prevClose = vis.length > 1 ? vis[vis.length - 2].close : last.open, up = last.close >= prevClose, col = up ? upC : dnC, y = Y(last.close);
        if (y > pad.top - 4 && y < pad.top + plotH + 4) {
          if (cf.showLastLine) { ctx.strokeStyle = col; ctx.globalAlpha = .7; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, Math.round(y) + .5); ctx.lineTo(W - pad.right, Math.round(y) + .5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
          ctx.fillStyle = col; ctx.fillRect(W - pad.right, y - 9, pad.right - 1, 18);
          ctx.fillStyle = '#fff'; ctx.font = font(fs, '700'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(last.close.toFixed(2), W - pad.right + 6, y + .5);
          if (cf.showCountdown && d.countdown) {
            ctx.fillStyle = col; ctx.globalAlpha = .85; ctx.fillRect(W - pad.right, y + 9, pad.right - 1, 15); ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff'; ctx.font = font(fs - 1, '600'); ctx.fillText(d.countdown, W - pad.right + 6, y + 17);
          }
        }
      }

      // measure
      if (this.measure) this._drawMeasure(ctx, X, Y, c, font, fs);

      // crosshair
      let hb = last, hIdx = vis.length - 1;
      if (cf.showCrosshair && this.hoverX != null && this.hoverX >= pad.left && this.hoverX <= W - pad.right && this.hoverY <= H - pad.bottom && vis.length) {
        let gi = Math.round(this.idxAtX(this.hoverX)); gi = clamp(gi, startIdx, startIdx + vis.length - 1); hIdx = gi - startIdx; hb = vis[hIdx];
        const x = Math.round(X(gi)) + .5, hy = clamp(this.hoverY, pad.top, subTop + subH);
        ctx.strokeStyle = c.cross; ctx.lineWidth = 1; ctx.setLineDash(cf.crosshairStyle === 'solid' ? [] : cf.crosshairStyle === 'dotted' ? [1, 3] : [4, 4]); ctx.globalAlpha = .8;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, subTop + subH); ctx.moveTo(pad.left, Math.round(hy) + .5); ctx.lineTo(W - pad.right, Math.round(hy) + .5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (hy <= pad.top + plotH) { const pr = this.priceAtY(hy); ctx.fillStyle = c.tag; ctx.fillRect(W - pad.right, hy - 9, pad.right - 1, 18); ctx.strokeStyle = c.axis; ctx.strokeRect(W - pad.right + .5, hy - 8.5, pad.right - 2, 17); ctx.fillStyle = c.text; ctx.font = font(fs, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(pr.toFixed(2), W - pad.right + 6, hy + .5); }
        const tl = N.fmtFull(hb.time, d.tf); ctx.font = font(fs, '600'); const tw = ctx.measureText(tl).width + 14;
        const tx = clamp(x - tw / 2, pad.left, W - pad.right - tw); ctx.fillStyle = c.tag; ctx.fillRect(tx, H - pad.bottom + 1, tw, 18); ctx.strokeStyle = c.axis; ctx.strokeRect(tx + .5, H - pad.bottom + 1.5, tw - 1, 17);
        ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tl, tx + tw / 2, H - pad.bottom + 10.5);
      }

      // legend
      if (cf.showLegend && hb) {
        const x0 = pad.left + 10; let y0 = pad.top + 10; const bb = d.style === 'heikinashi' ? cs[startIdx + hIdx] || hb : hb;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const prevC = (startIdx + hIdx) > 0 ? cs[startIdx + hIdx - 1].close : bb.open, chg = bb.close - prevC, chp = chg / prevC * 100, col = chg >= 0 ? upC : dnC;
        ctx.font = font(fs + 1, '700'); ctx.fillStyle = c.text; let x = x0; const head = d.symbol + ' · ' + d.tfLabel; ctx.fillText(head, x, y0); x += ctx.measureText(head).width + 14;
        ctx.font = font(fs, '500');
        const parts = [['O', bb.open], ['H', bb.high], ['L', bb.low], ['C', bb.close]];
        for (const [k, v] of parts) { ctx.fillStyle = c.dim; ctx.fillText(k, x, y0); x += ctx.measureText(k).width + 4; ctx.fillStyle = col; const t = v.toFixed(2); ctx.fillText(t, x, y0); x += ctx.measureText(t).width + 9; }
        const ct = (chg >= 0 ? '+' : '') + chg.toFixed(2) + ' (' + (chp >= 0 ? '+' : '') + chp.toFixed(2) + '%)'; ctx.fillStyle = col; ctx.fillText(ct, x, y0); x += ctx.measureText(ct).width + 12;
        ctx.fillStyle = c.dim; ctx.fillText('Vol ' + Math.round(bb.volume || 0).toLocaleString('en-IN'), x, y0);
        y0 += 17; ctx.font = font(fs - 0.5, '600');
        let xx = x0;
        for (const o of d.overlays) { const v = valAt(o.vals, hb.time); if (v == null) continue; const t = o.label + ' ' + v.toFixed(2); ctx.fillStyle = o.color; ctx.fillText(t, xx, y0); xx += ctx.measureText(t).width + 14; }
      }
    }
    _timeIdx(t, startIdx, vis) { // index in candles of the bar with time t (visible window only)
      let lo = 0, hi = vis.length - 1; if (!vis.length || t < vis[0].time || t > vis[hi].time) return -1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (vis[m].time < t) lo = m + 1; else hi = m; }
      return vis[lo].time === t ? startIdx + lo : -1;
    }
    _drawSub(ctx, sub, vis, startIdx, X, slot, bw, top, h, c, font, fs, firstT, lastT) {
      const W = this.W, pad = this.pad, cf = N.cfg;
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, top - 5.5); ctx.lineTo(W - pad.right, top - 5.5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(pad.left, top - 4, W - pad.left - pad.right, h + 4); ctx.clip();
      ctx.font = font(fs - 1, '600'); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const line = (series, col, yf) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false;
        for (const p of series) { if (p.time < firstT || p.time > lastT) continue; const gi = this._timeIdx(p.time, startIdx, vis); if (gi < 0) continue; const x = X(gi), y = yf(p.value); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
        ctx.stroke();
      };
      if (sub.mode === 'volume') {
        let mx = 1; vis.forEach(b => { if ((b.volume || 0) > mx) mx = b.volume; });
        vis.forEach((b, i) => { const x = X(startIdx + i), hh = (b.volume / mx) * h * 0.94; ctx.fillStyle = b.close >= b.open ? cf.upColor : cf.downColor; ctx.globalAlpha = .6; ctx.fillRect(Math.round(x - bw / 2), top + h - hh, Math.max(1, Math.round(bw)), hh); });
        ctx.globalAlpha = 1; ctx.fillStyle = c.dim; ctx.fillText('Volume', pad.left + 8, top + 1);
        ctx.textAlign = 'left'; ctx.fillText(mx >= 1e5 ? (mx / 1e5).toFixed(1) + 'L' : Math.round(mx).toLocaleString('en-IN'), W - pad.right + 7, top + 1);
      } else if (sub.mode === 'rsi') {
        const yf = v => top + h * (1 - v / 100);
        ctx.fillStyle = 'rgba(124,92,255,.07)'; ctx.fillRect(pad.left, yf(70), W - pad.left - pad.right, yf(30) - yf(70));
        ctx.strokeStyle = c.grid; ctx.setLineDash([3, 3]); ctx.beginPath(); [30, 50, 70].forEach(v => { ctx.moveTo(pad.left, yf(v)); ctx.lineTo(W - pad.right, yf(v)); }); ctx.stroke(); ctx.setLineDash([]);
        line(sub.rsi || [], '#a78bfa', yf);
        ctx.fillStyle = c.dim; ctx.fillText('RSI 14', pad.left + 8, top + 1); ctx.fillText('70', W - pad.right + 7, yf(70) - 5); ctx.fillText('30', W - pad.right + 7, yf(30) - 5);
      } else if (sub.mode === 'oi') {
        const ser = sub.oi || []; let mn = Infinity, mx = -Infinity; for (const p of ser) { if (p.time < firstT || p.time > lastT) continue; if (p.value < mn) mn = p.value; if (p.value > mx) mx = p.value; }
        if (!isFinite(mn) || mn === mx) { mn = (mn || 0) - 1; mx = (mx || 1) + 1; } mn = Math.min(mn, 0); mx = Math.max(mx, 0);
        const yf = v => top + 4 + (1 - (v - mn) / (mx - mn)) * (h - 8);
        ctx.strokeStyle = c.grid; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pad.left, yf(0)); ctx.lineTo(W - pad.right, yf(0)); ctx.stroke(); ctx.setLineDash([]);
        line(ser, '#fbbf24', yf); ctx.fillStyle = c.dim; ctx.fillText('OI flow (simulated, session cumulative)', pad.left + 8, top + 1);
      }
      ctx.restore();
    }
    _drawMeasure(ctx, X, Y, c, font, fs) {
      const m = this.measure, a = m.a, b = m.b, d = this.d, cs = d.candles;
      const ax = X(a.i), ay = Y(a.p), bx = X(b.i), by = Y(b.p), up = b.p >= a.p, col = up ? '#2962ff' : '#ef5350';
      ctx.save(); ctx.beginPath(); ctx.rect(this.pad.left, this.pad.top, this.plotW, this.plotH); ctx.clip();
      ctx.fillStyle = col + '22'; ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(ax, bx) + .5, Math.min(ay, by) + .5, Math.abs(bx - ax), Math.abs(by - ay)); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.restore();
      const dp = b.p - a.p, pc = dp / a.p * 100, bars = Math.round(b.i - a.i);
      const i0 = clamp(Math.round(a.i), 0, cs.length - 1), i1 = clamp(Math.round(b.i), 0, cs.length - 1);
      const sec = cs[i1] && cs[i0] ? Math.abs(cs[i1].time - cs[i0].time) : 0;
      const txt = (dp >= 0 ? '+' : '') + dp.toFixed(2) + ' (' + (pc >= 0 ? '+' : '') + pc.toFixed(2) + '%)  ·  ' + Math.abs(bars) + ' bars' + (N.isIntraday(d.tf) ? ' · ' + N.dur(sec) : '');
      ctx.font = font(fs, '700'); const tw = ctx.measureText(txt).width + 16;
      const cx = clamp((ax + bx) / 2 - tw / 2, this.pad.left + 4, this.W - this.pad.right - tw - 4), cy = clamp(Math.min(ay, by) - 30, this.pad.top + 4, this.pad.top + this.plotH - 24);
      ctx.fillStyle = col; rrect(ctx, cx, cy, tw, 22, 5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx + 8, cy + 11.5);
    }
    toBlob(cb) { this.render(); this.canvas.toBlob(cb, 'image/png'); }
  }
  N.Chart = Chart;
})(window.NTI);
