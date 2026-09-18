/* =========================================================================
   DISPIST — Smart Dispatch, Routing & Tracking demo
   Built by Harxel Agency · harxelco.com
   All logic below is client-side simulation for demo purposes.
========================================================================= */

/* ---------- Data pools ---------- */
const AREAS = ['Industrial Area Route','Mombasa Road Fleet','CBD Express Delivery','Westlands Same-Day','Thika Road Corridor'];
const CLIENTS = ['Bowip Agencies','Zuri Distributors','Continental Traders','Savannah Wholesalers','Highland Foods Ltd','Pioneer Hardware','Nyati Logistics Hub'];
const DRIVERS = [
  {name:'D. Kamau', reg:'KDA 214B'},
  {name:'J. Mutiso', reg:'KDB 552L'},
  {name:'A. Njeri', reg:'KDC 887P'},
  {name:'S. Otieno', reg:'KDD 331R'},
  {name:'F. Cherop', reg:'KDE 019T'}
];
const URGENCY = ['high','med','low'];

let orderSeq = 1004;
let dispatchSeq = 3000;
let orders = [];
let dispatches = []; // {id, client, area, driver, reg, phase, statusKey, statusLabel}
let selectedDispatchId = null;
let availableDrivers = [...DRIVERS];

const ordersFeed = document.getElementById('ordersFeed');
const dispatchGrid = document.getElementById('dispatchGrid');
const phoneContent = document.getElementById('phoneContent');
const toastContainer = document.getElementById('toastContainer');
const activeCount = document.getElementById('activeCount');

/* ---------- Utilities ---------- */
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function escapeHtml(s){ const d=document.createElement('div'); d.innerText=s; return d.innerHTML; }
function isMobileViewport(){ return window.matchMedia('(max-width:1023px)').matches; }

function toast(message, tone='success'){
  const el = document.createElement('div');
  el.className = 'toast-item';
  if(tone==='info') el.style.borderLeftColor = 'var(--cobalt-500)';
  if(tone==='warn') el.style.borderLeftColor = 'var(--amber-500)';
  el.innerHTML = `<div class="text-[13px] font-medium">${message}</div>`;
  toastContainer.appendChild(el);
  setTimeout(()=>{
    el.classList.add('fading');
    setTimeout(()=>el.remove(), 320);
  }, 3400);
}

/* ---------- Metrics (dummy, nudge on activity) ---------- */
let futil = 64;
function nudgeFleetUtilization(delta){
  futil = Math.max(30, Math.min(97, futil + delta));
  document.getElementById('futilLabel').textContent = futil + '%';
  document.getElementById('futilBar').style.width = futil + '%';
  document.getElementById('futilBar').style.background = futil > 85 ? 'var(--amber-500)' : 'var(--cobalt-500)';
}
function renderRespBars(){
  const wrap = document.getElementById('respBars');
  wrap.innerHTML = '';
  const vals = [40,55,35,70,50,65,45].map(v => v + Math.floor(Math.random()*10)-5);
  vals.forEach(v=>{
    const bar = document.createElement('div');
    bar.className = 'mini-bar';
    bar.style.height = Math.max(15, Math.min(46, v*0.5)) + 'px';
    wrap.appendChild(bar);
  });
}
renderRespBars();

/* ---------- Column A: Orders feed ---------- */
function simulateNewOrder(){
  const order = {
    id: 'ORD-' + (orderSeq++),
    client: rand(CLIENTS),
    area: rand(AREAS),
    urgency: rand(URGENCY),
    items: Math.floor(Math.random()*8)+1
  };
  orders.unshift(order);
  renderOrders();
  toast(`New order received: <b>${order.id}</b> — ${escapeHtml(order.client)}`, 'info');
}

function urgencyBadge(u){
  const map = {high:['urgency-high','High priority'], med:['urgency-med','Standard'], low:['urgency-low','Flexible']};
  const [cls,label] = map[u];
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderOrders(){
  ordersFeed.innerHTML = '';
  if(orders.length === 0){
    ordersFeed.innerHTML = `<div class="text-[12.5px] text-center py-10" style="color:var(--ink-400);">No incoming orders.<br>Click "Simulate New Incoming Order" above.</div>`;
    return;
  }
  orders.forEach(o=>{
    const card = document.createElement('div');
    card.className = 'order-card card p-3 relative';
    card.id = 'order-' + o.id;
    card.innerHTML = `
      <div class="flex items-start justify-between mb-1.5">
        <span class="font-display font-semibold text-[13px]">${o.id}</span>
        ${urgencyBadge(o.urgency)}
      </div>
      <div class="text-[13px] font-medium">${escapeHtml(o.client)}</div>
      <div class="text-[11.5px] mb-2.5" style="color:var(--ink-400);">${escapeHtml(o.area)} · ${o.items} item${o.items>1?'s':''}</div>
      <button class="btn-primary w-full text-[12.5px] py-2 rounded-lg" onclick="assignDriver('${o.id}', this)">
        Assign Driver
      </button>`;
    ordersFeed.appendChild(card);
  });
}

/* ---------- Driver assignment ---------- */
function assignDriver(orderId, btn){
  const order = orders.find(o=>o.id===orderId);
  if(!order) return;
  const card = document.getElementById('order-'+orderId);
  card.style.position = 'relative';
  btn.disabled = true;

  const overlay = document.createElement('div');
  overlay.className = 'scan-overlay';
  overlay.innerHTML = `<div class="scan-line"></div><div class="scan-spinner"></div><div class="text-[12px] font-medium">Matching best available driver…</div>`;
  card.appendChild(overlay);

  setTimeout(()=>{
    // pick a driver (cycle through pool, reuse if empty)
    if(availableDrivers.length === 0) availableDrivers = [...DRIVERS];
    const driver = availableDrivers.shift();

    orders = orders.filter(o=>o.id!==orderId);
    renderOrders();

    const dispatch = {
      id: 'DSP-' + (dispatchSeq++),
      client: order.client,
      area: order.area,
      driver: driver.name,
      reg: driver.reg,
      phase: 'Assigned',
      statusKey: 'dispatched',
      steps: {start:false, arrived:false, pod:false, complete:false}
    };
    dispatches.unshift(dispatch);
    renderDispatches();
    nudgeFleetUtilization(+4);
    toast(`Matched: <b>${order.id}</b> assigned to <b>${escapeHtml(driver.name)}</b> (${driver.reg})`);

    // On phones, jump the demo viewer to the Active tab so the match is visible
    if(isMobileViewport() && currentView === 'dispatch'){
      switchWorkspaceTab('active');
    }
  }, 1500);
}

/* ---------- Column B: Active dispatches ---------- */
function statusMeta(key){
  const map = {
    dispatched: {cls:'badge-dispatched', label:'Dispatched', pulse:false},
    transit:    {cls:'badge-transit',    label:'In Transit', pulse:true},
    arrived:    {cls:'badge-arrived',    label:'Arrived',    pulse:false},
    delivered:  {cls:'badge-delivered',  label:'Delivered',  pulse:false}
  };
  return map[key];
}

function renderDispatches(){
  dispatchGrid.innerHTML = '';
  activeCount.textContent = dispatches.filter(d=>d.statusKey!=='delivered').length + ' in progress';

  if(dispatches.length === 0){
    dispatchGrid.innerHTML = `<div class="col-span-full text-[12.5px] text-center py-16" style="color:var(--ink-400);">No active dispatches yet.<br>Assign a driver to an incoming order to see it here.</div>`;
    return;
  }

  dispatches.forEach(d=>{
    const meta = statusMeta(d.statusKey);
    const card = document.createElement('div');
    card.className = 'dispatch-card card p-3.5' + (d.id===selectedDispatchId ? ' selected' : '');
    card.id = 'dispatch-' + d.id;
    card.onclick = ()=>selectDispatch(d.id);
    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="font-display font-semibold text-[13px]">${d.id}</div>
          <div class="text-[11.5px]" style="color:var(--ink-400);">${escapeHtml(d.area)}</div>
        </div>
        <span class="badge ${meta.cls}">${meta.pulse ? '<span class="pulse-dot"></span>' : ''}${meta.label}</span>
      </div>
      <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] mt-1">
        <div style="color:var(--ink-400);">Driver</div><div class="font-medium text-right">${escapeHtml(d.driver)}</div>
        <div style="color:var(--ink-400);">Vehicle</div><div class="font-medium text-right">${d.reg}</div>
        <div style="color:var(--ink-400);">Destination</div><div class="font-medium text-right">${escapeHtml(d.client)}</div>
        <div style="color:var(--ink-400);">Route phase</div><div class="font-medium text-right">${d.phase}</div>
      </div>`;
    dispatchGrid.appendChild(card);
  });
}

/* ---------- Column C: Driver mobile simulator ---------- */
function selectDispatch(id){
  selectedDispatchId = id;
  renderDispatches();
  renderPhone();

  // On phones, jump straight to the driver simulator tab once a dispatch is picked
  if(isMobileViewport() && currentView === 'dispatch'){
    switchWorkspaceTab('simulator');
  }
}

function phaseFromSteps(d){
  if(d.steps.complete) return 'Delivered';
  if(d.steps.pod) return 'POD Uploaded';
  if(d.steps.arrived) return 'At client site';
  if(d.steps.start) return 'En route';
  return 'Assigned';
}

function renderPhone(){
  const d = dispatches.find(x=>x.id===selectedDispatchId);
  if(!d){
    phoneContent.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2" style="color:#7C8496;">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7C8496" stroke-width="1.6"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4"/></svg>
        <div class="text-[12.5px]">Select an active dispatch<br>to open the driver app</div>
      </div>`;
    return;
  }
  const meta = statusMeta(d.statusKey);
  phoneContent.innerHTML = `
    <div class="px-4 pt-4 pb-3" style="background:var(--charcoal-800); border-bottom:1px solid var(--line);">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px]" style="color:#8A90A3;">Dispist Driver App</span>
        <span class="badge ${meta.cls}">${meta.pulse ? '<span class="pulse-dot"></span>' : ''}${meta.label}</span>
      </div>
      <div class="font-display font-semibold text-[15px]">${escapeHtml(d.driver)}</div>
      <div class="text-[11.5px]" style="color:#8A90A3;">${d.reg}</div>
    </div>
    <div class="px-4 py-3 flex-1 overflow-y-auto">
      <div class="text-[11px] mb-1" style="color:#8A90A3;">Delivering to</div>
      <div class="font-medium text-[14px] mb-0.5">${escapeHtml(d.client)}</div>
      <div class="text-[12px] mb-4" style="color:#8A90A3;">${escapeHtml(d.area)}</div>

      <div class="text-[11px] mb-2" style="color:#8A90A3;">Trip phase: <span class="text-white font-medium">${phaseFromSteps(d)}</span></div>

      <div class="flex flex-col gap-2 mt-2">
        <button class="step-btn ${d.steps.start ? 'done' : 'ready'}" ${d.steps.start ? 'disabled' : ''} onclick="driverStep('${d.id}','start')">
          ${d.steps.start ? '✓ Trip started' : '▶ Start Trip'}
        </button>
        <button class="step-btn ${d.steps.arrived ? 'done' : (d.steps.start ? 'ready' : '')}" ${(!d.steps.start || d.steps.arrived) ? 'disabled' : ''} onclick="driverStep('${d.id}','arrived')">
          ${d.steps.arrived ? '✓ Arrived at client' : '📍 Arrived at Client Location'}
        </button>
        <button class="step-btn ${d.steps.pod ? 'done' : (d.steps.arrived ? 'ready' : '')}" ${(!d.steps.arrived || d.steps.pod) ? 'disabled' : ''} onclick="driverStep('${d.id}','pod')">
          ${d.steps.pod ? '✓ POD uploaded' : '📤 Upload Digital POD Receipt'}
        </button>
        <button class="step-btn ${d.steps.complete ? 'done' : (d.steps.pod ? 'ready' : '')}" ${(!d.steps.pod || d.steps.complete) ? 'disabled' : ''} onclick="driverStep('${d.id}','complete')">
          ${d.steps.complete ? '✓ Delivery complete' : '✅ Mark Complete'}
        </button>
      </div>
    </div>`;
}

function driverStep(id, step){
  const d = dispatches.find(x=>x.id===id);
  if(!d) return;
  d.steps[step] = true;

  if(step === 'start'){
    d.statusKey = 'transit';
    d.phase = 'En route';
    toast(`${escapeHtml(d.driver)} started the trip to ${escapeHtml(d.client)}`, 'info');
  } else if(step === 'arrived'){
    d.statusKey = 'arrived';
    d.phase = 'At client site';
    toast(`${escapeHtml(d.driver)} arrived at ${escapeHtml(d.client)}`, 'info');
  } else if(step === 'pod'){
    d.phase = 'POD uploaded';
    toast(`Digital POD receipt uploaded for ${d.id}`, 'info');
  } else if(step === 'complete'){
    d.statusKey = 'delivered';
    d.phase = 'Delivered';
    availableDrivers.push({name:d.driver, reg:d.reg});
    nudgeFleetUtilization(-3);
    deliveredThisSession++;
    toast(`Success: Delivery to <b>${escapeHtml(d.client)}</b> logged successfully by Driver ${escapeHtml(d.driver.replace(/^[A-Z]\.\s*/,''))}`);
  }

  renderDispatches();
  renderPhone();

  // Keep the other demo views honest if they're the ones currently on screen
  if(currentView === 'fleet') renderFleet();
  if(currentView === 'orders') renderOrdersView();
  if(currentView === 'reports') renderReports();
}

// Back-compat alias: earlier builds of this demo called the action
// aiDispatchMatch(). Keep the old name working so nothing breaks.
function aiDispatchMatch(orderId, btn){ return assignDriver(orderId, btn); }

/* =========================================================================
   ADDED — sidebar/bottom-nav view switching: Fleet, Orders, Reports, Settings
========================================================================= */

const VIEW_META = {
  dispatch: {title:'Dispatch Center', subtitle:'Live view · Nairobi metro operations'},
  fleet:    {title:'Fleet',           subtitle:'Vehicles, drivers, and live status · Nairobi depot'},
  orders:   {title:'Orders',          subtitle:'All orders — incoming, active, and completed'},
  reports:  {title:'Reports',         subtitle:'Delivery performance this week'},
  settings: {title:'Settings',        subtitle:'Company, notifications, and dispatch defaults'},
  contact:  {title:'Contact Harxel',  subtitle:'Talk to the team that builds and supports Dispist'}
};

let currentView = 'dispatch';

function switchView(view){
  if(!VIEW_META[view]) return;
  currentView = view;

  Object.keys(VIEW_META).forEach(v=>{
    const panel = document.getElementById('view-' + v);
    if(panel) panel.classList.toggle('hidden', v !== view);
  });

  document.querySelectorAll('[data-view]').forEach(el=>{
    el.classList.toggle('active', el.dataset.view === view);
  });

  document.getElementById('pageTitle').textContent = VIEW_META[view].title;
  document.getElementById('pageSubtitle').textContent = VIEW_META[view].subtitle;

  const extras = document.getElementById('dispatchHeaderExtras');
  if(extras) extras.classList.toggle('hidden', view !== 'dispatch');

  if(view === 'fleet') renderFleet();
  if(view === 'orders') renderOrdersView();
  if(view === 'reports') renderReports();
  // 'settings' and 'contact' are static markup — nothing to render.

  closeMobileDrawer();
  window.scrollTo(0,0);
  return false;
}

/* ---------- Mobile hamburger drawer ---------- */
function openMobileDrawer(){
  document.getElementById('mobileDrawer').classList.add('open');
  document.getElementById('mobileDrawerBackdrop').classList.add('open');
}
function closeMobileDrawer(){
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  if(drawer) drawer.classList.remove('open');
  if(backdrop) backdrop.classList.remove('open');
}

/* ---------- Mobile workspace tabs (Orders / Active / Simulator) ---------- */
const WORKSPACE_COL_IDS = {orders:'colOrders', active:'colActive', simulator:'colSimulator'};
let mobileWorkspaceTab = 'orders';

function switchWorkspaceTab(tab){
  if(!WORKSPACE_COL_IDS[tab]) return;
  mobileWorkspaceTab = tab;
  Object.values(WORKSPACE_COL_IDS).forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('mobile-active');
  });
  const activeCol = document.getElementById(WORKSPACE_COL_IDS[tab]);
  if(activeCol) activeCol.classList.add('mobile-active');

  document.querySelectorAll('.workspace-tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

/* =========================================================================
   ADDED — Fleet view
========================================================================= */
const EXTRA_FLEET = [
  {name:'P. Wanjiru', reg:'KDF 442K', location:'Depot — Workshop Bay 2'},
  {name:'M. Kiptoo',  reg:'KDG 765N', location:'Depot — Workshop Bay 1'}
];

function renderFleet(){
  const body = document.getElementById('fleetTableBody');
  if(!body) return;

  const rows = DRIVERS.map(dr=>{
    const activeDispatch = dispatches.find(d=>d.reg===dr.reg && d.statusKey!=='delivered');
    if(activeDispatch){
      return {name:dr.name, reg:dr.reg, status:'On Route', badge:'badge-transit', pulse:true, location:activeDispatch.area};
    }
    return {name:dr.name, reg:dr.reg, status:'Available', badge:'badge-delivered', pulse:false, location:'Nairobi Depot'};
  });

  EXTRA_FLEET.forEach(v=>{
    rows.push({name:v.name, reg:v.reg, status:'Maintenance', badge:'badge-maintenance', pulse:false, location:v.location});
  });

  body.innerHTML = rows.map(r=>`
    <tr>
      <td class="font-medium">${r.reg}</td>
      <td>${escapeHtml(r.name)}</td>
      <td><span class="badge ${r.badge}">${r.pulse ? '<span class="pulse-dot"></span>' : ''}${r.status}</span></td>
      <td style="color:var(--ink-600);">${escapeHtml(r.location)}</td>
    </tr>`).join('');

  const available = rows.filter(r=>r.status==='Available').length;
  const onRoute = rows.filter(r=>r.status==='On Route').length;
  const maint = rows.filter(r=>r.status==='Maintenance').length;
  const summary = document.getElementById('fleetSummary');
  if(summary){
    summary.innerHTML = `
      <div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400);">Total vehicles</div><div class="font-display font-bold text-xl">${rows.length}</div></div>
      <div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400);">Available</div><div class="font-display font-bold text-xl" style="color:var(--green-600);">${available}</div></div>
      <div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400);">On route</div><div class="font-display font-bold text-xl" style="color:var(--cobalt-600);">${onRoute}</div></div>
      <div class="stat-card"><div class="text-[11px] mb-1" style="color:var(--ink-400);">In maintenance</div><div class="font-display font-bold text-xl" style="color:var(--amber-600);">${maint}</div></div>`;
  }
}

/* =========================================================================
   ADDED — Orders view (browsable, past + current)
========================================================================= */
const PAST_ORDERS = [
  {id:'ORD-0978', client:'Nyati Logistics Hub',   area:'Mombasa Road Fleet',     status:'Delivered', date:'2026-09-16'},
  {id:'ORD-0965', client:'Highland Foods Ltd',    area:'Westlands Same-Day',     status:'Delivered', date:'2026-09-16'},
  {id:'ORD-0951', client:'Pioneer Hardware',      area:'Industrial Area Route',  status:'Delivered', date:'2026-09-15'},
  {id:'ORD-0944', client:'Savannah Wholesalers',  area:'Thika Road Corridor',    status:'Delivered', date:'2026-09-15'},
  {id:'ORD-0932', client:'Continental Traders',   area:'CBD Express Delivery',   status:'Cancelled', date:'2026-09-14'},
  {id:'ORD-0921', client:'Zuri Distributors',     area:'Mombasa Road Fleet',     status:'Delivered', date:'2026-09-13'},
  {id:'ORD-0908', client:'Bowip Agencies',        area:'Industrial Area Route',  status:'Delivered', date:'2026-09-12'},
  {id:'ORD-0893', client:'Highland Foods Ltd',    area:'Westlands Same-Day',     status:'Delivered', date:'2026-09-11'},
  {id:'ORD-0881', client:'Nyati Logistics Hub',   area:'Thika Road Corridor',    status:'Delivered', date:'2026-09-10'},
  {id:'ORD-0864', client:'Pioneer Hardware',      area:'CBD Express Delivery',   status:'Delivered', date:'2026-09-09'}
];

function orderStatusBadge(status){
  const map = {
    'Unassigned':['badge-dispatched', false],
    'Dispatched':['badge-dispatched', false],
    'In Transit':['badge-transit', true],
    'Arrived':['badge-arrived', false],
    'Delivered':['badge-delivered', false],
    'Cancelled':['badge-cancelled', false]
  };
  const [cls, pulse] = map[status] || ['badge-dispatched', false];
  return `<span class="badge ${cls}">${pulse ? '<span class="pulse-dot"></span>' : ''}${status}</span>`;
}

function renderOrdersView(){
  const body = document.getElementById('ordersTableBody');
  if(!body) return;

  const today = new Date().toISOString().slice(0,10);
  const live = [];
  orders.forEach(o=>live.push({id:o.id, client:o.client, area:o.area, status:'Unassigned', date:today}));
  dispatches.forEach(d=>live.push({id:d.id, client:d.client, area:d.area, status:statusMeta(d.statusKey).label, date:today}));

  const combined = [...live, ...PAST_ORDERS];

  body.innerHTML = combined.map(o=>`
    <tr>
      <td class="font-medium">${o.id}</td>
      <td>${escapeHtml(o.client)}</td>
      <td style="color:var(--ink-600);">${escapeHtml(o.area)}</td>
      <td>${orderStatusBadge(o.status)}</td>
      <td style="color:var(--ink-400);">${o.date}</td>
    </tr>`).join('');

  const countLabel = document.getElementById('ordersViewCount');
  if(countLabel) countLabel.textContent = combined.length + ' orders total';
}

/* =========================================================================
   ADDED — Reports view (dummy summary + light live nudges)
========================================================================= */
const WEEK_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const WEEK_BASE = [11, 14, 9, 16, 13, 7, 4];
let deliveredThisSession = 0;
const ROUTE_BASE = {
  'Mombasa Road Fleet': 34,
  'Industrial Area Route': 29,
  'CBD Express Delivery': 24,
  'Westlands Same-Day': 21,
  'Thika Road Corridor': 17
};

function renderReports(){
  const weekWrap = document.getElementById('weekBars');
  if(!weekWrap) return;

  const todayIdx = ((new Date().getDay() + 6) % 7); // Mon=0 ... Sun=6
  const counts = WEEK_BASE.map((v,i)=> i===todayIdx ? v + deliveredThisSession : v);
  const max = Math.max(...counts, 1);

  weekWrap.innerHTML = counts.map((c,i)=>`
    <div class="week-bar-col">
      <div class="text-[11px] font-semibold" style="color:var(--ink-600);">${c}</div>
      <div class="week-bar ${i===todayIdx ? 'is-today' : ''}" style="height:${Math.max(10, (c/max)*100)}%;"></div>
      <div class="week-bar-label">${WEEK_LABELS[i]}</div>
    </div>`).join('');

  const totalThisWeek = counts.reduce((a,b)=>a+b, 0);
  const onTimeRate = Math.min(99, 92 + Math.min(4, deliveredThisSession));
  document.getElementById('reportTotalDeliveries').textContent = totalThisWeek;
  document.getElementById('reportOnTimeRate').textContent = onTimeRate + '%';
  document.getElementById('reportOnTimeBar').style.width = onTimeRate + '%';
  document.getElementById('reportActiveNow').textContent = dispatches.filter(d=>d.statusKey!=='delivered').length;

  const routeCounts = {...ROUTE_BASE};
  dispatches.forEach(d=>{ if(d.statusKey==='delivered') routeCounts[d.area] = (routeCounts[d.area]||0) + 1; });
  const routeList = Object.entries(routeCounts).sort((a,b)=>b[1]-a[1]);
  const routeMax = routeList[0] ? routeList[0][1] : 1;
  const routesWrap = document.getElementById('busiestRoutes');
  if(routesWrap){
    routesWrap.innerHTML = routeList.map(([area,count])=>`
      <div class="route-row">
        <div style="min-width:150px;">${escapeHtml(area)}</div>
        <div class="route-bar-track"><div class="route-bar-fill" style="width:${(count/routeMax)*100}%;"></div></div>
        <div class="font-medium" style="min-width:28px; text-align:right;">${count}</div>
      </div>`).join('');
  }
}

/* =========================================================================
   ADDED — Settings view (demo-only, does not persist)
========================================================================= */
function saveSettingsDemo(ev){
  if(ev && ev.preventDefault) ev.preventDefault();
  toast('Settings saved — demo only, changes are not stored', 'info');
  return false;
}

/* ---------- Boot ---------- */
renderOrders();
renderDispatches();
renderPhone();
switchWorkspaceTab('orders');

// Seed with two starter orders so the demo isn't empty on load
simulateNewOrder();
simulateNewOrder();

// Periodic subtle metric drift for realism
setInterval(()=>{ renderRespBars(); }, 6000);
