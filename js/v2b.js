/* =========================================================================
   DISPIST DEMO v2b — tickets, order detail popups, report library, Leaflet map.
   Loaded after v2.js. SIMULATED data is marked; replace with real APIs later.
========================================================================= */
const e = escapeHtml;
const fmtT = ts => ts ? new Date(ts).toLocaleString('en-KE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const kes = n => 'KES '+Number(n||0).toLocaleString('en-KE');
const kv = rows => `<div class="grid gap-y-2 text-[12.5px]" style="grid-template-columns:130px 1fr">${rows.map(([k,v])=>`<div style="color:var(--ink-400)">${k}</div><div class="font-medium break-words">${v}</div>`).join('')}</div>`;

/* ---------- Generic info modal ---------- */
let infoOpener = null;
const infoModal = document.createElement('div');
infoModal.id='infoModal'; infoModal.className='modal-backdrop'; infoModal.setAttribute('role','dialog'); infoModal.setAttribute('aria-modal','true');
infoModal.innerHTML='<div class="modal-card"></div>'; document.body.appendChild(infoModal);
function openInfo(title, html, wide){
  infoOpener = document.activeElement; const c = infoModal.querySelector('.modal-card');
  c.style.maxWidth = wide ? '760px' : '480px';
  c.innerHTML = `<div class="flex justify-between items-center mb-3"><h2 class="font-display font-bold text-base">${e(title)}</h2><button data-act="close-info" aria-label="Close" class="btn-ghost px-3 py-1 rounded-lg">✕</button></div>${html}`;
  infoModal.classList.add('open'); c.querySelector('button').focus();
}
function closeInfo(){ infoModal.classList.remove('open'); if(infoOpener && document.contains(infoOpener)) infoOpener.focus(); }
infoModal.addEventListener('click', ev=>{ if(ev.target===infoModal) closeInfo(); });
document.addEventListener('keydown', ev=>{ if(ev.key==='Escape' && infoModal.classList.contains('open')) closeInfo(); });

/* ---------- Ticket (Incoming Orders) ---------- */
const URG_LABEL = { high:'High priority', med:'Standard', low:'Flexible' };
function openTicket(id){
  const o = store.orders.find(x=>x.id===id); if(!o) return; ensureOrderMeta(o);
  openInfo('Ticket '+o.id, kv([['Status','Unassigned'+(o.flag?' · '+e(o.flag):'')],['Client',e(o.client)],['Contact',e(o.contact)],['Email',e(o.email)],
    ['Location',e(o.area)],['Priority',URG_LABEL[o.urgency]||'Standard'],['Items',o.items],['Cash on delivery',o.codAmount?kes(o.codAmount):'None'],
    ['Source',e(o.source)],['Created',fmtT(o.createdAt)]]) +
    `<button data-act="open-assign" data-order="${e(o.id)}" class="btn-primary w-full py-2.5 rounded-lg mt-4">Assign manually</button>`);
}

/* ---------- Order detail popup (Orders page) ---------- */
function whereIs(dr){
  let best = [DEPOT.name, km(dr.pos, DEPOT)];
  Object.entries(AREA_GEO).forEach(([n,g])=>{ const k = km(dr.pos,{lat:g[0],lng:g[1]}); if(k<best[1]) best=[n,k]; });
  return best[1]<1.2 ? 'Near '+best[0] : best[1].toFixed(1)+' km from '+best[0];
}
function pastTimes(p){ // SIMULATED history times
  const h = hash(p.id), start = new Date(`${p.date}T0${7+h%3}:${String((h%6)*10).padStart(2,'0')}:00`).getTime();
  return { start, end:start+(40+h%80)*60000 };
}
function dur(a,b){ if(!a||!b) return '—'; const m=Math.round((b-a)/60000); return m<60?m+' min':Math.floor(m/60)+' h '+m%60+' min'; }
function openOrderDetail(id){
  const d = dispatches.find(x=>x.id===id||x.orderId===id), o = store.orders.find(x=>x.id===id), p = PAST_ORDERS.find(x=>x.id===id);
  if(d){
    const dr = store.drivers.find(x=>x.reg===d.reg), live = d.statusKey!=='delivered';
    openInfo((d.orderId||d.id)+' · '+statusMeta(d.statusKey).label, kv([['Dispatch',e(d.id)],['Client',e(d.client)],['Contact',e(d.contact||'—')],['Email',e(d.email||'—')],
      ['Delivery location',e(d.area)],['Driver',e(d.driver)],['Vehicle',e(d.reg)+(dr?' · '+e(dr.type):'')],
      ['Driver location',dr?(live?whereIs(dr):'Back at '+e(DEPOT.name)):'—'],['Assigned',fmtT(d.assignedAt)],['Started',fmtT(d.startedAt)],
      ['Finished',d.finishedAt?fmtT(d.finishedAt):(live?'In progress':'—')],['Duration',dur(d.startedAt,d.finishedAt||(live?Date.now():0))],
      ['Assigned by',d.method==='auto'?'Auto (Dispist)':'Dispatcher'],['Cash on delivery',d.codAmount?kes(d.codAmount):'None']]));
  } else if(o){
    ensureOrderMeta(o);
    openInfo(o.id+' · Unassigned', kv([['Client',e(o.client)],['Contact',e(o.contact)],['Email',e(o.email)],['Delivery location',e(o.area)],['Driver','Not assigned yet'],['Created',fmtT(o.createdAt)]]));
  } else if(p){
    const meta = ensureOrderMeta({id:p.id, client:p.client}), t = pastTimes(p), dr = store.drivers[hash(p.id)%5], done = p.status==='Delivered';
    openInfo(p.id+' · '+p.status, kv([['Client',e(p.client)],['Contact',e(meta.contact)],['Email',e(meta.email)],['Delivery location',e(p.area)],
      ['Driver',done?e(dr.name):'—'],['Vehicle',done?e(dr.reg)+' · '+e(dr.type):'—'],['Started',done?fmtT(t.start):'—'],['Finished',done?fmtT(t.end):'—'],['Duration',done?dur(t.start,t.end):'—']]));
  }
}
const _rov = renderOrdersView;
renderOrdersView = function(){ _rov();
  document.querySelectorAll('#ordersTableBody tr').forEach(tr=>{ tr.dataset.oid=tr.firstElementChild.textContent.trim(); tr.tabIndex=0; tr.style.cursor='pointer'; tr.title='Click for details'; }); };
document.addEventListener('click', ev=>{ const tr=ev.target.closest('#ordersTableBody tr[data-oid]'); if(tr) openOrderDetail(tr.dataset.oid); });
document.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ const tr=ev.target.closest&&ev.target.closest('#ordersTableBody tr[data-oid]'); if(tr) openOrderDetail(tr.dataset.oid); } });
['dispatch:created','order:created'].forEach(n=>bus.on(n,()=>{ if(currentView==='orders') renderOrdersView(); }));

/* ---------- Report library (Reports page): view in page or download ---------- */
const csv = rows => rows.map(r=>r.map(c=>{ const s=String(c==null?'':c); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(',')).join('\n');
function orderRows(){
  const live = [...store.orders.map(o=>[o.id,o.client,o.area,'Unassigned',new Date().toISOString().slice(0,10),'','','']),
    ...dispatches.map(d=>[d.orderId||d.id,d.client,d.area,statusMeta(d.statusKey).label,new Date(d.assignedAt||Date.now()).toISOString().slice(0,10),d.driver,fmtT(d.startedAt),fmtT(d.finishedAt)])];
  const past = PAST_ORDERS.map(p=>{ const t=pastTimes(p), ok=p.status==='Delivered'; return [p.id,p.client,p.area,p.status,p.date,ok?store.drivers[hash(p.id)%5].name:'',ok?fmtT(t.start):'',ok?fmtT(t.end):'']; });
  return [['Order','Client','Location','Status','Date','Driver','Started','Finished'], ...live, ...past];
}
const REPORTS = [ // build() uses live store data; SIMULATED until a reporting API exists
  { id:'owner', title:'Daily owner summary', desc:'Deliveries, active jobs and top driver — plain text', file:'daily-owner-summary.txt', mime:'text/plain', build:()=>{
    const done=dispatches.filter(d=>d.statusKey==='delivered').length, act=dispatches.length-done, top=[...store.drivers].sort((a,b)=>b.jobs-a.jobs)[0];
    return { text:`Dispist daily summary — ${new Date().toDateString()}\nDelivered this session: ${done}\nIn progress: ${act}\nUnassigned: ${store.orders.length}\nTop driver by jobs: ${top.name} (${top.jobs})\nBusiest route: ${Object.entries(ROUTE_BASE).sort((a,b)=>b[1]-a[1])[0][0]}\nDemo data only.` }; } },
  { id:'orders', title:'All orders', desc:'Every incoming, active and past order', file:'orders.csv', mime:'text/csv', build:()=>({ rows:orderRows() }) },
  { id:'drivers', title:'Driver performance', desc:'Jobs today and on-time % per driver', file:'driver-performance.csv', mime:'text/csv',
    build:()=>({ rows:[['Driver','Reg','Vehicle','Jobs today','On-time %','Status'], ...store.drivers.map(d=>[d.name,d.reg,d.type,d.jobs,d.onTime,STATE_LABEL[driverState(d)]])] }) },
  { id:'audit', title:'Dispatch audit log', desc:'Who assigned what, and when', file:'audit-log.csv', mime:'text/csv',
    build:()=>({ rows:[['Time','Order','Event','Method'], ...store.auditLog.map(a=>[fmtT(Date.parse(a.t)),a.orderId,a.text,a.method||''])] }) },
  { id:'weekly', title:'Weekly deliveries by day', desc:'Deliveries per day this week', file:'weekly-deliveries.csv', mime:'text/csv',
    build:()=>({ rows:[['Day','Deliveries'], ...WEEK_LABELS.map((l,i)=>[l,WEEK_BASE[i]])] }) }
];
(function(){
  const host = document.getElementById('view-reports'); if(!host) return;
  const sec = document.createElement('div'); sec.className='card p-4 mt-4'; sec.id='reportLibrary';
  sec.innerHTML = `<div class="font-display font-semibold text-[14px] mb-3">Report library</div><div class="flex flex-col gap-2">${REPORTS.map(r=>`
    <div class="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border" style="border-color:rgba(30,30,40,.1)">
      <div class="flex-1 min-w-[180px]"><div class="text-[13px] font-medium">${e(r.title)}</div><div class="text-[11.5px]" style="color:var(--ink-400)">${e(r.desc)} · ${r.file.split('.').pop().toUpperCase()}</div></div>
      <button data-act="view-report" data-rid="${r.id}" class="btn-ghost text-[12px] px-3 py-1.5 rounded-lg">View</button>
      <button data-act="dl-report" data-rid="${r.id}" class="btn-primary text-[12px] px-3 py-1.5 rounded-lg">Download</button></div>`).join('')}</div>`;
  host.appendChild(sec);
})();
function viewReport(id){
  const r = REPORTS.find(x=>x.id===id), out = r.build();
  const body = out.rows ? `<div style="overflow-x:auto"><table class="w-full text-[12px]">${out.rows.map((row,i)=>`<tr>${row.map(c=>`<${i?'td':'th'} class="text-left p-1.5 whitespace-nowrap">${e(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table></div>` : `<pre class="text-[12px] whitespace-pre-wrap">${e(out.text)}</pre>`;
  openInfo(r.title, body + `<button data-act="dl-report" data-rid="${r.id}" class="btn-primary w-full py-2.5 rounded-lg mt-4">Download</button>`, true);
}
function downloadReport(id){
  const r = REPORTS.find(x=>x.id===id), out = r.build(), blob = new Blob([out.rows?csv(out.rows):out.text], {type:r.mime}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = r.file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('Downloaded '+e(r.file),'info');
}

/* ---------- Leaflet/OpenStreetMap fleet map ---------- */
let leafletMap=null, gFollow=false, gLastSel=null;
const driverMarkers={}, driverTrails={};
let fleetOverlays=[];
const toLatLng = p=>[p.lat,p.lng];
const driverIcon = (dr,color,state)=>L.divIcon({
  className:'leaflet-driver-icon',
  html:`<span class="leaflet-driver-dot${state==='route'?' is-moving':''}" style="--driver-color:${color}"></span><span class="leaflet-driver-label">${e(dr.reg)}</span>`,
  iconSize:[100,28],
  iconAnchor:[7,14]
});

function initLeafletMap(){
  const container=document.getElementById('map');
  if(!container || leafletMap) return;
  leafletMap=L.map(container).setView([-1.285,36.84],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(leafletMap);
  L.marker(toLatLng(DEPOT),{icon:L.divIcon({
    className:'leaflet-depot-icon',
    html:`<span></span><b>${e(DEPOT.name)}</b>`,
    iconSize:[140,24],
    iconAnchor:[8,12]
  }),title:DEPOT.name}).addTo(leafletMap);
}

function updateDriverMarker(dr){
  if(!leafletMap) return;
  const state=driverState(dr), color=STATE_COLOR[state];
  let marker=driverMarkers[dr.reg];
  if(!marker){
    marker=driverMarkers[dr.reg]=L.marker(toLatLng(dr.pos),{
      icon:driverIcon(dr,color,state),
      title:dr.name,
      keyboard:true
    }).on('click',()=>{ mapSel=dr.reg; renderFleetMap(); });
  }
  marker.setLatLng(toLatLng(dr.pos));
  marker.setIcon(driverIcon(dr,color,state));
  const visible=mapFilter==='all'||state===mapFilter||(mapFilter==='route'&&state==='arrived');
  if(visible && !leafletMap.hasLayer(marker)) marker.addTo(leafletMap);
  else if(!visible && leafletMap.hasLayer(marker)) leafletMap.removeLayer(marker);

  let trail=driverTrails[dr.reg];
  if(!trail) trail=driverTrails[dr.reg]=L.polyline([],{color,opacity:.4,weight:3}).addTo(leafletMap);
  trail.setLatLngs(dr.trail.concat([dr.pos]).map(toLatLng));
  trail.setStyle({color});
  if(visible && !leafletMap.hasLayer(trail)) trail.addTo(leafletMap);
  else if(!visible && leafletMap.hasLayer(trail)) leafletMap.removeLayer(trail);
  return visible;
}

function syncLeafletMap(){
  if(!leafletMap) return;
  fleetOverlays.forEach(layer=>leafletMap.removeLayer(layer));
  fleetOverlays=[];
  store.drivers.forEach(dr=>{
    const visible=updateDriverMarker(dr), job=activeJob(dr);
    if(job && visible){
      const drop=dropPoint(job);
      fleetOverlays.push(L.marker(toLatLng(drop),{icon:L.divIcon({
        className:'leaflet-drop-icon',
        html:`<span></span><b>${e(job.client)}</b>`,
        iconSize:[150,24],
        iconAnchor:[8,12]
      }),title:job.client}).addTo(leafletMap));
      fleetOverlays.push(L.polyline([toLatLng(dr.pos),toLatLng(drop)],{
        color:'#2F6FE0',opacity:.65,weight:2,dashArray:'5 7'
      }).addTo(leafletMap));
    }
  });
  const selected=store.drivers.find(dr=>dr.reg===mapSel);
  if(selected && (gFollow || gLastSel!==mapSel)) leafletMap.panTo(toLatLng(selected.pos));
  gLastSel=mapSel;
}
document.addEventListener('change',ev=>{
  if(ev.target.dataset && ev.target.dataset.follow!==undefined) gFollow=ev.target.checked;
});
const _rf2 = renderFleet;
renderFleet = function(){
  _rf2();
  initLeafletMap();
  syncLeafletMap();
  requestAnimationFrame(()=>leafletMap.invalidateSize());
};

/* ---------- Action wiring ---------- */
Object.assign(ACTIONS, {
  'open-assign': a=>{ closeInfo(); openAssignModal(a.dataset.order); },
  'view-ticket': a=>openTicket(a.dataset.order),
  'close-info': closeInfo,
  'view-report': a=>viewReport(a.dataset.rid),
  'dl-report': a=>downloadReport(a.dataset.rid)
});
