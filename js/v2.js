/* =========================================================================
   DISPIST DEMO v2 — Phase 1 core. Loaded AFTER script.js; layers on top of it.
   Sections: config · bus · store · geo · sim · createDispatch · suggestDriver
             · manual-assign modal · fleet map · wiring
   Anything marked SIMULATED must be replaced by a real API call later.
========================================================================= */
const TICK_MS = 1000,
  MOVE_FACTOR = 0.3,
  MAX_JOBS_PER_DRIVER = 1,
  TRAIL_LEN = 6;
const STATUS_PROGRESS = { dispatched: 0.25, transit: 0.8, arrived: 1 }; // share of depot->drop covered

/* ---------- Event bus ---------- */
const bus = (() => {
  const h = {};
  return {
    on: (e, f) => {
      (h[e] = h[e] || []).push(f);
    },
    emit: (e, p) => {
      (h[e] || []).forEach((f) => {
        try {
          f(p);
        } catch (err) {
          console.error(e, err);
        }
      });
    },
  };
})();

/* ---------- Geo ---------- */
const DEPOT = { lat: -1.305, lng: 36.842, name: "Nairobi Depot" };
const AREA_GEO = {
  "CBD Express Delivery": [-1.2864, 36.8172],
  "Westlands Same-Day": [-1.2676, 36.8108],
  "Industrial Area Route": [-1.31, 36.85],
  "Mombasa Road Fleet": [-1.34, 36.86],
  "Thika Road Corridor": [-1.219, 36.887],
};
const hash = (s) =>
  [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function dropPoint(d) {
  const g = AREA_GEO[d.area] || [DEPOT.lat, DEPOT.lng],
    h = hash(d.client);
  return {
    lat: g[0] + ((h % 9) - 4) * 0.0012,
    lng: g[1] + (((h >> 4) % 9) - 4) * 0.0012,
  };
}
function km(a, b) {
  const R = 6371,
    r = (x) => (x * Math.PI) / 180,
    dLa = r(b.lat - a.lat),
    dLo = r(b.lng - a.lng);
  const x =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const lerpPt = (a, b, t) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
});

/* ---------- Central store (orders/dispatches proxy script.js's arrays) ---------- */
const FLEET_SEED = [
  // name, reg, type, status, jobsToday, onTime%, idle offset
  ["D. Kamau", "KDA 214B", "Van", "ok", 3, 96, [0.004, -0.008]],
  ["J. Mutiso", "KDB 552L", "Pickup", "ok", 2, 91, [-0.012, 0.01]],
  ["A. Njeri", "KDC 887P", "Motorbike", "ok", 4, 94, [0.016, 0.004]],
  ["S. Otieno", "KDD 331R", "Van", "ok", 1, 88, [-0.006, -0.014]],
  ["F. Cherop", "KDE 019T", "Pickup", "ok", 2, 97, [0.01, 0.015]],
  ["P. Wanjiru", "KDF 442K", "Van", "maintenance", 0, 90, [-0.002, -0.003]],
  ["M. Kiptoo", "KDG 765N", "Motorbike", "maintenance", 0, 85, [-0.004, 0.002]],
];
const store = {
  get orders() {
    return orders;
  },
  set orders(v) {
    orders = v;
  },
  get dispatches() {
    return dispatches;
  },
  drivers: FLEET_SEED.map(([name, reg, type, status, jobs, onTime, off]) => ({
    name,
    reg,
    type,
    status,
    jobs,
    onTime,
    home: { lat: DEPOT.lat + off[0], lng: DEPOT.lng + off[1] },
    pos: { lat: DEPOT.lat + off[0], lng: DEPOT.lng + off[1] },
    trail: [],
  })),
  auditLog: [],
  settings: {},
};
function audit(orderId, text, method) {
  store.auditLog.unshift({
    t: new Date().toISOString(),
    orderId,
    text,
    method: method || null,
  });
}
const slug = (x) =>
  String(x)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
function ensureOrderMeta(o) {
  // SIMULATED contact data — real orders carry this from the intake API
  if (o.contact) return o;
  const h = hash(o.id + o.client);
  o.contact = "07" + String(10000000 + (h % 90000000));
  o.email = "dispatch@" + slug(o.client) + ".co.ke";
  o.source = o.source || "Web";
  o.createdAt = o.createdAt || Date.now();
  return o;
}
const activeJob = (dr) =>
  store.dispatches.find((d) => d.reg === dr.reg && d.statusKey !== "delivered");
function getAvailableDrivers() {
  // single source of truth for availability
  return store.drivers.filter((dr) => dr.status === "ok" && !activeJob(dr));
}
function driverState(dr) {
  if (dr.status === "breakdown") return "breakdown";
  if (dr.status === "maintenance") return "maintenance";
  const j = activeJob(dr);
  return !j ? "available" : j.statusKey === "arrived" ? "arrived" : "route";
}

/* ---------- Dispatch creation (auto + manual) ---------- */
function createDispatch(order, driver, method, why) {
  ensureOrderMeta(order);
  store.orders = store.orders.filter((o) => o.id !== order.id);
  const d = {
    contact: order.contact,
    email: order.email,
    items: order.items,
    urgency: order.urgency,
    codAmount: order.codAmount,
    source: order.source,
    createdAt: order.createdAt,
    assignedAt: Date.now(),
    id: "DSP-" + dispatchSeq++,
    orderId: order.id,
    client: order.client,
    area: order.area,
    driver: driver.name,
    reg: driver.reg,
    phase: "Assigned",
    statusKey: "dispatched",
    method,
    why: why || "Picked manually by dispatcher",
    steps: { start: false, arrived: false, pod: false, complete: false },
  };
  dispatches.unshift(d);
  driver.jobs++;
  audit(order.id, `Assigned to ${driver.name} (${method}) — ${d.why}`, method);
  renderOrders();
  renderDispatches();
  nudgeFleetUtilization(+4);
  bus.emit("dispatch:created", d);
  return d;
}

/* ---------- Smart suggestion — SIMULATED: replace with real routing/ML service ---------- */
function suggestDriver(order, pool) {
  const list = (pool || getAvailableDrivers())
    .map((dr) => {
      const dist = km(dr.pos, DEPOT),
        load = dr.jobs,
        bulky = order.items > 5 && dr.type === "Motorbike";
      const score =
        dist * 1.5 + load * 0.25 + (100 - dr.onTime) / 20 + (bulky ? 2 : 0);
      return { dr, dist, score, bulky };
    })
    .sort((a, b) => a.score - b.score);
  if (!list.length) return null;
  const b = list[0];
  b.reason = `${b.dr.name.split(" ")[1] || b.dr.name} — ${list[0] === list.slice().sort((x, y) => x.dist - y.dist)[0] ? "closest" : "best overall"} (${b.dist.toFixed(1)} km), ${b.dr.onTime}% on-time, ${activeJobsCount(b.dr)} active jobs`;
  return { driver: b.dr, reason: b.reason, ranked: list };
}
const activeJobsCount = (dr) => (activeJob(dr) ? 1 : 0);

/* Replaces the v1 random-pick assignDriver */
function assignDriver(orderId, btn) {
  const order = store.orders.find((o) => o.id === orderId),
    card = document.getElementById("order-" + orderId);
  if (!order || !card) return;
  if (btn) btn.disabled = true;
  const ov = document.createElement("div");
  ov.className = "scan-overlay";
  ov.innerHTML =
    '<div class="scan-line"></div><div class="scan-spinner"></div><div class="text-[12px] font-medium">Matching best available driver…</div>';
  card.appendChild(ov);
  setTimeout(() => {
    const s = suggestDriver(order);
    if (!s) {
      renderOrders();
      toast(
        "No drivers available right now — the next one frees up when a delivery completes.",
        "warn",
      );
      return;
    }
    createDispatch(order, s.driver, "auto", s.reason);
    toast(`Assigned <b>${escapeHtml(order.id)}</b>: ${escapeHtml(s.reason)}`);
    if (isMobileViewport() && currentView === "dispatch")
      switchWorkspaceTab("active");
  }, 1200);
}
function aiDispatchMatch(id, b) {
  return assignDriver(id, b);
}

/* ---------- Manual assignment modal: step 1 client form -> step 2 free drivers ---------- */
let modalOpener = null;
const PHONE_RE = /^(?:\+254|0)[17]\d{8}$/,
  EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function openAssignModal(orderId) {
  // with an orderId: straight to drivers; without: client form first
  modalOpener = document.activeElement;
  const m = document.getElementById("assignModal");
  m.dataset.order = orderId || "";
  m.dataset.driver = "";
  m.dataset.step = orderId ? "drivers" : "form";
  renderAssignModal();
  m.classList.add("open");
  const f = m.querySelector(
    "input, select, button:not([data-act=close-modal])",
  );
  if (f) f.focus();
}
function closeAssignModal() {
  const m = document.getElementById("assignModal");
  m.classList.remove("open");
  if (modalOpener) modalOpener.focus();
}
const modalHead = (
  t,
) => `<div class="flex justify-between items-center mb-3"><h2 class="font-display font-bold text-base">${t}</h2>
  <button data-act="close-modal" aria-label="Close" class="btn-ghost px-3 py-1 rounded-lg">✕</button></div>`;
function renderAssignModal() {
  const m = document.getElementById("assignModal"),
    card = m.querySelector(".modal-card");
  if (m.dataset.step === "form") {
    const f = (id, l, inner) =>
        `<label class="text-[12px] font-medium" style="color:var(--ink-600)">${l}${inner}</label>`,
      cls = 'class="w-full p-2 rounded-lg border mt-1 font-normal"';
    card.innerHTML =
      modalHead("New manual assignment") +
      `<div class="flex flex-col gap-2.5 mb-4">
      ${f("c", "Client name", `<input id="inClient" ${cls} autocomplete="off">`)}
      ${f("a", "Location", `<select id="inArea" ${cls}>${AREAS.map((a) => `<option>${escapeHtml(a)}</option>`).join("")}</select>`)}
      ${f("p", "Contact phone", `<input id="inPhone" type="tel" placeholder="0712 345 678" ${cls}>`)}
      ${f("e", "Email", `<input id="inEmail" type="email" placeholder="name@company.co.ke" ${cls}>`)}
      <div id="inErr" role="alert" class="text-[12px]" style="color:var(--red-500)"></div></div>
      <button data-act="to-drivers" class="btn-primary w-full py-2.5 rounded-lg">Assign driver</button>`;
    return;
  }
  const order = store.orders.find((o) => o.id === m.dataset.order);
  if (!order) {
    closeAssignModal();
    return;
  }
  ensureOrderMeta(order);
  const avail = getAvailableDrivers(),
    rec = suggestDriver(order, avail),
    sel = m.dataset.driver; // recalculated every render
  const rows = avail
    .map(
      (
        dr,
      ) => `<label class="drv-row"><input type="radio" name="drv" value="${escapeHtml(dr.reg)}" ${sel === dr.reg ? "checked" : ""}>
    <div class="flex-1"><div class="font-medium text-[13px]">${escapeHtml(dr.name)} ${rec && rec.driver === dr ? '<span class="badge badge-delivered">Recommended</span>' : ""}</div>
    <div class="text-[11.5px]" style="color:var(--ink-400)">${escapeHtml(dr.reg)} · ${escapeHtml(dr.type)} · ${km(dr.pos, DEPOT).toFixed(1)} km to pickup · ${dr.jobs} jobs today · ${dr.onTime}% on-time</div></div></label>`,
    )
    .join("");
  card.innerHTML =
    modalHead("Choose a driver") +
    `
    <div class="text-[12px] mb-3 p-2.5 rounded-lg" style="background:var(--paper);color:var(--ink-600)"><b>${escapeHtml(order.id)}</b> · ${escapeHtml(order.client)} · ${escapeHtml(order.area)}<br>${escapeHtml(order.contact)} · ${urgencyBadge(order.urgency)} · ${order.items} item${order.items > 1 ? "s" : ""}${order.codAmount ? ` · COD KES ${order.codAmount.toLocaleString("en-KE")}` : ""}</div>
    <div class="flex flex-col gap-2 mb-4">${rows || `<div class="text-center py-6 text-[12.5px]" style="color:var(--ink-400)"><b>No drivers available right now</b><br>The next driver frees up when a delivery completes. The order stays in Incoming.</div>`}</div>
    <button data-act="confirm-assign" class="btn-primary w-full py-2.5 rounded-lg" ${avail.length ? "" : "disabled"}>Confirm assignment</button>`;
}
function submitIntake() {
  // creates the order in Incoming, then shows the free-driver list
  const v = (id) => document.getElementById(id).value.trim(),
    err = document.getElementById("inErr");
  const client = v("inClient"),
    area = v("inArea"),
    phone = v("inPhone").replace(/[\s-]/g, ""),
    email = v("inEmail");
  const msg = !client
    ? "Enter the client name."
    : !PHONE_RE.test(phone)
      ? "Enter a valid Kenyan phone (07xx / 01xx / +254)."
      : !EMAIL_RE.test(email)
        ? "Enter a valid email address."
        : "";
  if (msg) {
    err.textContent = msg;
    return;
  }
  const o = {
    id: "ORD-" + orderSeq++,
    client,
    area,
    urgency: "med",
    items: 1,
    contact: phone,
    email,
    source: "Manual",
    createdAt: Date.now(),
    codAmount: 0,
  };
  store.orders.unshift(o);
  audit(o.id, "Order created manually by dispatcher");
  renderOrders();
  bus.emit("order:created", o);
  const m = document.getElementById("assignModal");
  m.dataset.order = o.id;
  m.dataset.step = "drivers";
  renderAssignModal();
  const f = m.querySelector("input[name=drv], button");
  if (f) f.focus();
}
function confirmManualAssign() {
  const m = document.getElementById("assignModal"),
    order = store.orders.find((o) => o.id === m.dataset.order);
  const reg = (m.querySelector("input[name=drv]:checked") || {}).value;
  const dr = getAvailableDrivers().find((d) => d.reg === reg); // re-validate at confirm time
  if (!order || !dr) {
    toast("Pick an available driver first.", "warn");
    return;
  }
  createDispatch(order, dr, "manual");
  closeAssignModal();
  toast(
    `<b>${escapeHtml(order.id)}</b> manually assigned to <b>${escapeHtml(dr.name)}</b> (${escapeHtml(dr.reg)})`,
  );
}

/* ---------- Batch banner ---------- */
function batchGroup() {
  const g = {};
  store.orders.forEach((o) => (g[o.area] = g[o.area] || []).push(o));
  return Object.entries(g).find(([, l]) => l.length >= 2);
}
function batchAssign() {
  const g = batchGroup();
  if (!g) return;
  const s = suggestDriver(g[1][0]);
  if (!s) {
    toast("No drivers available to batch.", "warn");
    return;
  }
  const take = g[1].slice(0, MAX_JOBS_PER_DRIVER);
  take.forEach((o) =>
    createDispatch(o, s.driver, "auto", "Batch: " + s.reason),
  );
  toast(
    `${escapeHtml(s.driver.name)} can carry ${MAX_JOBS_PER_DRIVER} job at a time in this demo — ${g[1].length - take.length} order(s) still need a driver.`,
    "info",
  );
}

/* ---------- Simulation engine (1s tick) ---------- */
function targetFor(dr) {
  const j = activeJob(dr);
  if (j) return lerpPt(DEPOT, dropPoint(j), STATUS_PROGRESS[j.statusKey]);
  if (dr.status === "ok") return dr.home;
  return dr.home; // available idles near depot; maintenance stays at garage
}
function tick() {
  store.drivers.forEach((dr) => {
    dr.trail.push({ ...dr.pos });
    if (dr.trail.length > TRAIL_LEN) dr.trail.shift();
    if (dr.status !== "ok") return;
    const t = targetFor(dr),
      idle = !activeJob(dr),
      jit = idle ? 0.0003 : 0;
    dr.pos = {
      lat:
        dr.pos.lat +
        (t.lat - dr.pos.lat) * MOVE_FACTOR +
        (Math.random() - 0.5) * jit,
      lng:
        dr.pos.lng +
        (t.lng - dr.pos.lng) * MOVE_FACTOR +
        (Math.random() - 0.5) * jit,
    };
  });
  bus.emit("driver:moved", null);
}

/* ---------- Fleet map ---------- */
const STATE_COLOR = {
  available: "#25A862",
  route: "#2F6FE0",
  arrived: "#E0902A",
  maintenance: "#8B8B99",
  breakdown: "#B3261E",
};
const STATE_LABEL = {
  available: "Available",
  route: "On route",
  arrived: "Arrived",
  maintenance: "Maintenance",
  breakdown: "Breakdown",
};
let mapFilter = "all",
  mapSel = null,
  lastTickAt = Date.now();

function initFleetMap() {
  const host = document.getElementById("fleetSummary");
  if (!host || document.getElementById("fleetMapWrap")) return;
  const w = document.createElement("div");
  w.id = "fleetMapWrap";
  w.className = "grid lg:grid-cols-[1fr_260px] gap-3 mb-5";
  w.innerHTML = `<div class="card p-2 relative"><span id="liveBadge" class="badge badge-delivered absolute" style="top:12px;left:12px;z-index:1000">LIVE · updated 0s ago</span>
    <div id="map" role="region" aria-label="Live fleet map"></div>
    <div class="flex flex-wrap gap-3 text-[11px] px-2 pt-2" style="color:var(--ink-600)">${Object.keys(
      STATE_COLOR,
    )
      .map(
        (k) =>
          `<span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${STATE_COLOR[k]}"></i> ${STATE_LABEL[k]}</span>`,
      )
      .join("")}</div>
    <div id="mapInfo" class="px-2 pt-2"></div></div>
    <div class="card p-3"><div id="mapChips" class="flex flex-wrap gap-1.5 mb-2"></div><div id="mapList" class="flex flex-col gap-1.5"></div></div>`;
  host.after(w);
  w.addEventListener("click", (e) => {
    const m = e.target.closest("[data-reg]"),
      chip = e.target.closest("[data-chip]"),
      open = e.target.closest("[data-open]");
    if (chip) {
      mapFilter = chip.dataset.chip;
      renderFleetMap();
    } else if (open) {
      const j = store.dispatches.find((d) => d.id === open.dataset.open);
      if (j) {
        switchView("dispatch");
        selectDispatch(j.id);
      }
    } else if (m) {
      mapSel = m.dataset.reg;
      renderFleetMap();
    }
  });
}
function renderFleetMap() {
  if (currentView !== "fleet" || !document.getElementById("map")) return;
  const chips = [
    ["all", "All"],
    ["available", "Available"],
    ["route", "On route"],
    ["maintenance", "Maintenance"],
  ];
  document.getElementById("mapChips").innerHTML = chips
    .map(
      ([k, l]) =>
        `<button data-chip="${k}" class="badge ${mapFilter === k ? "badge-transit" : "badge-dispatched"}">${l}</button>`,
    )
    .join("");
  document.getElementById("mapList").innerHTML = store.drivers
    .filter(
      (dr) =>
        mapFilter === "all" ||
        driverState(dr) === mapFilter ||
        (mapFilter === "route" && driverState(dr) === "arrived"),
    )
    .map(
      (dr) =>
        `<button data-reg="${escapeHtml(dr.reg)}" class="text-left text-[12px] p-2 rounded-lg border" style="${mapSel === dr.reg ? "border-color:var(--brand-orange-500)" : ""}"><b>${escapeHtml(dr.name)}</b> · ${escapeHtml(dr.reg)}<br><span style="color:${STATE_COLOR[driverState(dr)]}">${STATE_LABEL[driverState(dr)]}</span></button>`,
    )
    .join("");
  const sel = store.drivers.find((d) => d.reg === mapSel),
    info = document.getElementById("mapInfo");
  if (sel) {
    const j = activeJob(sel),
      eta = j ? Math.max(1, Math.round(km(sel.pos, dropPoint(j)) / 0.5)) : null;
    info.innerHTML = `<div class="text-[12.5px]"><b>${escapeHtml(sel.name)}</b> · ${escapeHtml(sel.reg)} · ${STATE_LABEL[driverState(sel)]}<label class="ml-2"><input type="checkbox" data-follow ${gFollow ? "checked" : ""}> Follow driver</label>${j ? `<br>${escapeHtml(j.id)} → ${escapeHtml(j.client)} · ETA ~${eta} min <button data-open="${escapeHtml(j.id)}" class="btn-primary text-[12px] px-3 py-1.5 rounded-lg ml-2">Open on driver simulator</button>` : ""}</div>`;
  } else info.innerHTML = "";
  lastTickAt = Date.now();
  if (typeof syncLeafletMap === "function") syncLeafletMap();
}
setInterval(() => {
  const b = document.getElementById("liveBadge");
  if (b)
    b.textContent = `LIVE · updated ${Math.round((Date.now() - lastTickAt) / 1000)}s ago`;
}, 1000);

/* ---------- Wiring into the v1 views ---------- */
const _renderOrders = renderOrders;
renderOrders = function () {
  store.orders.forEach(ensureOrderMeta);
  _renderOrders();
  store.orders.forEach((o) => {
    const card = document.getElementById("order-" + o.id);
    if (!card) return;
    const b = document.createElement("button");
    b.className = "btn-ghost w-full text-[12.5px] py-2 rounded-lg mt-1.5";
    b.textContent = "Assign manually";
    b.dataset.act = "open-assign";
    b.dataset.order = o.id;
    card.appendChild(b);
    const t = document.createElement("button");
    t.className = "btn-ghost w-full text-[12.5px] py-2 rounded-lg mt-1.5";
    t.textContent = "View ticket";
    t.dataset.act = "view-ticket";
    t.dataset.order = o.id;
    card.appendChild(t);
  });
  const g = batchGroup();
  if (g) {
    const n = document.createElement("div");
    n.className = "card p-3 text-[12.5px]";
    n.style.borderColor = "var(--brand-orange-400)";
    n.innerHTML = `<b>${g[1].length} orders in ${escapeHtml(g[0])}</b> — batch to one driver? <button data-act="batch" class="btn-primary text-[12px] px-3 py-1.5 rounded-lg mt-2 block">Batch assign</button>`;
    ordersFeed.prepend(n);
  }
};
const _driverStep = driverStep;
driverStep = function (id, step) {
  _driverStep(id, step);
  const d = dispatches.find((x) => x.id === id);
  if (d) {
    if (step === "start") d.startedAt = Date.now();
    if (step === "arrived") d.arrivedAt = Date.now();
    if (step === "complete") d.finishedAt = Date.now();
    audit(d.orderId || d.id, `Driver ${d.driver}: ${step} → ${d.statusKey}`);
    bus.emit("dispatch:status", d);
  }
};
const _renderDispatches = renderDispatches;
renderDispatches = function () {
  _renderDispatches();
  dispatches.forEach((d) => {
    const c = document.getElementById("dispatch-" + d.id);
    if (!c || !d.why) return;
    const w = document.createElement("div");
    w.className = "text-[11px] mt-2";
    w.style.color = "var(--ink-400)";
    w.innerHTML = `<span title="${escapeHtml(d.why)}">Why this driver? ${d.method === "auto" ? "" : "👤"} ${escapeHtml(d.why)}</span>`;
    c.appendChild(w);
  });
};

// Fleet page: reactive table/counts/map
const _renderFleet = renderFleet;
renderFleet = function () {
  _renderFleet();
  initFleetMap();
  renderFleetMap();
};
["dispatch:created", "dispatch:status"].forEach((e) =>
  bus.on(e, () => {
    if (currentView === "fleet") renderFleet();
    const m = document.getElementById("assignModal");
    if (m.classList.contains("open") && m.dataset.step === "drivers")
      renderAssignModal();
  }),
);
bus.on("driver:moved", renderFleetMap);

const ACTIONS = {
  "open-assign": (a) => openAssignModal(a.dataset.order),
  "close-modal": closeAssignModal,
  "confirm-assign": confirmManualAssign,
  "to-drivers": submitIntake,
  batch: batchAssign,
};
// Modal DOM + delegated events (no inline onclick)
(function () {
  const m = document.createElement("div");
  m.id = "assignModal";
  m.className = "modal-backdrop";
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-modal", "true");
  m.innerHTML = '<div class="modal-card"></div>';
  document.body.appendChild(m);
  m.addEventListener("click", (e) => {
    if (e.target === m) closeAssignModal();
  });
  m.addEventListener("change", (e) => {
    if (e.target.id === "modalOrder") {
      m.dataset.order = e.target.value;
      renderAssignModal();
    }
    if (e.target.name === "drv") m.dataset.driver = e.target.value;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && m.classList.contains("open")) closeAssignModal();
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const fn = ACTIONS[a.dataset.act];
    if (fn) fn(a);
  });
  const hdr = document.getElementById("dispatchHeaderExtras");
  if (hdr) {
    const b = document.createElement("button");
    b.className = "btn-ghost text-[13px] px-3 md:px-4 py-2.5 rounded-lg";
    b.textContent = "Assign manually";
    b.dataset.act = "open-assign";
    hdr.prepend(b);
  }
})();

// Seed COD on orders for later phases, re-render, start the engine
store.orders.forEach((o) => {
  if (o.codAmount === undefined)
    o.codAmount = hash(o.id) % 10 < 4 ? (1 + (hash(o.id) % 9)) * 500 : 0;
});
renderOrders();
setInterval(tick, TICK_MS);
