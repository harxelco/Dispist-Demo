/* =========================================================================
   DISPIST DEMO v2c — foundation + Part A (COD tracker, failures, scenarios,
   sound, unread badges). Loaded after v2b.js. Shared helpers live on DX.
   Anything marked SIMULATED must be replaced by a real API/LLM call later.
========================================================================= */
const DX = {};
(function () {
  'use strict';
  const DAY = 864e5;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  Object.assign(DX, {
    DAY, esc,
    day0: (ts) => { const d = new Date(ts == null ? Date.now() : ts); d.setHours(0, 0, 0, 0); return d.getTime(); },
    d2s: (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    s2d: (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; },
    fmtD: (ts) => (ts ? new Date(ts).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'),
    hhmm: (ts) => new Date(ts).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
    normPhone: (raw) => { const m = /^(?:\+?254|0)([17]\d{8})$/.exec(String(raw || '').replace(/[\s-]/g, '')); return m ? '254' + m[1] : null; },
    localPhone: (n) => { const d = DX.normPhone(n); return d ? '0' + d.slice(3, 6) + ' ' + d.slice(6, 9) + ' ' + d.slice(9) : String(n || ''); },
    pad4: (n) => String(n).padStart(4, '0'),
    rng: (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    stat: (label, value, sub, color) => `<div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400)">${label}</div><div class="font-display font-bold text-xl dx-num"${color ? ` style="color:${color}"` : ''}>${value}</div>${sub ? `<div class="text-[11px] mt-1" style="color:var(--ink-400)">${sub}</div>` : ''}</div>`,
    views: {}, timers: [], stack: [],
    later: (fn, ms) => { const id = setTimeout(fn, ms); DX.timers.push(id); return id; },
  });

  /* ---------- Layers (slide-overs, editor, tracking sheet) + info-modal bottom sheet ---------- */
  DX.layer = (id, cls, label) => {
    const el = document.createElement('div');
    el.id = id; el.className = 'dx-layer ' + cls; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    document.body.appendChild(el);
    let opener = null;
    const api = {
      el,
      get isOpen() { return !el.hidden; },
      open(focusSel) {
        opener = document.activeElement; el.hidden = false;
        if (!DX.stack.includes(api)) DX.stack.push(api);
        setTimeout(() => { const f = (focusSel && el.querySelector(focusSel)) || el.querySelector('input:not([type=hidden]),textarea,select,button'); if (f) try { f.focus(); } catch (x) {} }, 40);
      },
      close() {
        if (el.hidden) return;
        el.hidden = true; DX.stack = DX.stack.filter((x) => x !== api);
        if (api.onClose) api.onClose();
        if (opener && document.contains(opener)) try { opener.focus(); } catch (x) {}
      },
    };
    return api;
  };
  const _openInfo = openInfo;
  openInfo = function (t, h, w) { infoModal.classList.remove('bsheet'); return _openInfo(t, h, w); }; // plain Phase-1 modals keep their look
  DX.sheet = (title, html, wide, focusSel) => {
    _openInfo(title, html, wide); infoModal.classList.add('bsheet');
    const f = focusSel && infoModal.querySelector(focusSel); if (f) try { f.focus(); } catch (x) {}
  };
  DX.closeSheet = () => closeInfo();
  DX.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Message copied', 'info'); }
    catch (err) {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        toast(ok ? 'Message copied' : 'Copy blocked — select the text and copy it manually', ok ? 'info' : 'warn');
      } catch (e2) { toast('Copy blocked — select the text and copy it manually', 'warn'); }
    }
  };

  /* ---------- Data model: history, COD, costs, invoices (all seeded, all in `store`) ---------- */
  const FEE = { 'CBD Express Delivery': [650, 850], 'Westlands Same-Day': [750, 1000], 'Industrial Area Route': [800, 1100], 'Mombasa Road Fleet': [1150, 1450], 'Thika Road Corridor': [900, 1150] };
  DX.kmFor = (area) => { const g = AREA_GEO[area]; return g ? Math.round(2 * km(DEPOT, { lat: g[0], lng: g[1] }) * 1.35 * 10) / 10 : 12; }; // round trip, road factor 1.35
  DX.feeFor = (area, urgency, r) => { const b = FEE[area] || [600, 900]; const base = b[0] + Math.round(((r != null ? r : Math.random()) * (b[1] - b[0])) / 10) * 10; return Math.max(350, Math.min(1800, base + (urgency === 'high' ? 250 : urgency === 'low' ? -50 : 0))); };
  DX.codLog = (en) => {
    en.id = 'c' + (store.cod.log.length + 1); store.cod.log.push(en);
    const a = store.cod.drivers[en.reg] || (store.cod.drivers[en.reg] = { collected: 0, remitted: 0, short: 0, written: 0 });
    if (en.type === 'collect') a.collected += en.amount;
    else if (en.type === 'remit') a.remitted += en.amount;
    else if (en.type === 'short') a.short += en.amount;
    else if (en.type === 'resolve') { a.short -= en.amount; if (en.how === 'paid') a.remitted += en.amount; else a.written += en.amount; }
    return en;
  };
  DX.codHeldFor = (reg) => { const a = store.cod.drivers[reg]; return a ? Math.max(0, a.collected - a.remitted - a.short - (a.written || 0)) : 0; };
  DX.codHeld = () => Object.keys(store.cod.drivers).reduce((s, r) => s + DX.codHeldFor(r), 0);
  DX.codHeldAt = (T) => store.cod.log.filter((x) => x.t <= T).reduce((s, x) => s + (x.type === 'collect' ? x.amount : x.type === 'remit' || x.type === 'short' ? -x.amount : 0), 0);

  DX.seed = function () {
    const now = Date.now(), t0 = DX.day0(now), r = DX.rng(20260921);
    store.costSettings = { driverPayPerDelivery: 150, fuelPerKm: 18, maintenancePerDay: 300, overheadPerDay: 1200 };
    store.settings.pay = { company: 'Nyati Logistics Hub', address: 'Enterprise Road, Nairobi', phone: '0700 000 000', email: 'accounts@example.co.ke', paybill: '123456', till: '', account: 'Invoice number', bank: '' };
    store.ui = store.ui || {}; Object.assign(store.ui, { finRange: 7, invQuery: '', invFilter: 'all', invDraft: null, trackId: null });
    store.unread = {};
    const wA = [['Thika Road Corridor', 0.3], ['CBD Express Delivery', 0.2], ['Industrial Area Route', 0.18], ['Westlands Same-Day', 0.17], ['Mombasa Road Fleet', 0.15]];
    const pickArea = () => { let x = r(), acc = 0; for (const [a, w] of wA) { acc += w; if (x < acc) return a; } return wA[0][0]; };
    const crew = store.drivers.filter((d) => d.status === 'ok'), reasons = ['Customer unreachable', 'Wrong address', 'Refused'];
    const hist = [];
    for (let off = 29; off >= 0; off--) {
      const day = t0 - off * DAY, wk = new Date(day).getDay(), cnt = Math.round((wk === 0 ? 4 : wk === 6 ? 6 : 9) + r() * 4);
      for (let i = 0; i < cnt; i++) {
        const ts = off === 0 ? t0 + r() * (now - t0) : day + (6 + r() * 12) * 36e5;
        const area = pickArea(), urg = r() < 0.15 ? 'high' : r() < 0.2 ? 'low' : 'med', dr = crew[Math.floor(r() * crew.length)], bad = r() < 0.06;
        hist.push({ date: ts, client: CLIENTS[Math.floor(r() * CLIENTS.length)], area, urgency: urg, reg: dr.reg, driver: dr.name, km: DX.kmFor(area),
          fee: bad ? 0 : DX.feeFor(area, urg, r()), status: bad ? 'Failed' : 'Delivered', reason: bad ? reasons[Math.floor(r() * 3)] : '',
          codAmount: r() < 0.4 ? (1 + Math.floor(r() * 9)) * 500 : 0, onTime: bad ? false : r() > 0.1, invoiceId: null });
      }
    }
    hist.sort((a, b) => a.date - b.date).forEach((h, i) => { h.id = 'ORD-' + DX.pad4(100 + i); });
    store.history = hist;
    // COD ledger from history: collected on delivery, remitted the same evening — except today and one short remittance yesterday
    store.cod = { drivers: {}, log: [] };
    store.drivers.forEach((d) => { store.cod.drivers[d.reg] = { collected: 0, remitted: 0, short: 0, written: 0 }; });
    hist.filter((h) => h.status === 'Delivered' && h.codAmount).forEach((h) => DX.codLog({ t: h.date, reg: h.reg, type: 'collect', amount: h.codAmount, ref: h.id }));
    const by = {};
    hist.filter((h) => h.status === 'Delivered' && h.codAmount && h.date < t0).forEach((h) => { const k = h.reg + '|' + DX.day0(h.date); by[k] = (by[k] || 0) + h.codAmount; });
    const yday = t0 - DAY; let shortReg = null, best = 0;
    Object.keys(by).forEach((k) => { const [reg, d] = k.split('|'); if (+d === yday && by[k] > best) { best = by[k]; shortReg = reg; } });
    if (!shortReg) { shortReg = crew[1].reg; }
    if (best < 600) { DX.codLog({ t: yday + 14 * 36e5, reg: shortReg, type: 'collect', amount: 1500, ref: 'ORD-ADJ' }); by[shortReg + '|' + yday] = (by[shortReg + '|' + yday] || 0) + 1500; }
    Object.keys(by).sort().forEach((k) => {
      const [reg, d] = k.split('|'), day = +d, tot = by[k], t = day + 18.5 * 36e5;
      if (day === yday && reg === shortReg) {
        DX.codLog({ t, reg, type: 'remit', amount: tot - 300, ref: 'Evening handover' });
        DX.codLog({ t: t + 6e4, reg, type: 'short', amount: 300, status: 'open', expected: tot, received: tot - 300, ref: 'Evening handover' });
      } else DX.codLog({ t, reg, type: 'remit', amount: tot, ref: 'Evening handover' });
    });
    store.cod.log.sort((a, b) => a.t - b.t);
    // invoices (synthetic lines so Finance receivables are populated on first load)
    const rr = DX.rng(77);
    const spec = [['Highland Foods Ltd', 40, 14, 'paid', 30], ['Bowip Agencies', 33, 14, 'paid', 25], ['Pioneer Hardware', 52, 14, 'sent'], ['Savannah Wholesalers', 45, 14, 'sent'],
      ['Continental Traders', 38, 14, 'sent'], ['Zuri Distributors', 20, 7, 'sent'], ['Nyati Logistics Hub', 12, 7, 'sent'], ['Highland Foods Ltd', 6, 14, 'sent'], ['Bowip Agencies', 2, 14, 'draft'], ['Pioneer Hardware', 3, 30, 'sent']];
    store.invoices = spec.map(([client, ago, net, status, paidAgo], i) => {
      const issue = t0 - ago * DAY, areas = Object.keys(FEE), a1 = areas[Math.floor(rr() * 5)], a2 = areas[Math.floor(rr() * 5)];
      const book = DX.clientBook(client) || {};
      return { number: 'INV-' + DX.pad4(i + 1), client, phone: book.phone || '', email: book.email || '', address: book.address || 'Nairobi, Kenya', issue, due: issue + net * DAY,
        items: [{ desc: 'Delivery services — ' + a1, qty: 4 + Math.floor(rr() * 12), rate: 900 + Math.floor(rr() * 6) * 100 }, { desc: 'Delivery services — ' + a2, qty: 3 + Math.floor(rr() * 8), rate: 800 + Math.floor(rr() * 6) * 100 }],
        discount: { type: 'amt', value: 0 }, vat: i % 3 === 0, notes: 'Payment due within the stated terms. Thank you for your business.', status,
        sentAt: status === 'draft' ? null : issue + 36e5, channel: status === 'draft' ? null : i % 2 ? 'WhatsApp' : 'Email', paidAt: status === 'paid' ? t0 - paidAgo * DAY : null, orderIds: [] };
    });
    store.invoiceSeq = spec.length + 1;
  };
  Object.defineProperty(store, 'expenses', { get: () => DX.expensesByDay(30) }); // derived from costSettings + history, never stored
  DX.expensesByDay = (n) => { const c = store.costSettings, t0 = DX.day0(), out = [];
    for (let i = n - 1; i >= 0; i--) { const f = t0 - i * DAY, rows = store.history.filter((h) => h.status === 'Delivered' && h.date >= f && h.date < f + DAY);
      out.push({ date: f, driverPay: rows.length * c.driverPayPerDelivery, fuel: rows.reduce((s, h) => s + h.km, 0) * c.fuelPerKm, maintenance: c.maintenancePerDay, overhead: c.overheadPerDay }); }
    return out; };

  /* ---------- Invoice helpers shared by Finance (v2d) and Invoices (v2e) ---------- */
  DX.invTotals = (inv) => {
    const sub = (inv.items || []).reduce((a, l) => a + (+l.qty || 0) * (+l.rate || 0), 0), d = inv.discount || {}, dv = +d.value || 0;
    const disc = Math.min(sub, d.type === 'pct' ? (sub * dv) / 100 : dv), taxable = sub - disc, vat = inv.vat ? Math.round(taxable * 0.16 * 100) / 100 : 0;
    return { sub, disc: Math.round(disc * 100) / 100, taxable, vat, total: Math.round((taxable + vat) * 100) / 100 };
  };
  DX.daysPast = (inv) => Math.round((DX.day0() - DX.day0(inv.due)) / DAY);
  DX.invStatus = (inv) => (inv.status === 'paid' ? 'paid' : inv.status === 'draft' ? 'draft' : DX.daysPast(inv) >= 1 ? 'overdue' : 'sent'); // Sent past due => Overdue, live
  DX.invBadge = (s) => `<span class="badge ${{ draft: 'badge-dispatched', sent: 'badge-transit', paid: 'badge-delivered', overdue: 'badge-cancelled' }[s]}">${s[0].toUpperCase() + s.slice(1)}</span>`;
  DX.outstandingAt = (T) => store.invoices.filter((i) => i.status !== 'draft' && i.issue <= T && !(i.status === 'paid' && i.paidAt <= T)).reduce((s, i) => s + DX.invTotals(i).total, 0);
  DX.clientBook = (name) => {
    const key = String(name || '').trim().toLowerCase(); if (!key) return null;
    const prev = (store.invoices || []).slice().reverse().find((i) => i.client.toLowerCase() === key && (i.phone || i.email));
    if (prev) return { name: prev.client, phone: prev.phone, email: prev.email, address: prev.address };
    const known = CLIENTS.find((c) => c.toLowerCase() === key);
    if (known) { const m = ensureOrderMeta({ id: 'CLIENT', client: known }); return { name: known, phone: m.contact, email: m.email, address: 'Nairobi, Kenya' }; }
    return null;
  };

  /* ---------- Orders helper used by scenarios + intake ---------- */
  DX.makeOrder = (over) => Object.assign({ id: 'ORD-' + orderSeq++, client: rand(CLIENTS), area: rand(AREAS), urgency: rand(URGENCY), items: Math.floor(Math.random() * 8) + 1,
    codAmount: Math.random() < 0.4 ? (1 + Math.floor(Math.random() * 9)) * 500 : 0, createdAt: Date.now(), source: 'Web' }, over || {});
  DX.addOrder = (o) => { ensureOrderMeta(o); store.orders.unshift(o); audit(o.id, `Order received via ${o.source}${o.flag ? ' — flagged ' + o.flag : ''}`); renderOrders(); bus.emit('order:created', o); return o; };

  /* ---------- Panels + nav (sidebar AND mobile drawer) ---------- */
  Object.assign(VIEW_META, {
    cash: { title: 'Cash', subtitle: 'Cash on delivery — collected, held and remitted' },
    finance: { title: 'Finance', subtitle: 'Revenue, costs, profit and receivables · live from your data' },
    invoices: { title: 'Invoices', subtitle: 'Create, send and track invoices' },
  });
  const contact = document.getElementById('view-contact');
  ['cash', 'finance', 'invoices'].forEach((v) => {
    const s = document.createElement('section'); s.id = 'view-' + v; s.className = 'view-panel hidden flex-1 overflow-y-auto p-4 md:p-6'; contact.parentElement.insertBefore(s, contact);
  });
  const ICON = {
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    finance: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    invoices: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>',
  };
  [['#appRoot aside nav', 'px-3.5 py-2.5 text-[13.5px]', 16], ['#mobileDrawer nav', 'px-3.5 py-3 text-[14px]', 17]].forEach(([sel, sz, ic]) => {
    const nav = document.querySelector(sel), before = nav.querySelector('[data-view="reports"]');
    [['cash', 'Cash'], ['finance', 'Finance'], ['invoices', 'Invoices']].forEach(([v, label]) => {
      const a = document.createElement('a'); a.className = `nav-item flex items-center gap-2.5 ${sz} rounded-lg font-medium`; a.href = '#'; a.dataset.view = v;
      a.setAttribute('onclick', `return switchView('${v}');`);
      a.innerHTML = `<svg width="${ic}" height="${ic}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICON[v]}</svg>${label}`;
      nav.insertBefore(a, before);
    });
  });
  document.querySelectorAll('[data-view]').forEach((el) => { const b = document.createElement('span'); b.className = 'nav-badge'; b.dataset.badge = el.dataset.view; b.hidden = true; el.appendChild(b); });
  DX.paintBadges = () => document.querySelectorAll('[data-badge]').forEach((b) => { const n = (store.unread || {})[b.dataset.badge] || 0; b.hidden = !n; b.textContent = n > 9 ? '9+' : n; });
  DX.bump = (v) => { if (currentView !== v) { store.unread[v] = (store.unread[v] || 0) + 1; DX.paintBadges(); } };

  /* ---------- Header: Demo Tools + mute (desktop in header, <1024px in a strip under it) ---------- */
  const bell = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const toolsHtml = `<button class="btn-ghost dx-b" data-act="dx-menu" aria-haspopup="menu" aria-expanded="false">Demo Tools ▾</button>
    <button class="btn-ghost dx-b dx-icon" data-act="dx-mute" aria-pressed="false" aria-label="Mute order alerts" title="Mute order alerts">${bell}</button>`;
  const hdr = document.querySelector('header > div:last-child');
  const ht = document.createElement('div'); ht.className = 'dx-htools'; ht.innerHTML = toolsHtml; hdr.prepend(ht);
  const mb = document.createElement('div'); mb.className = 'dx-mbar'; mb.innerHTML = toolsHtml; document.querySelector('header').after(mb);
  const bar = document.createElement('div'); bar.className = 'dx-toolbar';
  bar.innerHTML = '<button class="dx-wa-btn dx-b" data-act="dx-wa-open"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg> WhatsApp Intake</button>';
  document.getElementById('view-dispatch').prepend(bar);
  const menu = document.createElement('div'); menu.id = 'dxMenu'; menu.className = 'dx-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  menu.innerHTML = [['dx-sc-rush', 'Rush hour', '15–25 orders land over ~20 seconds'], ['dx-sc-breakdown', 'Driver breakdown', 'Driver goes red, job returns to Incoming'], ['dx-sc-unreach', 'Customer unreachable', 'Failed drop, rescheduled automatically'],
    ['dx-owner', 'Owner report', 'WhatsApp-style daily summary'], ['dx-sc-reset', 'Reset demo', 'Back to a clean starting state']].map(([a, t, s]) => `<button role="menuitem" data-act="${a}" class="dx-mi"><b>${t}</b><span>${s}</span></button>`).join('');
  document.body.appendChild(menu);
  const closeMenu = () => { menu.hidden = true; document.querySelectorAll('[data-act="dx-menu"]').forEach((b) => b.setAttribute('aria-expanded', 'false')); };

  /* ---------- Sound (Web Audio, graceful when blocked) ---------- */
  DX.muted = false; let lastBeep = 0, audioWarned = false;
  DX.beep = () => {
    if (DX.muted || Date.now() - lastBeep < 1500) return; lastBeep = Date.now();
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) throw new Error('no audio');
      DX.ac = DX.ac || new C(); if (DX.ac.state === 'suspended') DX.ac.resume();
      [[880, 0], [1175, 0.14]].forEach(([f, d]) => { const o = DX.ac.createOscillator(), g = DX.ac.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(DX.ac.destination);
        const t = DX.ac.currentTime + d; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.start(t); o.stop(t + 0.2); });
    } catch (err) { if (!audioWarned) { audioWarned = true; toast('Sound is blocked by this browser — tap the page once to enable alerts', 'info'); } }
  };
  document.addEventListener('pointerdown', () => { try { if (DX.ac && DX.ac.state === 'suspended') DX.ac.resume(); } catch (x) {} }, { once: false, passive: true });
  DX.syncMute = () => document.querySelectorAll('[data-act="dx-mute"]').forEach((b) => { b.setAttribute('aria-pressed', String(DX.muted)); b.style.opacity = DX.muted ? '.45' : '1'; b.title = DX.muted ? 'Unmute order alerts' : 'Mute order alerts'; });

  /* ---------- COD tracker ---------- */
  function renderCash() {
    const host = document.getElementById('view-cash'); if (!host) return;
    const t0 = DX.day0(), log = store.cod.log, sum = (f) => log.filter(f).reduce((a, x) => a + x.amount, 0);
    const col = sum((x) => x.type === 'collect' && x.t >= t0), rem = sum((x) => x.type === 'remit' && x.t >= t0), held = DX.codHeld();
    const open = log.filter((x) => x.type === 'short' && x.status === 'open'), openAmt = open.reduce((a, x) => a + x.amount, 0);
    const rows = store.drivers.filter((d) => d.status !== 'maintenance').map((d) => {
      const a = store.cod.drivers[d.reg] || { collected: 0, remitted: 0 }, h = DX.codHeldFor(d.reg), dis = open.filter((x) => x.reg === d.reg);
      const ct = sum((x) => x.reg === d.reg && x.type === 'collect' && x.t >= t0), rt = sum((x) => x.reg === d.reg && x.type === 'remit' && x.t >= t0);
      const st = dis.length ? '<span class="badge badge-cancelled">Discrepancy</span>' : h > 0 ? '<span class="badge badge-transit">Holding cash</span>' : '<span class="badge badge-delivered">Settled</span>';
      const acts = (h > 0 ? `<button class="btn-primary dx-b" data-act="dx-remit" data-reg="${esc(d.reg)}">Mark as remitted</button>` : '') + (dis.length ? `<button class="btn-ghost dx-b" data-act="dx-review" data-reg="${esc(d.reg)}">Review</button>` : '');
      return `<tr><td data-label="Driver"><b>${esc(d.name)}</b> <span style="color:var(--ink-400)">· ${esc(d.reg)}</span></td><td data-label="Collected today" class="dx-num">${kes(ct)}</td><td data-label="Remitted today" class="dx-num">${kes(rt)}</td>
        <td data-label="Outstanding" class="dx-num font-medium">${kes(h)}</td><td data-label="Status">${st}</td><td class="dx-acts">${acts || '<span style="color:var(--ink-400);font-size:12px">—</span>'}</td></tr>`;
    }).join('');
    const recent = log.slice(-8).reverse().map((x) => {
      const dr = store.drivers.find((d) => d.reg === x.reg), lab = { collect: 'Collected', remit: 'Remitted', short: 'Short by', resolve: x.how === 'paid' ? 'Shortfall paid' : 'Written off' }[x.type];
      return `<div class="route-row"><span>${esc(dr ? dr.name : x.reg)} · ${lab}${x.ref ? ' <span style="color:var(--ink-400)">(' + esc(x.ref) + ')</span>' : ''}</span><span class="font-medium dx-num">${kes(x.amount)} <span style="color:var(--ink-400);font-weight:400">${fmtT(x.t)}</span></span></div>`;
    }).join('');
    host.innerHTML = `<div class="dx-hero"><h2>No more cash leaking between rider and office.</h2><p>Every COD shilling is logged the moment a delivery completes, and stays on the driver’s tab until you confirm the handover.</p></div>
      <div class="dx-grid4 mb-4">${DX.stat('Collected today', kes(col), 'from completed COD deliveries')}${DX.stat('Held by drivers', kes(held), 'not yet handed over', held ? 'var(--brand-orange-600)' : '')}${DX.stat('Remitted today', kes(rem), 'confirmed at the office')}${DX.stat('Discrepancies', open.length ? kes(openAmt) : 'None', open.length + ' open', open.length ? 'var(--red-500)' : 'var(--green-600)')}</div>
      <div class="card data-table-wrap dx-wrapcard mb-4"><table class="data-table dx-stack"><thead><tr><th>Driver</th><th>Collected today</th><th>Remitted today</th><th>Outstanding</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="dx-card"><div class="dx-h">Recent cash activity</div>${recent || '<div class="text-[12.5px]" style="color:var(--ink-400)">No cash movements yet.</div>'}</div>`;
  }
  DX.views.cash = renderCash;
  function openRemit(reg) {
    const dr = store.drivers.find((d) => d.reg === reg), out = DX.codHeldFor(reg); if (!dr || out <= 0) { toast('Nothing outstanding for this driver', 'info'); return; }
    DX.sheet('Confirm cash handover', `<div class="text-[12.5px] p-2.5 rounded-lg mb-2" style="background:var(--paper)"><b>${esc(dr.name)}</b> · ${esc(reg)}<br>Outstanding: <b>${kes(out)}</b></div>
      <label class="dx-lbl" for="rmAmt">Amount received at the office (KES)</label><input id="rmAmt" class="dx-in" type="number" inputmode="numeric" min="1" max="${out}" value="${out}" data-max="${out}">
      <div id="rmWarn" class="dx-note"></div><div id="rmErr" class="dx-err" role="alert"></div>
      <div class="dx-btnrow"><button class="btn-primary dx-b" data-act="dx-remit-ok" data-reg="${esc(reg)}">Confirm remitted</button></div>`, false, '#rmAmt');
  }
  function confirmRemit(reg) {
    const inp = document.getElementById('rmAmt'), amt = Number(inp.value), out = DX.codHeldFor(reg), err = document.getElementById('rmErr');
    if (!Number.isFinite(amt) || amt <= 0) { err.textContent = 'Enter the amount actually received.'; return; }
    if (amt > out) { err.textContent = 'That is more than the driver is holding (' + kes(out) + ').'; return; }
    const dr = store.drivers.find((d) => d.reg === reg), now = Date.now();
    DX.codLog({ t: now, reg, type: 'remit', amount: amt, ref: 'Office handover' });
    if (amt < out) DX.codLog({ t: now, reg, type: 'short', amount: out - amt, status: 'open', expected: out, received: amt, ref: 'Office handover' });
    audit('COD', `${dr.name} remitted ${kes(amt)}${amt < out ? ` — SHORT by ${kes(out - amt)}, discrepancy opened` : ' — settled'}`);
    DX.closeSheet(); bus.emit('cod:changed'); toast(amt < out ? `Recorded ${kes(amt)} — <b>${kes(out - amt)} short</b>, flagged for review` : `${esc(dr.name)} is settled — ${kes(amt)} remitted`, amt < out ? 'warn' : 'success');
  }
  function openReview(reg) {
    const dr = store.drivers.find((d) => d.reg === reg), list = store.cod.log.filter((x) => x.type === 'short' && x.status === 'open' && x.reg === reg); if (!list.length) return;
    DX.sheet('Review discrepancy', list.map((x) => `<div class="p-3 rounded-lg mb-3" style="border:1px solid rgba(179,38,30,.3);background:rgba(179,38,30,.05)"><div class="text-[13px]"><b>${esc(dr.name)}</b> · ${esc(reg)}</div>
      ${kv([['Expected', kes(x.expected)], ['Received', kes(x.received)], ['Short by', `<span style="color:var(--red-500)">${kes(x.amount)}</span>`], ['Logged', fmtT(x.t)]])}
      <div class="dx-btnrow"><button class="btn-primary dx-b" data-act="dx-short-paid" data-id="${x.id}">Driver paid the difference</button><button class="btn-ghost dx-b" data-act="dx-short-off" data-id="${x.id}">Write off</button></div></div>`).join(''));
  }
  function resolveShort(id, how) {
    const x = store.cod.log.find((l) => l.id === id && l.type === 'short' && l.status === 'open'); if (!x) return;
    x.status = 'resolved'; DX.codLog({ t: Date.now(), reg: x.reg, type: 'resolve', amount: x.amount, how, ref: 'Shortfall ' + x.id });
    audit('COD', `Discrepancy of ${kes(x.amount)} (${x.reg}) ${how === 'paid' ? 'repaid by driver' : 'written off'}`);
    DX.closeSheet(); bus.emit('cod:changed'); toast(how === 'paid' ? 'Difference received — discrepancy closed' : 'Discrepancy written off and logged', 'info');
  }
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'rmAmt') return; const w = document.getElementById('rmWarn'), v = Number(ev.target.value), max = Number(ev.target.dataset.max);
    w.textContent = v > 0 && v < max ? `${kes(max - v)} short — a discrepancy will be logged for review.` : '';
  });

  /* ---------- Completed deliveries: history row + COD (single place, via the bus) ---------- */
  bus.on('dispatch:status', (d) => {
    if (d.statusKey !== 'delivered' || d.finalized) return; d.finalized = true;
    d.fee = d.fee || DX.feeFor(d.area, d.urgency); d.km = DX.kmFor(d.area);
    store.history.push({ id: d.orderId || d.id, dispatchId: d.id, date: d.finishedAt || Date.now(), client: d.client, area: d.area, reg: d.reg, driver: d.driver, fee: d.fee, km: d.km, urgency: d.urgency || 'med', status: 'Delivered', reason: '', codAmount: d.codAmount || 0, onTime: true, invoiceId: null });
    if (d.codAmount > 0) {
      DX.codLog({ t: Date.now(), reg: d.reg, type: 'collect', amount: d.codAmount, ref: d.orderId || d.id });
      audit(d.orderId || d.id, `COD ${kes(d.codAmount)} collected by ${d.driver} — added to cash held`);
      DX.bump('cash'); toast(`Cash held: <b>${kes(d.codAmount)}</b> collected by ${esc(d.driver)}`, 'info'); bus.emit('cod:changed');
    }
  });

  /* ---------- Failures, breakdown, scenarios ---------- */
  DX.fail = (id, reason, opt) => {
    opt = opt || {}; const i = store.dispatches.findIndex((x) => x.id === id); if (i < 0) return null; const d = store.dispatches[i]; if (d.statusKey === 'delivered') return null;
    store.dispatches.splice(i, 1);
    const o = { id: d.orderId || 'ORD-' + orderSeq++, client: d.client, area: d.area, urgency: d.urgency || 'med', items: d.items || 1, contact: d.contact, email: d.email, codAmount: d.codAmount || 0,
      source: d.source || 'Web', createdAt: Date.now(), flag: opt.flag || 'Rescheduled', failReason: reason, itemType: d.itemType };
    if (opt.suggest) { const s = suggestDriver(o); o.suggestion = s ? 'Suggested: ' + s.reason : 'No free driver — assign when one frees up'; }
    store.history.push({ id: o.id, dispatchId: d.id, date: Date.now(), client: d.client, area: d.area, reg: d.reg, driver: d.driver, fee: 0, km: 0, urgency: o.urgency, status: 'Failed', reason, codAmount: o.codAmount, onTime: false, invoiceId: null });
    audit(o.id, `Delivery failed (${reason}) — ${d.driver} freed, order back in Incoming as ${o.flag}`);
    if (selectedDispatchId === d.id) { selectedDispatchId = null; renderPhone(); }
    store.orders.unshift(o); renderOrders(); renderDispatches(); nudgeFleetUtilization(-3);
    bus.emit('dispatch:failed', { dispatch: d, order: o, reason }); bus.emit('order:created', o);
    return o;
  };
  DX.failStats = (from) => { const r = {}; store.history.filter((h) => h.status === 'Failed' && h.date >= from).forEach((h) => { r[h.reason || 'Other'] = (r[h.reason || 'Other'] || 0) + 1; }); return r; };
  function openFail(id) {
    const d = store.dispatches.find((x) => x.id === id); if (!d) return;
    DX.sheet('Mark delivery as failed', `<div class="text-[12.5px] mb-2"><b>${esc(d.orderId || d.id)}</b> · ${esc(d.client)} · ${esc(d.driver)}</div>${['Customer unreachable', 'Wrong address', 'Refused', 'Other'].map((r, i) => `<label class="drv-row mb-2"><input type="radio" name="frs" value="${r}" ${i ? '' : 'checked'}><span class="text-[13.5px] font-medium">${r}</span></label>`).join('')}
      <p class="dx-note">The job returns to Incoming flagged “Rescheduled”, the driver is freed, and it counts in failure stats.</p><div class="dx-btnrow"><button class="btn-primary dx-b" data-act="dx-fail-ok" data-id="${esc(id)}">Confirm failed delivery</button></div>`);
  }
  DX.spawnDispatch = () => { const o = DX.makeOrder({ source: 'Demo' }); ensureOrderMeta(o); const s = suggestDriver(o); if (!s) return null; store.orders.unshift(o); return createDispatch(o, s.driver, 'auto', s.reason); };
  const scen = {
    rush() {
      const n = 15 + Math.floor(Math.random() * 11);
      toast(`<b>Rush hour:</b> ${n} orders landing over ~20 seconds. Watch Incoming fill up, then batch-assign.`, 'warn');
      for (let i = 0; i < n; i++) DX.later(() => { DX.addOrder(DX.makeOrder({ source: 'Rush hour' })); if (i === n - 1) toast(`Rush hour done — <b>${n}</b> orders waiting. Dispist matches drivers in one click each.`, 'info'); }, 400 + i * (20000 / n) + Math.random() * 300);
    },
    breakdown() {
      let d = store.dispatches.find((x) => x.statusKey === 'transit') || store.dispatches.find((x) => x.statusKey === 'dispatched');
      if (!d) { d = DX.spawnDispatch(); if (!d) { toast('No free driver to break down — try Reset demo.', 'warn'); return; } driverStep(d.id, 'start'); }
      const dr = store.drivers.find((x) => x.reg === d.reg); dr.status = 'breakdown';
      const o = DX.fail(d.id, 'Vehicle breakdown', { flag: 'Reassign', suggest: true });
      toast(`<b>Breakdown:</b> ${esc(dr.name)} (${esc(dr.reg)}) is down and shows red on the Fleet map. ${esc(o.id)} is back in Incoming — ${esc(o.suggestion)}.`, 'warn');
    },
    unreach() {
      let d = store.dispatches.find((x) => x.statusKey !== 'delivered') || DX.spawnDispatch(); if (!d) { toast('No free driver — try Reset demo.', 'warn'); return; }
      if (!d.steps.start) driverStep(d.id, 'start'); if (!d.steps.arrived) driverStep(d.id, 'arrived');
      toast(`<b>${esc(d.driver)}</b> reached ${esc(d.client)} — customer is not answering…`, 'info');
      DX.later(() => { const o = DX.fail(d.id, 'Customer unreachable'); if (o) toast(`<b>Customer unreachable:</b> ${esc(o.id)} is back in Incoming as <b>Rescheduled</b>, ${esc(d.driver)} is free for the next job.`, 'warn'); }, 1600);
    },
    reset() {
      DX.timers.forEach(clearTimeout); DX.timers = [];
      store.orders = []; store.dispatches.length = 0; selectedDispatchId = null; store.auditLog.length = 0; orderSeq = 1004; dispatchSeq = 3000; availableDrivers = [...DRIVERS];
      store.drivers.forEach((d, i) => { d.status = FLEET_SEED[i][3]; d.jobs = FLEET_SEED[i][4]; d.pos = { ...d.home }; d.trail = []; });
      DX.seed(); DX.layers_closeAll(); bus.emit('demo:reset');
      simulateNewOrder(); simulateNewOrder(); renderOrders(); renderDispatches(); renderPhone(); DX.paintBadges();
      const f = DX.views[currentView]; if (f) f(); if (currentView === 'fleet') renderFleet(); if (currentView === 'orders') renderOrdersView(); if (currentView === 'reports') renderReports();
      toast('Demo reset — fresh orders, fleet and 30 days of finance data.', 'info');
    },
  };
  DX.layers_closeAll = () => { DX.stack.slice().forEach((l) => l.close()); try { DX.closeSheet(); } catch (x) {} };

  /* ---------- Settings: cost model + payment details ---------- */
  DX.mountSettings = () => {
    const host = document.getElementById('view-settings'); let box = document.getElementById('dxSettings');
    if (!box) { box = document.createElement('div'); box.id = 'dxSettings'; box.className = 'max-w-xl mt-4'; host.appendChild(box); }
    const c = store.costSettings, p = store.settings.pay;
    const num = (path, label, v) => `<div><label class="dx-lbl" for="s_${path}">${label}</label><input id="s_${path}" class="dx-in" type="number" inputmode="decimal" min="0" data-path="${path}" value="${v}"></div>`;
    const txt = (path, label, v, ph) => `<div><label class="dx-lbl" for="s_${path}">${label}</label><input id="s_${path}" class="dx-in" type="text" data-path="${path}" value="${esc(v)}" placeholder="${esc(ph || '')}"></div>`;
    box.innerHTML = `<div class="card p-5 mb-4"><h3 class="font-display font-semibold text-sm">Cost settings (profit model)</h3><p class="dx-note">Used live by the Finance dashboard. Changes apply immediately.</p>
      <div class="dx-two">${num('cost.driverPayPerDelivery', 'Driver pay per delivery (KES)', c.driverPayPerDelivery)}${num('cost.fuelPerKm', 'Fuel per km (KES)', c.fuelPerKm)}${num('cost.maintenancePerDay', 'Maintenance per day (KES)', c.maintenancePerDay)}${num('cost.overheadPerDay', 'Overhead per day (KES)', c.overheadPerDay)}</div></div>
      <div class="card p-5 mb-4"><h3 class="font-display font-semibold text-sm">Invoice &amp; payment details</h3><p class="dx-note">Placeholders — replace with your real M-Pesa and bank details. Shown on every invoice.</p>
      <div class="dx-two">${txt('pay.company', 'Company name', p.company)}${txt('pay.phone', 'Phone', p.phone)}${txt('pay.email', 'Email', p.email)}${txt('pay.address', 'Address', p.address)}${txt('pay.paybill', 'M-Pesa Paybill', p.paybill, '123456')}${txt('pay.till', 'M-Pesa Till (optional)', p.till)}${txt('pay.account', 'Account reference', p.account)}${txt('pay.bank', 'Bank details (optional)', p.bank, 'Bank · Account · Branch')}</div></div>`;
  };
  document.addEventListener('change', (ev) => {
    const path = ev.target.dataset && ev.target.dataset.path; if (!path || !ev.target.closest('#dxSettings')) return;
    const [grp, key] = path.split('.');
    if (grp === 'cost') { const v = Number(ev.target.value); if (!Number.isFinite(v) || v < 0) { toast('Enter a number of 0 or more.', 'warn'); DX.mountSettings(); return; } store.costSettings[key] = v; }
    else store.settings.pay[key] = ev.target.value.trim();
    bus.emit('settings:changed'); toast('Saved — Finance and invoices now use this value', 'info');
  });

  /* ---------- Wrapping the v1/v2 renderers ---------- */
  const _rd = renderDispatches;
  renderDispatches = function () {
    _rd();
    store.dispatches.forEach((d) => {
      const c = document.getElementById('dispatch-' + d.id); if (!c) return;
      const done = d.statusKey === 'delivered', row = document.createElement('div'); row.className = 'dx-card-actions';
      const meta = [d.codAmount ? `COD ${kes(d.codAmount)}` : '', d.source && d.source !== 'Web' ? 'via ' + d.source : '', d.rating ? '★'.repeat(d.rating) : ''].filter(Boolean);
      if (meta.length) { const m = document.createElement('div'); m.className = 'text-[11px] mt-2'; m.style.color = 'var(--ink-600)'; m.textContent = meta.join(' · '); c.appendChild(m); }
      row.innerHTML = `<button class="btn-ghost dx-b" data-act="dx-track" data-id="${esc(d.id)}">Customer tracking link</button>` +
        (done ? `<button class="btn-primary dx-b" data-act="dx-create-inv" data-id="${esc(d.id)}">Create invoice</button>` : `<button class="btn-ghost dx-b" style="color:var(--red-500)" data-act="dx-fail" data-id="${esc(d.id)}">Mark failed</button>`);
      c.appendChild(row);
    });
  };
  const _ro = renderOrders;
  renderOrders = function () {
    _ro();
    store.orders.forEach((o) => {
      const card = document.getElementById('order-' + o.id); if (!card) return;
      const tags = []; if (o.source === 'WhatsApp') tags.push('<span class="dx-tag wa">via WhatsApp</span>');
      if (o.flag) tags.push(`<span class="dx-tag ${o.flag === 'Reassign' ? 'red' : 'warn'}">${esc(o.flag)}</span>`);
      if (o.codAmount) tags.push(`<span class="dx-tag" style="background:rgba(30,30,40,.07)">COD ${kes(o.codAmount)}</span>`);
      if (!tags.length && !o.suggestion) return;
      const w = document.createElement('div'); w.className = 'flex flex-wrap gap-1.5 mb-2'; w.innerHTML = tags.join('') + (o.suggestion ? `<div class="text-[11px] w-full" style="color:var(--ink-600)">${esc(o.suggestion)}</div>` : '');
      card.insertBefore(w, card.children[3] || null);
    });
  };
  const _sno = simulateNewOrder;
  simulateNewOrder = function () { _sno(); const o = store.orders[0]; if (o && !o._seen) { o._seen = true; if (o.codAmount === undefined) o.codAmount = Math.random() < 0.4 ? (1 + Math.floor(Math.random() * 9)) * 500 : 0; audit(o.id, 'Order received via Web'); renderOrders(); bus.emit('order:created', o); } };
  const _rfl = renderFleet;
  renderFleet = function () {
    _rfl(); const down = store.drivers.filter((d) => d.status === 'breakdown');
    down.forEach((dr) => { const row = [...document.querySelectorAll('#fleetTableBody tr')].find((tr) => tr.firstElementChild.textContent.trim() === dr.reg); if (row) { row.children[2].innerHTML = '<span class="badge badge-cancelled">Breakdown</span>'; row.children[3].textContent = 'Needs recovery'; } });
    const av = document.querySelector('#fleetSummary .stat-card:nth-child(2) .font-display'); if (av && down.length) av.textContent = Math.max(0, Number(av.textContent) - down.length);
  };
  const _sv = switchView;
  switchView = function (v) {
    const r = _sv(v); if (!VIEW_META[v]) return r;
    store.unread[v] = 0; DX.paintBadges(); closeMenu();
    if (v === 'settings') DX.mountSettings(); const f = DX.views[v]; if (f) f();
    return r;
  };

  /* ---------- Actions (capture phase so buttons inside clickable cards never also select the card) ---------- */
  Object.assign(ACTIONS, {
    'dx-menu': (a) => { const open = menu.hidden; closeMenu(); if (!open) return; const r = a.getBoundingClientRect(); menu.style.top = r.bottom + 6 + 'px'; menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; menu.style.left = 'auto'; menu.hidden = false; a.setAttribute('aria-expanded', 'true'); const f = menu.querySelector('button'); if (f) f.focus(); },
    'dx-mute': () => { DX.muted = !DX.muted; DX.syncMute(); toast(DX.muted ? 'Order alerts muted' : 'Order alerts on', 'info'); if (!DX.muted) DX.beep(); },
    'dx-sc-rush': scen.rush, 'dx-sc-breakdown': scen.breakdown, 'dx-sc-unreach': scen.unreach, 'dx-sc-reset': scen.reset,
    'dx-remit': (a) => openRemit(a.dataset.reg), 'dx-remit-ok': (a) => confirmRemit(a.dataset.reg),
    'dx-review': (a) => openReview(a.dataset.reg), 'dx-short-paid': (a) => resolveShort(a.dataset.id, 'paid'), 'dx-short-off': (a) => resolveShort(a.dataset.id, 'off'),
    'dx-fail': (a) => openFail(a.dataset.id),
    'dx-fail-ok': (a) => { const r = (document.querySelector('input[name=frs]:checked') || {}).value || 'Other'; const o = DX.fail(a.dataset.id, r); DX.closeSheet(); if (o) toast(`<b>${esc(o.id)}</b> marked failed (${esc(r)}) — back in Incoming as Rescheduled, driver freed`, 'warn'); },
    'dx-goto': (a) => { DX.layers_closeAll(); switchView(a.dataset.view); },
  });
  let escSkip = false;
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') escSkip = !!document.querySelector('#infoModal.open,#assignModal.open'); }, true);
  document.addEventListener('keydown', (ev) => {
    const top = DX.stack[DX.stack.length - 1];
    if (ev.key === 'Escape') { if (!menu.hidden) { closeMenu(); return; } if (!escSkip && top) top.close(); }
    if (ev.key === 'Tab' && top && !document.querySelector('#infoModal.open,#assignModal.open')) {
      const f = [...top.el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === a) { ev.preventDefault(); z.focus(); } else if (!ev.shiftKey && document.activeElement === z) { ev.preventDefault(); a.focus(); }
    }
  });
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-act^="dx-"]');
    if (!ev.target.closest('#dxMenu') && !(a && a.dataset.act === 'dx-menu')) closeMenu();
    if (!a) return; const fn = ACTIONS[a.dataset.act]; if (!fn) return;
    ev.stopPropagation(); if (a.closest('#dxMenu')) closeMenu();
    try { fn(a, ev); } catch (err) { console.error(a.dataset.act, err); toast('Something went wrong — see the console', 'warn'); }
  }, true);

  /* ---------- Bus wiring ---------- */
  bus.on('order:created', () => { DX.beep(); DX.bump('dispatch'); });
  DX.refresh = () => { if (DX._rq) return; DX._rq = requestAnimationFrame(() => { DX._rq = 0; const f = DX.views[currentView]; if (f) try { f(); } catch (err) { console.error(err); } }); };
  ['cod:changed', 'invoice:changed', 'settings:changed', 'dispatch:status', 'dispatch:created', 'dispatch:failed', 'order:created'].forEach((e) => bus.on(e, DX.refresh));

  DX.seed(); DX.syncMute(); DX.paintBadges();
  store.orders.forEach((o) => { if (o.codAmount === undefined) o.codAmount = 0; });
})();
