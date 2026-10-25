/* NerdyTradeIntuition — NSE charge model + risk/qty calculator */
(function (N) {
  'use strict';
  const $ = N.$;

  // charges for a round trip (entry -> exit) per segment
  N.charges = function (entry, exit, qty, segment) {
    const buyVal = entry * qty, sellVal = exit * qty, turnover = buyVal + sellVal;
    let brok = 0, stt = 0, exch = 0, stamp = 0, notice = '';
    const sebi = turnover * 0.000001;
    if (segment === 'delivery') { brok = 0; stt = turnover * 0.001; exch = turnover * 0.0000297; stamp = buyVal * 0.00015; }
    else if (segment === 'intraday') { const bB = buyVal * 0.0003, sB = sellVal * 0.0003; brok = Math.min(20, bB) + Math.min(20, sB); stt = sellVal * 0.00025; exch = turnover * 0.0000297; stamp = buyVal * 0.00003; if (bB > 20 || sB > 20) notice = 'Max ₹20/order cap hit'; }
    else if (segment === 'futures') { const bB = buyVal * 0.0003, sB = sellVal * 0.0003; brok = Math.min(20, bB) + Math.min(20, sB); stt = sellVal * 0.0002; exch = turnover * 0.0000173; stamp = buyVal * 0.00002; if (bB > 20 || sB > 20) notice = 'Max ₹20/order cap hit'; }
    else if (segment === 'options') { brok = 40; stt = sellVal * 0.001; exch = turnover * 0.0003503; stamp = buyVal * 0.00003; notice = 'Flat ₹20/order'; }
    const gst = (brok + exch + sebi) * 0.18;
    return { brok, stt, exch: exch + sebi, stamp, gst, total: brok + stt + exch + sebi + stamp + gst, notice };
  };
  // direction-aware: long = buy at entry, sell at exit; short = sell at entry, buy at exit (same cost shape)
  N.tradeCharges = (dir, entry, exit, qty, segment) => dir === 1 ? N.charges(entry, exit, qty, segment) : N.charges(exit, entry, qty, segment);

  let dir = 'long';
  const rc = {};
  ['Capital', 'RiskPct', 'RiskAmt', 'Segment', 'Leverage', 'Lot', 'Entry', 'Sl', 'Tp', 'Ruin', 'Qty', 'QtyLbl', 'RiskUnit', 'Notional', 'Margin', 'Warn', 'Charges', 'BE', 'ChBrok', 'ChStt', 'ChExch', 'ChStamp', 'ChGst', 'LevRow', 'LotRow', 'TableBody'].forEach(k => rc[k] = $('rc' + k));

  function syncSeg() { const s = rc.Segment.value; rc.LevRow.classList.toggle('hidden', s !== 'intraday'); rc.LotRow.classList.toggle('hidden', !(s === 'futures' || s === 'options')); }
  function calc() {
    const cap = parseFloat(rc.Capital.value) || 0, riskAmt = parseFloat(rc.RiskAmt.value) || 0, entry = parseFloat(rc.Entry.value) || 0, sl = parseFloat(rc.Sl.value) || 0;
    const seg = rc.Segment.value, lev = seg === 'intraday' ? (parseInt(rc.Leverage.value) || 1) : 1, lot = (seg === 'futures' || seg === 'options') ? (parseInt(rc.Lot.value) || 1) : 1, customTp = parseFloat(rc.Tp.value);
    rc.Ruin.textContent = (riskAmt > 0 && cap > 0) ? 'Survival: ' + Math.floor(cap / riskAmt) + ' consecutive losses' : 'Survival: —';
    let rpu = Math.abs(entry - sl); if (rpu === 0) rpu = 0.0001;
    const rawQty = riskAmt / rpu; let dq, aq;
    if (seg === 'futures' || seg === 'options') { dq = Math.floor(rawQty / lot); if (dq < 1 && rawQty > 0) dq = 1; aq = dq * lot; } else { dq = Math.floor(rawQty); aq = dq; }
    let mpu = entry; if (seg === 'intraday') mpu = entry / lev; if (seg === 'futures') mpu = entry * 0.12; if (seg === 'options' && dir === 'short') mpu = entry * 0.15;
    const maxQ = mpu > 0 ? Math.floor(cap / mpu) : 0; let capped = false; const oq = dq;
    if (aq > maxQ && maxQ > 0) { capped = true; aq = maxQ; if (seg === 'futures' || seg === 'options') { dq = Math.floor(aq / lot); aq = dq * lot; } else dq = aq; }
    const notional = aq * entry, margin = aq * mpu;
    rc.Qty.textContent = dq.toLocaleString(); rc.QtyLbl.textContent = (seg === 'futures' || seg === 'options') ? 'LOTS (' + aq + ' QTY)' : 'SHARES';
    rc.RiskUnit.textContent = '₹' + rpu.toFixed(2); rc.Notional.textContent = '₹' + notional.toLocaleString('en-IN', { maximumFractionDigits: 0 }); rc.Margin.textContent = '₹' + margin.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    rc.Warn.classList.toggle('hidden', !capped); if (capped) rc.Warn.textContent = 'Capital caps qty at ' + dq + ' (risk-based size was ' + oq + ').';
    if (aq > 0) { let be = entry; const isLong = dir === 'long'; for (let i = 0; i < 3; i++) { const c = N.charges(entry, be, aq, seg), cpu = c.total / aq; be = isLong ? entry + cpu : entry - cpu; } rc.BE.textContent = '₹' + Math.max(0, be).toFixed(2); } else rc.BE.textContent = '₹0.00';
    const targets = [{ name: 'STOP', px: sl, r: -1, sl: true }];
    [1, 2, 3, 4].forEach(r => targets.push({ name: r + 'R', px: dir === 'long' ? entry + rpu * r : entry - rpu * r, r }));
    if (!isNaN(customTp) && customTp > 0 && ((dir === 'long' && customTp > entry) || (dir === 'short' && customTp < entry))) targets.push({ name: 'CUSTOM', px: customTp, r: Math.abs(customTp - entry) / rpu });
    targets.sort((a, b) => dir === 'long' ? a.px - b.px : b.px - a.px);
    const t1 = targets.find(t => t.r > 0);
    if (aq > 0 && t1) { const c = N.charges(entry, t1.px, aq, seg); rc.Charges.textContent = '₹' + c.total.toFixed(2); rc.ChBrok.textContent = c.brok.toFixed(2); rc.ChStt.textContent = c.stt.toFixed(2); rc.ChExch.textContent = c.exch.toFixed(2); rc.ChStamp.textContent = c.stamp.toFixed(2); rc.ChGst.textContent = c.gst.toFixed(2); }
    else { rc.Charges.textContent = '₹0.00'; ['ChBrok', 'ChStt', 'ChExch', 'ChStamp', 'ChGst'].forEach(k => rc[k].textContent = '0.00'); }
    if (aq === 0) { rc.TableBody.innerHTML = ''; return; }
    rc.TableBody.innerHTML = targets.map(t => {
      const gross = dir === 'long' ? (t.px - entry) * aq : (entry - t.px) * aq, c = N.charges(entry, t.px, aq, seg), net = gross - c.total, roi = margin > 0 ? net / margin * 100 : 0, cl = net >= 0 ? 'pos' : 'neg';
      return '<tr><td class="' + (t.sl ? 'neg' : t.name === 'CUSTOM' ? '' : 'pos') + '">' + t.name + '</td><td>' + t.r.toFixed(2) + 'R</td><td>₹' + t.px.toFixed(2) + '</td><td class="' + cl + '">' + (net >= 0 ? '+' : '') + '₹' + net.toFixed(2) + '</td><td class="' + cl + '">' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%</td></tr>';
    }).join('');
  }
  function setDir(d) { dir = d; $('rcDirLong').className = 'btn ' + (d === 'long' ? 'buy' : 'solid'); $('rcDirShort').className = 'btn ' + (d === 'short' ? 'sell' : 'solid'); calc(); }
  N.rcInit = function () {
    rc.Capital.value = N.cfg.capital; rc.Segment.value = N.cfg.segment; syncSeg();
    rc.RiskAmt.value = (N.cfg.capital * (parseFloat(rc.RiskPct.value) || 1) / 100).toFixed(2);
    rc.Segment.onchange = () => { N.cfg.segment = rc.Segment.value; N.saveCfg(); syncSeg(); calc(); N.onSegmentChange && N.onSegmentChange(); };
    [rc.Capital, rc.RiskAmt, rc.Leverage, rc.Lot, rc.Entry, rc.Sl, rc.Tp].forEach(i => i.addEventListener('input', calc));
    rc.RiskPct.addEventListener('input', () => { const cap = parseFloat(rc.Capital.value) || 0; rc.RiskAmt.value = (cap * (parseFloat(rc.RiskPct.value) || 0) / 100).toFixed(2); calc(); });
    rc.RiskAmt.addEventListener('input', () => { const cap = parseFloat(rc.Capital.value) || 0; if (cap > 0) rc.RiskPct.value = ((parseFloat(rc.RiskAmt.value) || 0) / cap * 100).toFixed(2); });
    rc.Capital.addEventListener('input', () => { N.cfg.capital = parseFloat(rc.Capital.value) || 100000; N.saveCfg(); rc.RiskPct.dispatchEvent(new Event('input')); N.onCapitalChange && N.onCapitalChange(); });
    $('rcDirLong').onclick = () => setDir('long'); $('rcDirShort').onclick = () => setDir('short');
    $('rcPull').onclick = () => { if (N.getPrice) rc.Entry.value = N.getPrice().toFixed(2); calc(); };
    $('rcApply').onclick = () => {
      const seg = rc.Segment.value, lotMul = (seg === 'futures' || seg === 'options') ? (parseInt(rc.Lot.value) || 1) : 1;
      const q = parseInt(rc.Qty.textContent.replace(/,/g, '')) * lotMul; if (!(q > 0)) return;
      const entry = parseFloat(rc.Entry.value) || 0, sl = parseFloat(rc.Sl.value) || 0, tp = parseFloat(rc.Tp.value);
      N.applyTicket && N.applyTicket(q, Math.abs(entry - sl), (!isNaN(tp) && tp > 0) ? Math.abs(tp - entry) : null);
      $('rcDetails').open = false;
    };
    setDir('long');
  };
  N.rcSetEntry = (p) => { rc.Entry.value = p.toFixed(2); rc.Sl.value = (p * 0.995).toFixed(2); rc.Tp.value = (p * 1.01).toFixed(2); calc(); };
})(window.NTI);
