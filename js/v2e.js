/* =========================================================================
   DISPIST DEMO v2e — Invoices: list, full-screen editor with live A4 preview,
   WhatsApp / email send flows, print-to-PDF, mark paid. Loaded after v2d.js.
   Sending goes through the SIMULATED seams sendWhatsApp() and sendEmail() (v2d.js).
========================================================================= */
(function () {
  'use strict';
  const esc = DX.esc, DAY = DX.DAY, clone = (o) => JSON.parse(JSON.stringify(o));
  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const w999 = (n) => { let s = ''; if (n >= 100) { s = ONES[Math.floor(n / 100)] + ' hundred'; n %= 100; if (n) s += ' and '; } if (n >= 20) s += TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); else if (n > 0) s += ONES[n]; return s; };
  const wInt = (n) => { if (!n) return 'zero'; let s = ''; for (const [v, nm] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) if (n >= v) { s += (s ? ' ' : '') + w999(Math.floor(n / v)) + ' ' + nm; n %= v; } if (n) s += (s && n < 100 ? ' and ' : s ? ' ' : '') + w999(n); return s.trim(); };
  DX.words = (amt) => { const t = Math.round((+amt || 0) * 100), sh = Math.floor(t / 100), c = t % 100; let s = wInt(sh) + ' shilling' + (sh === 1 ? '' : 's'); if (c) s += ' and ' + wInt(c) + ' cent' + (c === 1 ? '' : 's'); return s[0].toUpperCase() + s.slice(1) + ' only'; };

  /* ---------- Messages + validation ---------- */
  const payRef = (inv) => { const p = store.settings.pay; return !p.account || p.account === 'Invoice number' ? inv.number : p.account; };
  const payLine = () => { const p = store.settings.pay; return p.till ? `M-Pesa Till ${p.till}` : `M-Pesa Paybill ${p.paybill}`; };
  DX.invMessage = (inv, reminder) => {
    const t = DX.invTotals(inv).total, p = store.settings.pay, dp = DX.daysPast(inv);
    return `Hello ${inv.client},\n` + (reminder ? `Friendly reminder: invoice ${inv.number} for ${kes(t)} ${dp >= 1 ? `was due on ${DX.fmtD(inv.due)} (${dp} day${dp > 1 ? 's' : ''} ago)` : `is due on ${DX.fmtD(inv.due)}`}.` : `Your invoice ${inv.number} is ready.\nAmount due: ${kes(t)}\nDue date: ${DX.fmtD(inv.due)}`) +
      `\nPay via ${payLine()}, Account ${payRef(inv)}.\nView: https://track.dispist.com/inv/${inv.number}\nThank you — ${p.company}`;
  };
  DX.invEmail = (inv) => { const t = DX.invTotals(inv).total, p = store.settings.pay;
    return { subject: `Invoice ${inv.number} from ${p.company} — ${kes(t)} due ${DX.fmtD(inv.due)}`, body: `Dear ${inv.client},\n\nPlease find invoice ${inv.number} for ${kes(t)}, due on ${DX.fmtD(inv.due)}.\n\nPayment: ${payLine()}, Account ${payRef(inv)}.\nOnline copy: https://track.dispist.com/inv/${inv.number}\n\n${inv.notes ? inv.notes + '\n\n' : ''}Kind regards,\n${p.company}\n${p.phone}` }; };
  DX.invValidate = (inv) => { const er = []; if (!String(inv.client || '').trim()) er.push('Add a client name.'); if (!(inv.items || []).some((l) => (+l.qty || 0) * (+l.rate || 0) > 0)) er.push('Add at least one line item with a positive amount.'); return er; };

  /* ---------- Persistence ---------- */
  DX.invSave = (d) => {
    const copy = clone(d); let s = store.invoices.find((i) => i.number === d.number);
    if (s) Object.assign(s, copy); else { store.invoices.push(copy); s = copy; if (d.number === 'INV-' + DX.pad4(store.invoiceSeq)) store.invoiceSeq++; }
    (s.orderIds || []).forEach((id) => { const h = store.history.find((x) => x.id === id && x.status === 'Delivered'); if (h) h.invoiceId = s.number; });
    return s;
  };
  function markSent(inv, channel, to, reminder) {
    const s = DX.invSave(inv); if (!reminder && s.status === 'draft') s.status = 'sent';
    s.sentAt = Date.now(); s.channel = channel; s.sentTo = to; if (channel === 'WhatsApp' && !s.phone) s.phone = DX.localPhone(to); if (channel === 'Email' && !s.email) s.email = to;
    if (store.ui.invDraft && store.ui.invDraft.number === s.number) store.ui.invDraft = clone(s);
    audit(s.number, `Invoice ${reminder ? 'reminder ' : ''}sent via ${channel} to ${channel === 'WhatsApp' ? DX.localPhone(to) : to}`, 'invoice');
    bus.emit('invoice:changed', s); toast(`Invoice ${reminder ? 'reminder ' : ''}sent via ${channel} to ${esc(channel === 'WhatsApp' ? DX.localPhone(to) : to)}`, 'success'); if (ED.isOpen) { renderEditor(false); }
  }
  function sendWa(inv, reminder) {
    const er = DX.invValidate(inv); if (er.length) return showErr(er);
    DX.waSheet({ title: reminder ? 'Send payment reminder' : 'Send invoice via WhatsApp', previewHead: 'To ' + inv.client, number: inv.phone, doc: inv, text: DX.invMessage(inv, reminder),
      note: 'WhatsApp opens with the message ready to send. Attach the PDF from Print / Save PDF if needed.', onSent: (r) => markSent(inv, 'WhatsApp', r.number, reminder) });
  }
  function sendMail(inv) {
    const er = DX.invValidate(inv); if (er.length) return showErr(er); const m = DX.invEmail(inv); DX._wa = null; DX._copy = m.subject + '\n\n' + m.body; DX._mail = inv;
    DX.sheet('Send invoice via email', `<label class="dx-lbl" for="mlTo">Client email</label><input id="mlTo" class="dx-in" type="email" inputmode="email" autocomplete="email" placeholder="name@company.co.ke" value="${esc(inv.email)}"><div id="mlErr" class="dx-err" role="alert"></div>
      <label class="dx-lbl">Subject</label><div class="p-2.5 rounded-lg text-[13px] font-medium" style="background:var(--paper)">${esc(m.subject)}</div><label class="dx-lbl">Body preview</label><div class="p-2.5 rounded-lg text-[12.5px]" style="background:var(--paper);white-space:pre-wrap">${esc(m.body)}</div>
      <p class="dx-note">Your email app opens with the message ready to send. Attach the PDF from Print / Save PDF if needed.</p><div class="dx-btnrow"><button class="btn-primary dx-b" data-act="dx-mail-open">Open email app</button><button class="btn-ghost dx-b" data-act="dx-copy">Copy message</button></div>`, true, '#mlTo');
  }
  function doMail() {
    const inv = DX._mail, inp = document.getElementById('mlTo'), err = document.getElementById('mlErr'); if (!inv || !inp) return;
    const res = sendEmail(inv, inp.value); if (!res.ok) { err.textContent = res.error; inp.focus(); return; }
    DX.closeSheet(); if (!res.opened) toast('Could not open an email app — use Copy message instead.', 'warn'); markSent(inv, 'Email', inp.value.trim());
  }
  function showErr(er) { const b = document.getElementById('edErr'); if (b) { b.innerHTML = er.map(esc).join('<br>'); try { b.scrollIntoView({ block: 'nearest' }); } catch (x) {} } toast(esc(er[0]), 'warn'); }

  /* ---------- Invoice list ---------- */
  function renderInvoices() {
    const host = document.getElementById('view-invoices'); if (!host) return;
    if (!document.getElementById('invList')) host.innerHTML = `<div id="invSummary" class="dx-grid4 mb-3"></div><div class="flex flex-wrap items-center gap-2 mb-3"><input id="invSearch" class="dx-in" style="flex:1 1 200px;width:auto" type="search" placeholder="Search invoice or client" aria-label="Search invoices" value="${esc(store.ui.invQuery)}">
      <button class="btn-primary dx-b" data-act="dx-inv-new">+ New invoice</button></div><div id="invChips" class="dx-chips mb-3" role="group" aria-label="Filter by status"></div><div id="invList"></div>`;
    const all = store.invoices, st = (i) => DX.invStatus(i), sum = (f) => all.filter(f).reduce((s, i) => s + DX.invTotals(i).total, 0), t30 = Date.now() - 30 * DAY;
    document.getElementById('invSummary').innerHTML = DX.stat('Outstanding', kes(sum((i) => ['sent', 'overdue'].includes(st(i)))), 'sent, not yet paid') + DX.stat('Overdue', kes(sum((i) => st(i) === 'overdue')), all.filter((i) => st(i) === 'overdue').length + ' invoices', 'var(--red-500)') +
      DX.stat('Paid (30 days)', kes(sum((i) => i.status === 'paid' && i.paidAt >= t30)), '', 'var(--green-600)') + DX.stat('Drafts', String(all.filter((i) => i.status === 'draft').length), 'not sent yet');
    document.getElementById('invChips').innerHTML = ['all', 'draft', 'sent', 'paid', 'overdue'].map((f) => `<button class="dx-chip ${store.ui.invFilter === f ? 'on' : ''}" aria-pressed="${store.ui.invFilter === f}" data-act="dx-inv-filter" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}${f === 'all' ? '' : ' (' + all.filter((i) => st(i) === f).length + ')'}</button>`).join('');
    renderInvList();
  }
  function renderInvList() {
    const q = (store.ui.invQuery || '').toLowerCase(), f = store.ui.invFilter, list = store.invoices.filter((i) => (f === 'all' || DX.invStatus(i) === f) && (!q || (i.number + ' ' + i.client).toLowerCase().includes(q))).sort((a, b) => b.issue - a.issue || (a.number < b.number ? 1 : -1));
    const el = document.getElementById('invList'); if (!el) return;
    el.innerHTML = list.length ? `<div class="card data-table-wrap dx-wrapcard"><table class="data-table dx-stack"><thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Issued</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${list.map((i) => {
      const s = DX.invStatus(i), dp = DX.daysPast(i);
      return `<tr><td data-label="Invoice"><b>${esc(i.number)}</b></td><td data-label="Client">${esc(i.client)}</td><td data-label="Amount" class="dx-num font-medium">${kes(DX.invTotals(i).total)}</td><td data-label="Issued">${DX.fmtD(i.issue)}</td>
        <td data-label="Due">${DX.fmtD(i.due)}${s === 'overdue' ? `<br><span class="text-[11px]" style="color:var(--red-500)">${dp} day${dp > 1 ? 's' : ''} overdue</span>` : ''}</td>
        <td data-label="Status">${DX.invBadge(s)}${i.sentAt ? `<br><span class="text-[11px]" style="color:var(--ink-400)">Sent via ${esc(i.channel || '—')} · ${DX.fmtD(i.sentAt)}</span>` : ''}</td>
        <td class="dx-acts"><button class="btn-ghost dx-b" data-act="dx-inv-open" data-n="${esc(i.number)}">Open</button><button class="btn-ghost dx-b" data-act="dx-inv-dup" data-n="${esc(i.number)}">Duplicate</button>${s === 'sent' || s === 'overdue' ? `<button class="btn-primary dx-b" data-act="dx-inv-paid" data-n="${esc(i.number)}">Mark paid</button>` : ''}<button class="btn-ghost dx-b" style="color:var(--red-500)" data-act="dx-inv-del" data-n="${esc(i.number)}">Delete</button></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="dx-card text-center text-[13px]" style="color:var(--ink-400)">No invoices match. Try another filter or create a new one.</div>';
  }
  DX.views.invoices = renderInvoices;
  document.addEventListener('input', (ev) => { if (ev.target.id === 'invSearch') { store.ui.invQuery = ev.target.value; renderInvList(); } });

  /* ---------- Editor ---------- */
  const ED = DX.layer('invEditor', 'dx-full', 'Invoice editor');
  const blankItem = () => ({ desc: '', qty: 1, rate: 0 });
  DX.newInvoice = (o) => {
    o = o || {}; const t0 = DX.day0(), d = { number: 'INV-' + DX.pad4(store.invoiceSeq), client: '', phone: '', email: '', address: '', issue: t0, due: t0 + 14 * DAY, items: [blankItem()], discount: { type: 'amt', value: 0 }, vat: false, notes: 'Payment due by the date shown. Thank you for your business.', status: 'draft', orderIds: [] };
    if (o.client) { const b = DX.clientBook(o.client) || {}; Object.assign(d, { client: o.client, phone: o.phone || b.phone || '', email: o.email || b.email || '', address: b.address || '' }); }
    if (o.orderIds) { let linked = 0; o.orderIds.forEach((id) => { const h = store.history.find((x) => x.id === id && x.status === 'Delivered' && !x.invoiceId); if (h) { addDelivery(d, h); linked++; } }); if (!linked) toast('That delivery is already on an invoice — starting a blank one.', 'info'); }
    openEditor(d);
  };
  function addDelivery(d, h) { d.items = d.items.filter((l) => l.desc || l.rate); d.items.push({ desc: `${h.id} · ${h.area} (${DX.fmtD(h.date)})`, qty: 1, rate: h.fee, orderId: h.id }); d.orderIds.push(h.id); }
  function openEditor(d) { store.ui.invDraft = d; store.ui.edTab = 'edit'; renderEditor(true); ED.open('#f_client'); }
  const field = (f, label, v, type, extra) => `<div><label class="dx-lbl" for="f_${f}">${label}</label><input id="f_${f}" class="dx-in" data-f="${f}" type="${type || 'text'}" value="${esc(v)}" ${extra || ''}></div>`;
  function formHtml(d) {
    const names = [...new Set([...CLIENTS, ...store.invoices.map((i) => i.client), ...store.history.map((h) => h.client)])].sort();
    return `<div id="edErr" class="dx-err" role="alert"></div><div class="dx-ed-sec" style="margin-top:0">Bill to</div>
      <label class="dx-lbl" for="f_client">Client name</label><input id="f_client" class="dx-in" data-f="client" list="invClients" autocomplete="off" value="${esc(d.client)}" placeholder="Pick a known client or type a name"><datalist id="invClients">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="dx-two">${field('phone', 'Phone / WhatsApp', d.phone, 'tel', 'inputmode="tel"')}${field('email', 'Email', d.email, 'email', 'inputmode="email"')}</div>${field('address', 'Address / location', d.address)}
      <div class="dx-ed-sec">Dates</div><div class="dx-two">${field('issue', 'Issue date', DX.d2s(d.issue), 'date')}${field('due', 'Due date', DX.d2s(d.due), 'date')}</div>
      <div class="dx-chips mt-2">${[7, 14, 30].map((n) => `<button class="dx-chip" data-act="dx-due" data-n="${n}">Net ${n}</button>`).join('')}</div>
      <div class="dx-ed-sec">Line items</div><div id="liRows">${d.items.map((l, i) => `<div class="li-row"><input class="dx-in d" data-li="${i}" data-k="desc" value="${esc(l.desc)}" placeholder="Description" aria-label="Description ${i + 1}">
        <input class="dx-in" data-li="${i}" data-k="qty" type="number" inputmode="decimal" min="0" step="any" value="${l.qty}" aria-label="Quantity ${i + 1}"><input class="dx-in" data-li="${i}" data-k="rate" type="number" inputmode="decimal" min="0" step="any" value="${l.rate}" aria-label="Rate ${i + 1}">
        <button class="btn-ghost dx-b dx-icon" data-act="dx-li-del" data-i="${i}" aria-label="Remove line ${i + 1}">✕</button></div>`).join('')}</div>
      <div class="dx-btnrow"><button class="btn-ghost dx-b" data-act="dx-li-add">+ Add line</button><button class="btn-ghost dx-b" data-act="dx-imp">Import completed deliveries</button></div>
      <div class="dx-ed-sec">Totals</div><div class="dx-two"><div><label class="dx-lbl" for="f_discType">Discount</label><div class="flex gap-2"><select id="f_discType" class="dx-in" style="width:90px" data-f="discType"><option value="amt" ${d.discount.type === 'amt' ? 'selected' : ''}>KES</option><option value="pct" ${d.discount.type === 'pct' ? 'selected' : ''}>%</option></select>
        <input id="f_discVal" class="dx-in" data-f="discVal" type="number" inputmode="decimal" min="0" value="${d.discount.value}" aria-label="Discount value"></div></div>
      <label class="drv-row" style="margin-top:26px;align-items:center;min-height:44px"><input type="checkbox" data-f="vat" ${d.vat ? 'checked' : ''}> <span class="text-[13px] font-medium">Add VAT 16%</span></label></div>
      <label class="dx-lbl" for="f_notes">Notes / terms</label><textarea id="f_notes" class="dx-in" data-f="notes">${esc(d.notes)}</textarea>
      <p class="dx-note">Payment details come from <a href="#" data-act="dx-goto" data-view="settings" style="text-decoration:underline">Settings</a>. WhatsApp/email opens with the message ready to send. Attach the PDF from Print / Save PDF if needed.</p>`;
  }
  function paperHtml(d) {
    const T = DX.invTotals(d), p = store.settings.pay, s = store.invoices.find((i) => i.number === d.number) ? DX.invStatus(d) : 'draft';
    return `<div class="inv-paper" id="invPaper"><span class="inv-status">${DX.invBadge(s)}</span><div class="inv-top"><div><img src="dispist-logo.png" alt="" style="height:30px;width:auto;margin-bottom:8px"><div class="font-display font-bold text-[15px]">${esc(p.company)}</div><div>${esc(p.address)}<br>${esc(p.phone)} · ${esc(p.email)}</div></div>
      <div style="text-align:right"><h1>INVOICE</h1><dl class="inv-meta" style="justify-content:end"><dt>No.</dt><dd>${esc(d.number)}</dd><dt>Issued</dt><dd>${DX.fmtD(d.issue)}</dd><dt>Due</dt><dd>${DX.fmtD(d.due)}</dd></dl></div></div>
      <div class="inv-box"><div class="text-[11px]" style="color:var(--ink-400)">BILL TO</div><div class="font-semibold text-[14px]">${esc(d.client) || '<span style="color:#B0AEB8">Client name</span>'}</div><div>${esc(d.phone)}${d.phone && d.email ? ' · ' : ''}${esc(d.email)}</div><div>${esc(d.address)}</div></div>
      <div class="inv-scroll"><table class="inv-tbl"><thead><tr><th style="width:52%">Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${d.items.map((l) => `<tr><td>${esc(l.desc) || '<span style="color:#B0AEB8">—</span>'}</td><td class="r">${+l.qty || 0}</td><td class="r">${Number(+l.rate || 0).toLocaleString('en-KE')}</td><td class="r">${((+l.qty || 0) * (+l.rate || 0)).toLocaleString('en-KE')}</td></tr>`).join('')}</tbody></table></div>
      <div class="inv-tot"><div><span>Subtotal</span><span>${kes(T.sub)}</span></div>${T.disc ? `<div><span>Discount${d.discount.type === 'pct' ? ' (' + d.discount.value + '%)' : ''}</span><span>-${kes(T.disc)}</span></div>` : ''}${d.vat ? `<div><span>VAT 16%</span><span>${kes(T.vat)}</span></div>` : ''}<div class="g"><span>Total</span><span>${kes(T.total)}</span></div></div>
      <p style="margin-top:8px"><b>Amount in words:</b> ${esc(DX.words(T.total))}</p>
      <div class="inv-box"><b>Payment details</b><br>${esc(payLine())} · Account: ${esc(payRef(d))}${p.bank ? '<br>Bank: ' + esc(p.bank) : ''}</div>${d.notes ? `<div class="inv-box"><b>Notes &amp; terms</b><br>${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
  }
  function renderPreview() { const d = store.ui.invDraft, el = document.getElementById('invPrev'); if (d && el) el.innerHTML = paperHtml(d); const t = document.getElementById('edTot'); if (t && d) t.textContent = 'Total ' + kes(DX.invTotals(d).total); }
  function renderEditor(full) {
    const d = store.ui.invDraft; if (!d) return; const exists = store.invoices.find((i) => i.number === d.number), st = exists ? DX.invStatus(d) : 'draft';
    if (!full && document.getElementById('invPrev')) { const hd = ED.el.querySelector('.dx-ed-head h2'); if (hd) hd.innerHTML = esc(d.number) + ' ' + DX.invBadge(st); renderPreview(); return; }
    ED.el.innerHTML = `<div class="dx-ed-head"><button class="btn-ghost dx-b dx-icon" data-act="dx-ed-close" aria-label="Close editor">✕</button><h2>${esc(d.number)} ${DX.invBadge(st)}</h2><b id="edTot" class="dx-num text-[13px]"></b></div>
      <div class="dx-ed-tabs" role="tablist"><button class="on" role="tab" data-act="dx-ed-tab" data-t="edit">Edit</button><button role="tab" data-act="dx-ed-tab" data-t="preview">Preview</button></div>
      <div class="dx-ed-body" data-tab="${store.ui.edTab || 'edit'}"><div class="dx-ed-form">${formHtml(d)}</div><div class="dx-ed-prev" id="invPrev"></div></div>
      <div class="dx-ed-actions"><button class="btn-ghost dx-b" data-act="dx-ed-save">${exists && d.status !== 'draft' ? 'Save changes' : 'Save draft'}</button><button class="btn-ghost dx-b" data-act="dx-inv-print">Print / Save PDF</button>
        <button class="dx-wa-btn dx-b" data-act="dx-inv-wa">Send via WhatsApp</button><button class="btn-primary dx-b" data-act="dx-inv-mail">Send via Email</button></div>`;
    syncTabs(); renderPreview();
  }
  function syncTabs() { const b = ED.el.querySelector('.dx-ed-body'); if (!b) return; b.dataset.tab = store.ui.edTab; ED.el.querySelectorAll('.dx-ed-tabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === store.ui.edTab)); }
  ED.el.addEventListener('input', (ev) => {
    const t = ev.target, d = store.ui.invDraft; if (!d) return;
    if (t.dataset.f) { const f = t.dataset.f; if (f === 'vat') d.vat = t.checked; else if (f === 'discType') d.discount.type = t.value; else if (f === 'discVal') d.discount.value = Math.max(0, +t.value || 0); else if (f === 'issue' || f === 'due') { const v = DX.s2d(t.value); if (!isNaN(v)) d[f] = v; } else d[f] = t.value; }
    else if (t.dataset.li !== undefined) { const it = d.items[+t.dataset.li], k = t.dataset.k; if (it) it[k] = k === 'desc' ? t.value : Math.max(0, +t.value || 0); } else return;
    renderPreview();
  });
  ED.el.addEventListener('change', (ev) => {
    const t = ev.target, d = store.ui.invDraft; if (!d || t.dataset.f !== 'client') return; const b = DX.clientBook(t.value); if (!b) return;
    [['phone', b.phone], ['email', b.email], ['address', b.address]].forEach(([k, v]) => { if (!d[k] && v) { d[k] = v; const i = document.getElementById('f_' + k); if (i) i.value = v; } }); renderPreview();
  });
  function reForm(focusSel) { const f = ED.el.querySelector('.dx-ed-form'); f.innerHTML = formHtml(store.ui.invDraft); renderPreview(); const x = focusSel && ED.el.querySelector(focusSel); if (x) x.focus(); }
  function openImport() {
    const d = store.ui.invDraft; if (!String(d.client).trim()) { toast('Pick or type the client first, then import their deliveries.', 'warn'); return; }
    const rows = store.history.filter((h) => h.status === 'Delivered' && !h.invoiceId && h.client.toLowerCase() === d.client.trim().toLowerCase() && !d.orderIds.includes(h.id)).sort((a, b) => b.date - a.date).slice(0, 50);
    DX.sheet('Import completed deliveries', rows.length ? `<p class="dx-note">Delivered orders for <b>${esc(d.client)}</b> not yet invoiced.</p><label class="drv-row mb-2"><input type="checkbox" id="impAll"> <b class="text-[13px]">Select all (${rows.length})</b></label>
      ${rows.map((h) => `<label class="drv-row mb-2"><input type="checkbox" class="imp" value="${esc(h.id)}"><div class="flex-1 text-[12.5px]"><b>${esc(h.id)}</b> · ${esc(h.area)}<br><span style="color:var(--ink-400)">${DX.fmtD(h.date)}</span></div><b class="dx-num text-[13px]">${kes(h.fee)}</b></label>`).join('')}
      <div class="dx-btnrow"><button class="btn-primary dx-b" data-act="dx-imp-ok">Import selected</button></div>` : `<div class="text-center py-6 text-[13px]" style="color:var(--ink-400)"><b>No delivered, uninvoiced orders</b><br>for ${esc(d.client)} right now.</div>`);
  }
  document.addEventListener('change', (ev) => { if (ev.target.id === 'impAll') document.querySelectorAll('.imp').forEach((c) => { c.checked = ev.target.checked; }); });
  function doImport() {
    const d = store.ui.invDraft, ids = [...document.querySelectorAll('.imp:checked')].map((c) => c.value); if (!ids.length) { toast('Tick at least one delivery.', 'warn'); return; }
    ids.forEach((id) => { const h = store.history.find((x) => x.id === id && x.status === 'Delivered'); if (h) addDelivery(d, h); }); DX.closeSheet(); reForm(); toast(`Imported ${ids.length} deliver${ids.length > 1 ? 'ies' : 'y'} — they are marked invoiced when you save`, 'info');
  }
  const byNum = (n) => store.invoices.find((i) => i.number === n);
  function dupInvoice(n) {
    const s = byNum(n); if (!s) return; const t0 = DX.day0(), c = clone(s);
    Object.assign(c, { number: 'INV-' + DX.pad4(store.invoiceSeq), issue: t0, due: t0 + 14 * DAY, status: 'draft', sentAt: null, channel: null, sentTo: null, paidAt: null, orderIds: [] }); DX.invSave(c);
    audit(c.number, 'Duplicated from ' + n, 'invoice'); bus.emit('invoice:changed', c); toast(`Duplicated as <b>${esc(c.number)}</b> (draft)`, 'success');
  }
  function markPaid(n) { const s = byNum(n); if (!s) return; s.status = 'paid'; s.paidAt = Date.now(); audit(n, 'Marked paid ' + kes(DX.invTotals(s).total), 'invoice'); bus.emit('invoice:changed', s); toast(`<b>${esc(n)}</b> marked paid — Finance and Cash updated`, 'success'); }
  function confirmDelete(n) { const s = byNum(n); if (!s) return; DX.sheet('Delete invoice?', `<p class="text-[13px]">Delete <b>${esc(n)}</b> for ${esc(s.client)} (${kes(DX.invTotals(s).total)})? This cannot be undone. Any imported deliveries become available to invoice again.</p><div class="dx-btnrow"><button class="btn-ghost dx-b" data-act="close-info">Keep it</button><button class="btn-primary dx-b" style="background:var(--red-500)" data-act="dx-inv-del-ok" data-n="${esc(n)}">Delete</button></div>`); }
  function doDelete(n) { const i = store.invoices.findIndex((x) => x.number === n); if (i < 0) return; store.history.forEach((h) => { if (h.invoiceId === n) h.invoiceId = null; }); store.invoices.splice(i, 1); DX.closeSheet(); audit(n, 'Invoice deleted', 'invoice'); bus.emit('invoice:changed'); toast(esc(n) + ' deleted', 'info'); }

  Object.assign(ACTIONS, {
    'dx-inv-new': () => DX.newInvoice(), 'dx-inv-open': (a) => { const s = byNum(a.dataset.n); if (s) openEditor(clone(s)); }, 'dx-inv-dup': (a) => dupInvoice(a.dataset.n), 'dx-inv-paid': (a) => markPaid(a.dataset.n),
    'dx-inv-del': (a) => confirmDelete(a.dataset.n), 'dx-inv-del-ok': (a) => doDelete(a.dataset.n), 'dx-inv-filter': (a) => { store.ui.invFilter = a.dataset.f; renderInvoices(); },
    'dx-ed-close': () => ED.close(), 'dx-ed-tab': (a) => { store.ui.edTab = a.dataset.t; syncTabs(); },
    'dx-ed-save': () => { const d = store.ui.invDraft, er = d.status === 'draft' && !d.client.trim() ? ['Add a client name before saving.'] : []; if (er.length) return showErr(er); const s = DX.invSave(d); store.ui.invDraft = clone(s); audit(s.number, 'Invoice saved', 'invoice'); bus.emit('invoice:changed', s); toast(esc(s.number) + ' saved', 'success'); renderEditor(false); },
    'dx-inv-print': () => { try { window.print(); } catch (err) { toast('Printing is blocked here — use your browser menu → Print', 'warn'); } },
    'dx-inv-wa': () => sendWa(store.ui.invDraft, false), 'dx-inv-mail': () => sendMail(store.ui.invDraft), 'dx-mail-open': doMail,
    'dx-due': (a) => { const d = store.ui.invDraft; d.due = d.issue + +a.dataset.n * DAY; const i = document.getElementById('f_due'); if (i) i.value = DX.d2s(d.due); renderPreview(); },
    'dx-li-add': () => { store.ui.invDraft.items.push(blankItem()); reForm('#liRows .li-row:last-child .d'); },
    'dx-li-del': (a) => { const d = store.ui.invDraft, l = d.items.splice(+a.dataset.i, 1)[0]; if (l && l.orderId) d.orderIds = d.orderIds.filter((x) => x !== l.orderId); if (!d.items.length) d.items.push(blankItem()); reForm(); },
    'dx-imp': openImport, 'dx-imp-ok': doImport,
    'dx-remind': (a) => { const s = byNum(a.dataset.n); if (s) sendWa(clone(s), true); },
    'dx-create-inv': (a) => { const d = store.dispatches.find((x) => x.id === a.dataset.id); if (d) DX.newInvoice({ client: d.client, orderIds: [d.orderId || d.id], phone: d.contact, email: d.email }); },
  });
  setInterval(() => { if (currentView === 'invoices') renderInvList(); }, 60000);
  ED.onClose = () => { store.ui.invDraft = null; DX.refresh(); };
})();
