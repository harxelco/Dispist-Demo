# Dispist Demo v2
Built by Harxel Agency · harxelco.com. **Demo only** — no backend. Open `index.html` or host statically (Netlify etc.).
Vanilla HTML/CSS/JS, no build step. Script order: `script.js` → `js/v2.js` → `js/v2b.js` → `js/v2c.js` → `js/v2d.js` → `js/v2e.js`; styles in `styles.css` + `css/v2c.css`.

## Built
**Phase 1** — event bus, central `store`, live fleet map (Leaflet/OSM), auto + manual assignment with "Why this driver?", tickets, order popups, report library.

**Part A — core closers**
- **Cash (COD tracker):** codAmount on ~40% of orders/history; collected on delivery completion, per-driver outstanding, "Mark as remitted" amount-confirm sheet (short amounts open a discrepancy), seeded discrepancy with Review.
- **WhatsApp intake:** slide-over chat on Dispatch Center, sample chips, English + Kiswahili parsing, one follow-up question when phone/area is missing, confirmation card, order lands in Incoming with a "via WhatsApp" badge and a sound alert.
- **Customer tracking:** per-dispatch "Customer tracking link" modal (status timeline, driver first name + reg, live ETA countdown, 5-star rating stored), "Send tracking link" via WhatsApp.
- **Failures & scenarios:** "Mark failed" with reason codes; Demo Tools menu (Rush hour, Driver breakdown, Customer unreachable, Owner report, Reset demo) with narrating toasts.
- **Sound & badges:** Web Audio beep (mute toggle, graceful if blocked) and unread badges on nav items.

**Part B — Finance:** range chips (Today/7/30), 6 KPIs with change-vs-previous deltas, revenue/costs/profit SVG trend with tap/hover tooltip, cost donut, top-6 client bars with margin, route profitability table (low/negative margin flagged), receivables ageing + overdue list with "Send reminder", cash strip, CSV export, insights line. Cost model editable in **Settings** and used live.

**Part C — Invoices:** list (search, status chips, Open/Duplicate/Mark paid/Delete), full-screen editor with live A4 preview (Edit | Preview tabs on mobile), client autofill, Net 7/14/30, line items, **Import completed deliveries**, discount (KES/%), VAT 16%, amount in words, M-Pesa details, validation, print-to-PDF stylesheet, Send via WhatsApp / Email sheets (number/email validation, message preview, copy fallback). Sent invoices past due become Overdue automatically.

**Owner report:** `buildOwnerReport()` from live data; WhatsApp-style preview with phone input (Reports page and Demo Tools).

All new views render from `store` and refresh through the bus. New code lives in `js/v2c.js`, `v2d.js`, `v2e.js`; shared helpers are on the `DX` namespace.

## SIMULATED seams (replace with real backends)
Each is marked `SIMULATED - replace with real API/LLM call` in code.
| Seam | Where | Replace with |
|---|---|---|
| `parseOrderMessage(text)` | v2d.js | LLM extraction returning the same object shape |
| `buildOwnerReport()` | v2d.js | scheduled reporting job + WhatsApp Business API |
| `insightsFromData(ctx)` | v2d.js | LLM/analytics narration over the same aggregates |
| `sendWhatsApp(doc, number, text)` | v2d.js | WhatsApp Business Cloud API (demo opens `wa.me` with text pre-filled) |
| `sendEmail(invoice, email)` | v2d.js | transactional email API (demo opens `mailto:`) |
| `suggestDriver()` | v2.js | routing/ML service |
| `tick()` | v2.js | live GPS feed |
| `createDispatch()` | v2.js | orders API |
Also simulated: seeded 30-day history, fees, COD, invoices (all in `DX.seed()`), and the tracking-page ETA.

## Honest limits
WhatsApp/email **open with the message ready to send** — nothing is delivered automatically, and the PDF must be attached via Print / Save PDF. Data lives in memory; refresh resets it.

## 10-minute pitch script
1. **0:00 Problem (1 min).** "Orders on WhatsApp, cash in riders' pockets, invoices in Excel." Open Dispatch Center.
2. **1:00 WhatsApp intake (1.5).** Click *WhatsApp Intake*, tap the first sample chip → confirmation card → Confirm. Alert sounds, order appears with the *via WhatsApp* badge. Tap the "no phone" chip to show the single follow-up question.
3. **2:30 Dispatch (1.5).** Assign automatically (read the "Why this driver?" line), then run the driver simulator Start → Arrived → POD → Complete.
4. **4:00 Cash (1).** Cash tab: the COD just landed on that driver. Mark as remitted with a short amount to show the discrepancy; open Review on the seeded one. "No more cash leaking."
5. **5:00 Customer tracking (1).** Open the tracking link on an active job, step the simulator, show the live ETA and star rating; "Send tracking link".
6. **6:00 When things go wrong (1).** Demo Tools → Driver breakdown (red on Fleet map, job back as *Reassign* with a suggestion), then Customer unreachable, then Rush hour + batch.
7. **7:00 Finance (1.5).** Finance tab: switch 7 → 30 days, hover the trend, point at the low-margin route flag and the insights line, receivables ageing, Export CSV.
8. **8:30 Invoicing (1).** On the completed job click *Create invoice*, type in the editor and watch the live preview, tap *Send via WhatsApp* (show number validation), then *Mark paid* on an overdue invoice and watch Finance drop.
9. **9:30 Close (0.5).** Demo Tools → Owner report; "Every evening on the owner's phone." Contact tab for next steps.
