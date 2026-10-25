/* =========================================================================
   DISPIST DEMO v2d — WhatsApp order intake, customer tracking, owner report,
   Finance dashboard. Loaded after v2c.js. Everything renders from `store`.
   SIMULATED seams: parseOrderMessage, buildOwnerReport, insightsFromData,
   sendWhatsApp, sendEmail (each marked in place).
========================================================================= */
const AREA_ALIAS = [['thika road', 'Thika Road Corridor'], ['kasarani', 'Thika Road Corridor'], ['roysambu', 'Thika Road Corridor'], ['githurai', 'Thika Road Corridor'],
  ['kilimani', 'Westlands Same-Day'], ['lavington', 'Westlands Same-Day'], ['parklands', 'Westlands Same-Day'], ['westlands', 'Westlands Same-Day'],
  ['enterprise road', 'Industrial Area Route'], ['lunga lunga', 'Industrial Area Route'], ['industrial area', 'Industrial Area Route'], ['embakasi', 'Industrial Area Route'],
  ['mlolongo', 'Mombasa Road Fleet'], ['syokimau', 'Mombasa Road Fleet'], ['mombasa road', 'Mombasa Road Fleet'], ['cbd', 'CBD Express Delivery'], ['town', 'CBD Express Delivery']];
const SWAHILI = { peleka: 'deliver', leta: 'bring', kesho: 'tomorrow', asubuhi: 'morning', haraka: 'urgent', mchana: 'afternoon', jioni: 'evening', leo: 'today', mzigo: 'parcel', boksi: 'box' };

/* SIMULATED - replace with real API/LLM call (e.g. an LLM extraction prompt returning this same shape) */
function parseOrderMessage(text) {
  const out = { phone: null, area: null, areaHint: null, items: null, itemType: null, cod: null, urgency: 'med', schedule: null, name: null, swahili: [], missing: [] };
  let t = ' ' + String(text || '').toLowerCase().replace(/[,;]/g, ' ') + ' ';
  const pm = /(?:\+?254|\b0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}/.exec(t);
  if (pm) { const n = DX.normPhone(pm[0]); if (n) out.phone = '0' + n.slice(3); t = t.replace(pm[0], ' '); }
  const cm = /\b(?:collect|cod|ksh|kes|sh)\b\.?\s*:?\s*(\d[\d,]*)/.exec(t) || /(\d[\d,]*)\s*(?:ksh|kes|bob)\b/.exec(t);
  if (cm) { out.cod = Number(cm[1].replace(/,/g, '')) || null; t = t.replace(cm[0], ' '); }
  const types = 'boxes|box|parcels|parcel|packages|package|pkgs|pkg|bags|bag|crates|crate|cartons|carton|sacks|sack|envelopes|envelope|bundles|bundle|items|item|boksi|mizigo|mzigo';
  const a = new RegExp('\\b(\\d{1,3})\\s*(' + types + ')\\b').exec(t), b = new RegExp('\\b(' + types + ')\\s*(\\d{1,3})\\b').exec(t), c = new RegExp('\\b(' + types + ')\\b').exec(t);
  const norm = (x) => x.replace(/^boxes$/, 'box').replace(/s$/, '');
  if (a) { out.items = +a[1]; out.itemType = norm(a[2]); } else if (b) { out.items = +b[2]; out.itemType = norm(b[1]); } else if (c) { out.items = 1; out.itemType = norm(c[1]); }
  for (const [al, ar] of AREA_ALIAS) if (new RegExp('\\b' + al + '\\b').test(t)) { out.area = ar; out.areaHint = al.replace(/\b\w/g, (x) => x.toUpperCase()); break; }
  if (/\b(urgent|asap|haraka|now)\b/.test(t)) out.urgency = 'high';
  const sch = [/\b(tomorrow|kesho)\b/.test(t) ? 'Tomorrow' : /\b(today|leo)\b/.test(t) ? 'Today' : '', /\b(morning|asubuhi)\b/.test(t) ? 'morning' : /\b(afternoon|mchana)\b/.test(t) ? 'afternoon' : /\b(evening|jioni)\b/.test(t) ? 'evening' : ''].filter(Boolean);
  if (sch.length) out.schedule = sch.join(' ');
  const nm = /\b(?:call|contact|ask for|attn|mr|mrs|ms|bw|bi)\.?\s+([a-z]{2,})/.exec(t);
  if (nm && !['me', 'us', 'him', 'her', 'them', 'the', 'on', 'before', 'after', 'when', 'upon', 'customer', 'urgent', 'asap'].includes(nm[1])) out.name = nm[1][0].toUpperCase() + nm[1].slice(1);
  Object.keys(SWAHILI).forEach((w) => { if (new RegExp('\\b' + w + '\\b').test(t)) out.swahili.push(w + ' (' + SWAHILI[w] + ')'); });
  if (!out.phone) out.missing.push('phone'); if (!out.area) out.missing.push('area');
  return out;
}

/* SIMULATED - replace with real API/LLM call (WhatsApp Business Cloud API). Demo mode opens wa.me with the text pre-filled. */
function sendWhatsApp(doc, number, text) {
  const n = DX.normPhone(number); if (!n) return { ok: false, error: 'Enter a valid Kenyan number (07xx, 01xx or +2547xx).' };
  const msg = text || (DX.invMessage ? DX.invMessage(doc) : ''), url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
  let opened = false; try { const w = window.open(url, '_blank'); if (w) { w.opener = null; opened = true; } } catch (err) { opened = false; }
  return { ok: true, url, opened, number: n, message: msg };
}
/* SIMULATED - replace with real API/LLM call (transactional email API). Demo mode opens the user's mail app via mailto:. */
function sendEmail(invoice, email) {
  if (!EMAIL_RE.test(String(email || '').trim())) return { ok: false, error: 'Enter a valid email address.' };
  const m = DX.invEmail(invoice), url = 'mailto:' + encodeURIComponent(email.trim()) + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  let opened = false; try { const a = document.createElement('a'); a.href = url; document.body.appendChild(a); a.click(); a.remove(); opened = true; } catch (err) { opened = false; }
  return { ok: true, url, opened, subject: m.subject, body: m.body };
}

(function () {
  'use strict';
  const esc = DX.esc, DAY = DX.DAY;
  store.wa = { messages: [], pending: null, typing: false };

  /* ---------- Shared WhatsApp send sheet (invoice, tracking, owner report) ---------- */
  DX.waSheet = (o) => {
    DX._wa = o;
    DX.sheet(o.title, `<label class="dx-lbl" for="waNum">${esc(o.numLabel || 'WhatsApp number')}</label><input id="waNum" class="dx-in" type="tel" inputmode="tel" autocomplete="tel" placeholder="0712 345 678" value="${esc(o.number || '')}">
      <div id="waNumErr" class="dx-err" role="alert"></div><label class="dx-lbl">Message preview</label>
      <div class="wa-prev"><div class="hd">${esc(o.previewHead || 'WhatsApp message')}</div><div class="bd"><div class="wa-b me">${esc(o.text)}<time>${DX.hhmm(Date.now())} ✓✓</time></div></div></div>
      <p class="dx-note">${o.note || 'WhatsApp opens with the message ready to send — you tap Send.'}</p>
      <div class="dx-btnrow"><button class="wa-send-btn dx-wa-btn dx-b" data-act="dx-wa-send">${esc(o.sendLabel || 'Open WhatsApp')}</button><button class="btn-ghost dx-b" data-act="dx-copy">Copy message</button></div>`, true, '#waNum');
  };
  function doWaSend() {
    const o = DX._wa, inp = document.getElementById('waNum'), err = document.getElementById('waNumErr'); if (!o || !inp) return;
    const n = DX.normPhone(inp.value); if (!n) { err.textContent = 'Enter a valid Kenyan number: 07xx, 01xx or +2547xx.'; inp.focus(); return; }
    err.textContent = ''; const res = sendWhatsApp(o.doc, n, o.text); if (!res.ok) { err.textContent = res.error; return; }
    DX.closeSheet(); if (!res.opened) toast('Pop-up blocked — tap “Copy message” and paste it into WhatsApp.', 'warn');
    if (o.onSent) o.onSent(res);
  }

  /* ---------- WhatsApp order intake (slide-over chat) ---------- */
  const SAMPLES = ['Peleka boxes 3 Kasarani, call John 0712345678, collect 3500 urgent', 'Deliver 2 parcels to Westlands tomorrow morning', 'Leta 1 envelope Roysambu haraka'];
  const WA = DX.layer('dxWa', 'dx-slide', 'WhatsApp order intake');
  WA.el.innerHTML = `<div class="dx-slide-card"><div class="wa-head"><button class="dx-b dx-icon" style="color:#fff;background:none;border:0" data-act="dx-wa-close" aria-label="Close WhatsApp intake">←</button>
    <div class="wa-av">D</div><div class="flex-1 min-w-0"><div class="font-semibold text-[15px]">Dispist Orders</div><div class="text-[12px]" style="opacity:.8">order bot · online (demo)</div></div></div>
    <div id="waMsgs" class="wa-msgs" role="log" aria-live="polite"></div>
    <div class="wa-chips" aria-label="Sample messages">${SAMPLES.map((s, i) => `<button class="wa-chip" data-act="dx-wa-chip" data-i="${i}">${esc(s)}</button>`).join('')}</div>
    <form id="waForm" class="wa-form"><input id="waInput" class="dx-in" type="text" autocomplete="off" placeholder="Type a customer message…" aria-label="Customer message"><button class="wa-send" aria-label="Send">➤</button></form></div>`;
  WA.el.addEventListener('click', (ev) => { if (ev.target === WA.el) WA.close(); });
  const bot = (text) => store.wa.messages.push({ from: 'bot', type: 'text', text, t: Date.now() });
  const ask = { phone: 'Got it 👍 What’s the customer’s phone number so the rider can call on arrival?', area: 'Which area should we deliver to? (e.g. Kasarani, Westlands, Embakasi, CBD, Mlolongo)' };
  function renderWa() {
    const box = document.getElementById('waMsgs'); if (!box) return; const wa = store.wa;
    box.innerHTML = wa.messages.map((m, i) => {
      if (m.type === 'card') {
        const d = m.draft, row = (ic, tx) => `<div class="row"><span>${ic}</span><span>${tx}</span></div>`;
        return `<div class="wa-card"><div class="font-semibold mb-1">Order summary</div>${row('📍', esc((d.areaHint ? d.areaHint + ' → ' : '') + d.area))}${row('👤', esc((d.name || 'Customer') + ' · ' + DX.localPhone(d.phone)))}
          ${row('📦', `${d.items || 1} ${esc(d.itemType || 'parcel')}${(d.items || 1) > 1 ? 's' : ''}`)}${d.cod ? row('💵', 'COD ' + kes(d.cod)) : ''}${d.urgency === 'high' ? row('⚡', 'Urgent') : ''}${d.schedule ? row('🗓', esc(d.schedule)) : ''}
          ${d.swahili.length ? `<div class="text-[11px] mt-1" style="color:#667781">Swahili understood: ${esc(d.swahili.join(', '))}</div>` : ''}
          ${m.state === 'open' ? `<div class="acts"><button class="dx-wa-btn dx-b" data-act="dx-wa-ok" data-i="${i}">Confirm order</button><button class="btn-ghost dx-b" data-act="dx-wa-no" data-i="${i}">Cancel</button></div>` : `<div class="mt-2 text-[12.5px] font-semibold">${m.state === 'done' ? '✅ Created ' + esc(m.orderId) : '✖ Cancelled'}</div>`}</div>`;
      }
      return `<div class="wa-b ${m.from}">${esc(m.text)}<time>${DX.hhmm(m.t)}${m.from === 'me' ? ' ✓✓' : ''}</time></div>`;
    }).join('') + (wa.typing ? '<div class="wa-typing" aria-label="Bot is typing"><i></i><i></i><i></i></div>' : '');
    box.scrollTop = box.scrollHeight;
  }
  function next(d) {
    const miss = !d.phone ? 'phone' : !d.area ? 'area' : null, wa = store.wa;
    if (miss) { wa.pending = { draft: d, ask: miss }; bot(ask[miss]); } else { wa.pending = null; wa.messages.push({ from: 'bot', type: 'card', draft: { ...d }, state: 'open', t: Date.now() }); }
  }
  function reply(text) {
    const wa = store.wa, p = parseOrderMessage(text);
    if (wa.pending) {
      const d = wa.pending.draft, k = wa.pending.ask; if (p[k]) { d[k] = p[k]; if (k === 'area') d.areaHint = p.areaHint; }
      if (!d[k]) { bot('Sorry, I couldn’t read that. ' + (k === 'phone' ? 'Please send a Kenyan number like 0712 345 678.' : ask.area)); return; }
      if (p.cod && !d.cod) d.cod = p.cod; if (p.name && !d.name) d.name = p.name; return next(d);
    }
    next(p);
  }
  DX.waSend = (text) => {
    text = String(text || '').trim(); if (!text) return; const wa = store.wa;
    wa.messages.push({ from: 'me', type: 'text', text, t: Date.now() }); wa.typing = true; renderWa();
    DX.later(() => { wa.typing = false; reply(text); renderWa(); }, 900);
  };
  function confirmWa(i, ok) {
    const m = store.wa.messages[i]; if (!m || m.state !== 'open') return;
    if (!ok) { m.state = 'cancelled'; bot('No problem — order cancelled. Send a new message any time.'); renderWa(); return; }
    const d = m.draft, o = DX.addOrder({ id: 'ORD-' + orderSeq++, client: d.name || 'WhatsApp customer', area: d.area, urgency: d.urgency === 'high' ? 'high' : d.schedule && /Tomorrow/.test(d.schedule) ? 'low' : 'med',
      items: d.items || 1, itemType: d.itemType || 'parcel', contact: d.phone, codAmount: d.cod || 0, source: 'WhatsApp', createdAt: Date.now(), schedule: d.schedule || '' });
    m.state = 'done'; m.orderId = o.id; bot(`✅ Order ${o.id} created and waiting in Incoming. A dispatcher will assign a driver shortly.`); renderWa();
    toast(`<b>${esc(o.id)}</b> created from WhatsApp — now in Incoming`, 'success');
  }
  DX.openWa = () => { if (!store.wa.messages.length) bot('Hi 👋 Send your delivery request in English or Kiswahili and I’ll turn it into an order.'); renderWa(); WA.open('#waInput'); };
  document.addEventListener('submit', (ev) => { if (ev.target.id !== 'waForm') return; ev.preventDefault(); const i = document.getElementById('waInput'); DX.waSend(i.value); i.value = ''; });

  /* ---------- Customer tracking page (modal styled as a mobile web page) ---------- */
  const TR = DX.layer('dxTrack', 'dx-sheet-wrap', 'Customer tracking page');
  TR.el.addEventListener('click', (ev) => { if (ev.target === TR.el) TR.close(); });
  DX.etaMin = (d) => Math.max(6, Math.round(km(DEPOT, dropPoint(d)) / 0.5));
  const etaText = (d) => {
    if (d.statusKey === 'delivered') return 'Delivered ' + DX.hhmm(d.finishedAt || Date.now()); if (d.statusKey === 'arrived') return 'Driver has arrived';
    if (!d.steps.start) return '~' + DX.etaMin(d) + ' min after departure'; if (!d.etaAt) d.etaAt = (d.startedAt || Date.now()) + DX.etaMin(d) * 60000;
    const s = Math.max(0, Math.round((d.etaAt - Date.now()) / 1000)); return s ? String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : 'Arriving now';
  };
  function renderTrack() {
    if (!TR.isOpen) return; const d = store.dispatches.find((x) => x.id === store.ui.trackId), id = d ? d.orderId || d.id : store.ui.trackId;
    const inner = !d ? `<div class="trk-body text-center"><div class="font-display font-bold text-lg">Delivery rescheduled</div><p class="text-[13px] mt-2" style="color:var(--ink-600)">This attempt didn’t complete. Your dispatcher will arrange a new time.</p></div>` : (() => {
      const dr = store.drivers.find((x) => x.reg === d.reg), st = [['Order received', d.createdAt, true], ['Driver assigned', d.assignedAt, true], ['Out for delivery', d.startedAt, d.steps.start], ['Arrived', d.arrivedAt, d.steps.arrived], ['Delivered', d.finishedAt, d.statusKey === 'delivered']];
      const nowIdx = st.reduce((n, s, i) => (s[2] ? i : n), 0), rated = d.rating;
      return `<div class="trk-body"><div class="text-[11px]" style="color:var(--ink-400)">${d.statusKey === 'delivered' ? 'Delivered' : 'Estimated arrival'}</div><div class="trk-eta dx-num" id="trkEta">${esc(etaText(d))}</div>
        <div class="text-[13px] mt-1">${esc(d.driver.split(' ').pop())} · ${esc(d.reg)}${dr ? ' · ' + esc(dr.type) : ''}</div>
        <ul class="trk-tl">${st.map((s, i) => `<li class="${s[2] ? (i === nowIdx ? 'now' : 'done') : ''}">${s[0]}${s[2] && s[1] ? ` <span class="text-[11px]" style="color:var(--ink-400)">${DX.hhmm(s[1])}</span>` : ''}</li>`).join('')}</ul>
        ${d.statusKey === 'delivered' ? `<div class="mt-2 text-center"><div class="text-[13px] font-semibold">${rated ? 'Thanks for rating — ' + rated + ' of 5' : 'How was your delivery?'}</div>
          <div class="trk-stars" role="group" aria-label="Rate your delivery">${[1, 2, 3, 4, 5].map((n) => `<button data-act="dx-rate" data-id="${esc(d.id)}" data-n="${n}" class="${rated >= n ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div></div>` : ''}</div>`;
    })();
    TR.el.querySelector('.dx-sheet-card').innerHTML = `<div class="flex justify-between items-center mb-3"><h2 class="font-display font-bold text-base">Customer tracking view</h2><button data-act="dx-track-close" class="btn-ghost dx-b dx-icon" aria-label="Close">✕</button></div>
      <div class="trk-phone"><div class="trk-bar">🔒 track.dispist.com/${esc(id)}</div>${inner}</div>
      <p class="dx-note text-center">This is what your customer sees. It updates live as the driver moves through the simulator.</p>
      ${d ? `<div class="dx-btnrow"><button class="dx-wa-btn dx-b" data-act="dx-track-send" data-id="${esc(d.id)}">Send tracking link</button></div>` : ''}`;
  }
  TR.el.innerHTML = '<div class="dx-sheet-card"></div>';
  DX.openTracking = (id) => { store.ui.trackId = id; TR.open('.dx-btnrow button'); renderTrack(); };
  bus.on('dispatch:status', renderTrack); bus.on('dispatch:failed', renderTrack);
  setInterval(() => { if (!TR.isOpen) return; const d = store.dispatches.find((x) => x.id === store.ui.trackId), el = document.getElementById('trkEta'); if (d && el && d.statusKey === 'transit') el.textContent = etaText(d); }, 1000);
  function sendTracking(id) {
    const d = store.dispatches.find((x) => x.id === id); if (!d) return; const oid = d.orderId || d.id;
    DX.waSheet({ title: 'Send tracking link', previewHead: 'To your customer', number: d.contact, doc: { kind: 'tracking', ref: oid },
      text: `Hi ${d.client}, your delivery ${oid} is on its way 🚚\nDriver: ${d.driver.split(' ').pop()} (${d.reg})\nTrack it live: https://track.dispist.com/${oid}\n— ${store.settings.pay.company}`,
      onSent: (r) => { audit(oid, 'Tracking link sent via WhatsApp to ' + DX.localPhone(r.number), 'tracking'); toast('Tracking link ready in WhatsApp for ' + esc(DX.localPhone(r.number)), 'success'); } });
  }
  function rate(id, n) { const d = store.dispatches.find((x) => x.id === id); if (!d) return; d.rating = n; const h = store.history.find((x) => x.dispatchId === id); if (h) h.rating = n; audit(d.orderId || d.id, `Customer rated delivery ${n}/5`); renderTrack(); renderDispatches(); toast('Rating saved: ' + '★'.repeat(n), 'info'); }

  /* ---------- Finance engine (everything below is computed from store) ---------- */
  DX.metrics = (from, to, days) => {
    const c = store.costSettings, rows = store.history.filter((h) => h.status === 'Delivered' && h.date >= from && h.date < to), n = rows.length;
    const rev = rows.reduce((s, h) => s + h.fee, 0), kmS = rows.reduce((s, h) => s + h.km, 0), driverPay = n * c.driverPayPerDelivery, fuel = kmS * c.fuelPerKm, maint = days * c.maintenancePerDay, over = days * c.overheadPerDay;
    const cost = driverPay + fuel + maint + over, profit = rev - cost;
    return { rows, n, rev, km: kmS, driverPay, fuel, maint, over, cost, profit, margin: rev ? (profit / rev) * 100 : 0, avg: n ? rev / n : 0, days };
  };
  function group(rows, key, m) {
    const c = store.costSettings, g = {}; rows.forEach((h) => { const o = g[h[key]] || (g[h[key]] = { name: h[key], n: 0, rev: 0, varc: 0 }); o.n++; o.rev += h.fee; o.varc += c.driverPayPerDelivery + h.km * c.fuelPerKm; });
    return Object.values(g).map((o) => { o.fixed = m.n ? ((m.maint + m.over) * o.n) / m.n : 0; o.cost = o.varc + o.fixed; o.profit = o.rev - o.cost; o.margin = o.rev ? (o.profit / o.rev) * 100 : 0; return o; }).sort((a, b) => b.rev - a.rev);
  }
  function series(from, days) {
    const c = store.costSettings, hours = days === 1, N = hours ? new Date().getHours() + 1 : days, len = hours ? 36e5 : DAY, fixed = (c.maintenancePerDay + c.overheadPerDay) / (hours ? 24 : 1), out = [];
    for (let i = 0; i < N; i++) {
      const a = from + i * len, b = a + len, rows = store.history.filter((h) => h.status === 'Delivered' && h.date >= a && h.date < b), rev = rows.reduce((s, h) => s + h.fee, 0);
      const cost = rows.length * c.driverPayPerDelivery + rows.reduce((s, h) => s + h.km, 0) * c.fuelPerKm + fixed;
      out.push({ label: hours ? String(i).padStart(2, '0') + ':00' : new Date(a).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }), rev, cost, profit: rev - cost });
    }
    return out;
  }
  const ks = (v) => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + Math.round(a / 100) / 10 + 'k' : s + Math.round(a); };
  const COL = { rev: '#2F6FE0', cost: '#E0902A', profit: '#25A862' };
  function trendSvg(S) {
    const W = 480, H = 240, L = 44, R = 10, T = 14, B = 28, iw = W - L - R, ih = H - T - B, vals = S.flatMap((s) => [s.rev, s.cost, s.profit]), mx = Math.max(1, ...vals), mn = Math.min(0, ...vals);
    const xs = (i) => L + (S.length > 1 ? (i * iw) / (S.length - 1) : iw / 2), ys = (v) => T + ih - ((v - mn) / (mx - mn || 1)) * ih, line = (k) => S.map((s, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(s[k]).toFixed(1)).join(' ');
    const grid = [0, 1, 2, 3, 4].map((i) => { const v = mn + ((mx - mn) * i) / 4; return `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="#E8E6E3"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end" font-size="11" fill="#8B8B99">${ks(v)}</text>`; }).join('');
    const xl = [...new Set([0, Math.floor((S.length - 1) / 2), S.length - 1])].map((i) => `<text x="${xs(i)}" y="${H - 8}" text-anchor="${i === 0 && S.length > 1 ? 'start' : i === S.length - 1 && S.length > 1 ? 'end' : 'middle'}" font-size="11" fill="#8B8B99">${esc(S[i].label)}</text>`).join('');
    const dots = S.length === 1 ? Object.keys(COL).map((k) => `<circle cx="${xs(0)}" cy="${ys(S[0][k])}" r="4" fill="${COL[k]}"/>`).join('') : '';
    const html = `<svg id="finTrend" class="fin-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, costs and profit trend">${grid}${xl}<path d="${line('rev')} L${xs(S.length - 1)} ${ys(0)} L${xs(0)} ${ys(0)} Z" fill="${COL.rev}" opacity=".08"/>
      ${['rev', 'cost', 'profit'].map((k) => `<path d="${line(k)}" fill="none" stroke="${COL[k]}" stroke-width="2.4" stroke-linejoin="round"/>`).join('')}${dots}
      <g id="finTip" visibility="hidden" pointer-events="none"><line id="tpL" y1="${T}" y2="${T + ih}" stroke="#8B8B99" stroke-dasharray="3 3"/><rect id="tpR" rx="7" width="138" height="66" fill="#1E1E28" opacity=".95"/>
      <text fill="#fff" font-size="11.5"><tspan id="tp0" font-weight="700"></tspan><tspan id="tp1" fill="#9CC0FF"></tspan><tspan id="tp2" fill="#F5C77E"></tspan><tspan id="tp3" fill="#8FE0B0"></tspan></text></g></svg>`;
    const attach = (host) => {
      const svg = host.querySelector('#finTrend'); if (!svg) return; const g = (id) => svg.querySelector('#' + id);
      const show = (ev) => { const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * W; let i = S.length > 1 ? Math.round(((x - L) / iw) * (S.length - 1)) : 0; i = Math.max(0, Math.min(S.length - 1, i)); const s = S[i], px = xs(i), bx = px > W / 2 ? px - 146 : px + 8;
        g('finTip').setAttribute('visibility', 'visible'); g('tpL').setAttribute('x1', px); g('tpL').setAttribute('x2', px); g('tpR').setAttribute('x', bx); g('tpR').setAttribute('y', T + 4);
        [[s.label, 0], ['Revenue ' + kes(Math.round(s.rev)), 1], ['Costs ' + kes(Math.round(s.cost)), 2], ['Profit ' + kes(Math.round(s.profit)), 3]].forEach(([t, k]) => { const e2 = g('tp' + k); e2.textContent = t; e2.setAttribute('x', bx + 8); e2.setAttribute('y', T + 20 + k * 15); }); };
      svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', () => g('finTip').setAttribute('visibility', 'hidden'));
    };
    return { html, attach };
  }
  function donut(parts) {
    const tot = parts.reduce((s, p) => s + p[1], 0), C = 2 * Math.PI * 67, cols = ['#DB3A03', '#2F6FE0', '#E0902A', '#8B8B99']; if (!tot) return '<div class="text-[12.5px]" style="color:var(--ink-400)">No costs in this period.</div>';
    let acc = 0; const segs = parts.map((p, i) => { const f = p[1] / tot, s = `<circle cx="100" cy="100" r="67" fill="none" stroke="${cols[i]}" stroke-width="30" stroke-dasharray="${(f * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc * C).toFixed(2)}" transform="rotate(-90 100 100)"/>`; acc += f; return s; }).join('');
    return `<div class="flex flex-wrap items-center gap-4"><svg viewBox="0 0 200 200" class="fin-svg" style="max-width:190px" role="img" aria-label="Cost breakdown donut">${segs}<text x="100" y="97" text-anchor="middle" font-size="12" fill="#8B8B99">Total costs</text><text x="100" y="118" text-anchor="middle" font-size="17" font-weight="800" fill="#1E1E28" font-family="Sora,sans-serif">${ks(tot)}</text></svg>
      <div class="fin-leg" style="flex-direction:column;flex:1;min-width:150px">${parts.map((p, i) => `<span><i style="background:${cols[i]}"></i>${p[0]} · <b>${kes(Math.round(p[1]))}</b> (${Math.round((p[1] / tot) * 100)}%)</span>`).join('')}</div></div>`;
  }
  const delta = (cur, prev, o) => {
    o = o || {}; if (!prev && !cur) return '<div class="dx-delta" style="color:var(--ink-400)">no change</div>'; if (!prev) return '<div class="dx-delta" style="color:var(--ink-400)">new this period</div>';
    const d = o.pp ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100, up = d >= 0, good = o.badUp ? !up : up, t = o.pp ? Math.abs(d).toFixed(1) + ' pts' : Math.abs(d).toFixed(1) + '%';
    return `<div class="dx-delta ${good ? 'dx-up' : 'dx-down'}">${up ? '▲' : '▼'} ${t} <span style="color:var(--ink-400);font-weight:400">${o.vs}</span></div>`;
  };
  const aging = () => { const b = [['Current', 0, 0], ['1–7 days', 0, 0], ['8–30 days', 0, 0], ['30+ days', 0, 0]], list = [];
    store.invoices.forEach((i) => { const s = DX.invStatus(i); if (s !== 'sent' && s !== 'overdue') return; const dp = DX.daysPast(i), t = DX.invTotals(i).total, k = dp <= 0 ? 0 : dp <= 7 ? 1 : dp <= 30 ? 2 : 3; b[k][1] += t; b[k][2]++; if (dp >= 1) list.push({ i, dp, t }); });
    return { b, list: list.sort((x, y) => y.dp - x.dp) }; };

  /* SIMULATED - replace with real API/LLM call (narrated insights over the same aggregates) */
  function insightsFromData(ctx) {
    const out = [], r = ctx.routes, tot = r.reduce((s, x) => s + x.rev, 0);
    if (r.length > 1 && tot) {
      const top = r[0], low = r.slice().sort((a, b) => a.margin - b.margin)[0], share = Math.round((top.rev / tot) * 100);
      if (top === low) out.push(`${top.name} earns ${share}% of revenue but has the lowest margin (${Math.round(top.margin)}%).`);
      else { out.push(`${top.name} earns ${share}% of revenue.`); if (low.margin < 20) out.push(`${low.name} has the lowest margin (${Math.round(low.margin)}%) — worth repricing.`); }
      const neg = r.find((x) => x.margin < 0); if (neg) out.push(`${neg.name} loses money — reprice or consolidate its runs.`);
    }
    const o30 = ctx.aging.list.filter((x) => x.dp > 30); if (o30.length) out.push(`${o30.length} invoice${o30.length > 1 ? 's are' : ' is'} 30+ days overdue (${kes(o30.reduce((s, x) => s + x.t, 0))}).`);
    if (ctx.held > 0) out.push(`${kes(ctx.held)} of COD cash is still with drivers.`);
    return out.slice(0, 3).length ? out.slice(0, 3) : ['Not enough data in this period for insights yet.'];
  }

  function renderFinance() {
    const host = document.getElementById('view-finance'); if (!host) return;
    const days = store.ui.finRange || 7, from = DX.day0() - (days - 1) * DAY, to = Date.now() + 1, pf = from - days * DAY, vs = days === 1 ? 'vs yesterday' : 'vs prev ' + days + ' days';
    const cur = DX.metrics(from, to, days), prev = DX.metrics(pf, from, days), routes = group(cur.rows, 'area', cur), clients = group(cur.rows, 'client', cur), S = series(from, days), ag = aging();
    const held = DX.codHeld(), outNow = DX.outstandingAt(Date.now()), outThen = DX.outstandingAt(from), log = store.cod.log, sumL = (t) => log.filter((x) => x.type === t && x.t >= from && x.t < to).reduce((s, x) => s + x.amount, 0);
    const tr = trendSvg(S), kp = [['Total revenue', kes(Math.round(cur.rev)), delta(cur.rev, prev.rev, { vs })], ['Gross profit', kes(Math.round(cur.profit)), delta(cur.profit, prev.profit, { vs })],
      ['Profit margin', cur.margin.toFixed(1) + '%', delta(cur.margin, prev.margin, { pp: 1, vs })], ['Outstanding invoices', kes(Math.round(outNow)), delta(outNow, outThen, { badUp: 1, vs: 'vs period start' })],
      ['COD held by drivers', kes(held), delta(held, DX.codHeldAt(from), { badUp: 1, vs: 'vs period start' })], ['Avg revenue / delivery', kes(Math.round(cur.avg)), delta(cur.avg, prev.avg, { vs })]];
    const ins = insightsFromData({ routes, clients, aging: ag, held, metrics: cur });
    const maxC = Math.max(1, ...clients.map((c) => c.rev));
    const routeRows = routes.map((r) => { const bad = r.margin < 0, low = r.margin < 20; return `<tr class="${low ? 'bad' : ''}"><td data-label="Route"><b>${esc(r.name)}</b></td><td data-label="Deliveries" class="dx-num">${r.n}</td><td data-label="Revenue" class="dx-num">${kes(Math.round(r.rev))}</td><td data-label="Costs" class="dx-num">${kes(Math.round(r.cost))}</td>
      <td data-label="Profit" class="dx-num" style="${r.profit < 0 ? 'color:var(--red-500)' : ''}">${kes(Math.round(r.profit))}</td><td data-label="Margin" class="dx-num font-medium" style="${low ? 'color:var(--red-500)' : ''}">${r.margin.toFixed(1)}%</td>
      <td data-label="Flag">${bad ? '<span class="dx-tag red">This route loses money</span>' : low ? '<span class="dx-tag red">Low margin</span>' : '<span style="color:var(--ink-400)">—</span>'}</td></tr>`; }).join('');
    host.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-3"><div class="dx-chips" role="group" aria-label="Date range">${[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([n, l]) => `<button class="dx-chip ${days === n ? 'on' : ''}" aria-pressed="${days === n}" data-act="dx-fin-range" data-n="${n}">${l}</button>`).join('')}</div>
      <div class="flex gap-2 ml-auto"><button class="btn-ghost dx-b" data-act="dx-goto" data-view="invoices">Invoices</button><button class="btn-primary dx-b" data-act="dx-fin-csv">Export CSV</button></div></div>
      <div class="fin-ins mb-3"><b>Insights:</b> ${ins.map(esc).join(' ')}</div>
      <div class="dx-kpis mb-3">${kp.map(([l, v, d]) => `<div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400)">${l}</div><div class="font-display font-bold text-xl dx-num">${v}</div>${d}</div>`).join('')}</div>
      <div class="dx-card mb-3"><div class="dx-h">Revenue vs costs vs profit</div>${tr.html}<div class="fin-leg"><span><i style="background:${COL.rev}"></i>Revenue</span><span><i style="background:${COL.cost}"></i>Costs</span><span><i style="background:${COL.profit}"></i>Profit</span><span style="color:var(--ink-400)">Tap or hover the chart for details</span></div></div>
      <div class="dx-grid2 mb-3"><div class="dx-card"><div class="dx-h">Cost breakdown</div>${donut([['Driver pay', cur.driverPay], ['Fuel', cur.fuel], ['Maintenance', cur.maint], ['Overhead', cur.over]])}</div>
        <div class="dx-card"><div class="dx-h">Revenue by client (top 6)</div>${clients.slice(0, 6).map((c) => `<div class="fin-bar"><span class="truncate" title="${esc(c.name)}">${esc(c.name)}</span><span class="t"><span class="f" style="display:block;width:${(c.rev / maxC) * 100}%"></span></span><span class="dx-num"><b>${ks(c.rev)}</b> · <span style="color:${c.margin < 20 ? 'var(--red-500)' : 'var(--green-600)'}">${Math.round(c.margin)}%</span></span></div>`).join('') || '<div class="text-[12.5px]" style="color:var(--ink-400)">No deliveries in this period.</div>'}</div></div>
      <div class="dx-card mb-3 data-table-wrap" style="padding:16px 8px"><div class="dx-h px-2">Revenue and profit by route</div><table class="data-table dx-stack"><thead><tr><th>Route</th><th>Deliveries</th><th>Revenue</th><th>Costs</th><th>Profit</th><th>Margin</th><th>Flag</th></tr></thead><tbody>${routeRows || '<tr><td>No deliveries in this period.</td></tr>'}</tbody></table></div>
      <div class="dx-card mb-3"><div class="dx-h">Receivables</div><div class="fin-aging mb-3">${ag.b.map(([l, t, n]) => `<div><div class="text-[11px]" style="color:var(--ink-400)">${l}</div><div class="font-display font-bold dx-num">${kes(t)}</div><div class="text-[11px]" style="color:var(--ink-400)">${n} invoice${n === 1 ? '' : 's'}</div></div>`).join('')}</div>
        ${ag.list.slice(0, 5).map((x) => `<div class="route-row" style="gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:160px"><b>${esc(x.i.number)}</b> · ${esc(x.i.client)}<br><span class="text-[11.5px]" style="color:var(--red-500)">${x.dp} day${x.dp > 1 ? 's' : ''} overdue</span></span><b class="dx-num">${kes(Math.round(x.t))}</b><button class="btn-ghost dx-b" data-act="dx-remind" data-n="${esc(x.i.number)}">Send reminder</button></div>`).join('') || '<div class="text-[12.5px]" style="color:var(--ink-400)">No overdue invoices — nice.</div>'}</div>
      <div class="dx-card"><div class="dx-h">Cash position</div><div class="dx-grid4">${DX.stat('COD collected', kes(sumL('collect')), 'this period')}${DX.stat('Remitted', kes(sumL('remit')), 'this period')}${DX.stat('Still with drivers', kes(held), 'right now', held ? 'var(--brand-orange-600)' : '')}<div class="flex items-center"><button class="btn-ghost dx-b w-full" data-act="dx-goto" data-view="cash">Open Cash view</button></div></div></div>`;
    tr.attach(host);
  }
  DX.views.finance = renderFinance;
  function exportCsv() {
    const days = store.ui.finRange || 7, from = DX.day0() - (days - 1) * DAY, m = DX.metrics(from, Date.now() + 1, days), c = store.costSettings;
    const rows = [['Date', 'Order', 'Client', 'Route', 'Driver', 'Fee (KES)', 'Distance (km)', 'Driver pay (KES)', 'Fuel (KES)', 'COD (KES)'], ...m.rows.map((h) => [DX.d2s(h.date), h.id, h.client, h.area, h.driver, h.fee, h.km, c.driverPayPerDelivery, Math.round(h.km * c.fuelPerKm), h.codAmount || 0]),
      [], ['Summary', '', '', '', '', Math.round(m.rev), '', Math.round(m.driverPay), Math.round(m.fuel), ''], ['Maintenance + overhead', '', '', '', '', '', '', '', Math.round(m.maint + m.over), ''], ['Gross profit', '', '', '', '', Math.round(m.profit)]];
    try { const a = document.createElement('a'), u = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' })); a.href = u; a.download = `dispist-finance-${days === 1 ? 'today' : days + 'd'}-${DX.d2s(Date.now())}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); toast('Downloaded finance CSV (' + m.rows.length + ' deliveries)', 'info'); }
    catch (err) { toast('Download blocked by this browser', 'warn'); }
  }

  /* ---------- Owner report ---------- */
  /* SIMULATED - replace with real API/LLM call (scheduled report job + WhatsApp Business API) */
  function buildOwnerReport() {
    const t0 = DX.day0(), rows = store.history.filter((h) => h.date >= t0), done = rows.filter((h) => h.status === 'Delivered'), failed = rows.filter((h) => h.status === 'Failed'), late = done.filter((h) => !h.onTime), m = DX.metrics(t0, Date.now() + 1, 1);
    const cnt = (list, k) => { const r = {}; list.forEach((h) => { r[h[k]] = (r[h[k]] || 0) + 1; }); return Object.entries(r).sort((a, b) => b[1] - a[1]); };
    const topD = cnt(done, 'driver')[0], busy = cnt(done, 'area')[0], broke = store.drivers.find((d) => d.status === 'breakdown'), mostFail = cnt(failed, 'driver')[0];
    const lowD = store.drivers.filter((d) => d.status === 'ok').sort((a, b) => a.onTime - b.onTime)[0];
    const attn = broke ? `${broke.name} (vehicle breakdown)` : mostFail ? `${mostFail[0]} (${mostFail[1]} failed)` : lowD ? `${lowD.name} (${lowD.onTime}% on-time)` : 'None';
    const ov = store.invoices.filter((i) => DX.invStatus(i) === 'overdue'), ovAmt = ov.reduce((s, i) => s + DX.invTotals(i).total, 0), collected = store.cod.log.filter((x) => x.type === 'collect' && x.t >= t0).reduce((s, x) => s + x.amount, 0);
    const data = { done: done.length, failed: failed.length, late: late.length, revenue: m.rev, profit: m.profit, codCollected: collected, codHeld: DX.codHeld(), overdue: ov.length, overdueAmt: ovAmt, topDriver: topD ? topD[0] : '—', attention: attn, busiest: busy ? busy[0] : '—' };
    const text = `📊 *Dispist daily report* — ${new Date().toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}\n✅ Delivered: ${data.done} · ❌ Failed: ${data.failed} · ⏱ Late: ${data.late}\n💰 Revenue: ${kes(Math.round(data.revenue))} · Profit: ${kes(Math.round(data.profit))}\n💵 COD collected: ${kes(data.codCollected)} · With drivers: ${kes(data.codHeld)}\n🧾 Overdue invoices: ${data.overdue} (${kes(Math.round(data.overdueAmt))})\n🏆 Top driver: ${data.topDriver}${topD ? ' (' + topD[1] + ')' : ''}\n⚠️ Needs attention: ${data.attention}\n🛣 Busiest route: ${data.busiest}\n— Demo data from Dispist`;
    return { data, text };
  }
  DX.openOwner = () => { const r = buildOwnerReport(); DX.waSheet({ title: 'Owner report (demo)', previewHead: 'Dispist · Daily owner report — DEMO', numLabel: 'Your WhatsApp number', number: '', doc: { kind: 'report' }, text: r.text, sendLabel: 'Send to my WhatsApp',
    note: '<b>Demo only.</b> This opens WhatsApp with the report pre-filled. A live version would send automatically each evening through the WhatsApp Business API.', onSent: (res) => { audit('REPORT', 'Owner report opened in WhatsApp for ' + DX.localPhone(res.number), 'report'); toast('Owner report ready in WhatsApp for ' + esc(DX.localPhone(res.number)), 'success'); } }); };
  DX.reportExtras = () => {
    const host = document.getElementById('view-reports'); if (!host) return; let box = document.getElementById('dxReportExtras'); if (!box) { box = document.createElement('div'); box.id = 'dxReportExtras'; box.className = 'dx-card mt-4'; host.appendChild(box); }
    const t0 = DX.day0(), f1 = DX.failStats(t0), f7 = DX.failStats(t0 - 6 * DAY), line = (o) => Object.keys(o).map((k) => `${esc(k)}: <b>${o[k]}</b>`).join(' · ') || 'None';
    box.innerHTML = `<div class="dx-h">Owner report &amp; failure stats</div><div class="text-[12.5px] mb-2">Failed deliveries today: <b>${Object.values(f1).reduce((a, b) => a + b, 0)}</b> — ${line(f1)}</div><div class="text-[12.5px] mb-3">Last 7 days: <b>${Object.values(f7).reduce((a, b) => a + b, 0)}</b> — ${line(f7)}</div>
      <button class="btn-primary dx-b" data-act="dx-owner">Send owner report to WhatsApp (demo)</button>`;
  };
  const _rr = renderReports; renderReports = function () { _rr(); DX.reportExtras(); };

  /* ---------- Actions ---------- */
  Object.assign(ACTIONS, {
    'dx-wa-open': DX.openWa, 'dx-wa-close': () => WA.close(), 'dx-wa-chip': (a) => DX.waSend(SAMPLES[+a.dataset.i]), 'dx-wa-ok': (a) => confirmWa(+a.dataset.i, true), 'dx-wa-no': (a) => confirmWa(+a.dataset.i, false),
    'dx-track': (a) => DX.openTracking(a.dataset.id), 'dx-track-close': () => TR.close(), 'dx-track-send': (a) => sendTracking(a.dataset.id), 'dx-rate': (a) => rate(a.dataset.id, +a.dataset.n),
    'dx-wa-send': doWaSend, 'dx-copy': () => DX.copy(DX._wa ? DX._wa.text : (DX._copy || '')), 'dx-owner': DX.openOwner,
    'dx-fin-range': (a) => { store.ui.finRange = +a.dataset.n; renderFinance(); }, 'dx-fin-csv': exportCsv,
  });
  bus.on('demo:reset', () => { store.wa = { messages: [], pending: null, typing: false }; renderWa(); });
})();
