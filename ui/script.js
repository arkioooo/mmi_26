// ── API ───────────────────────────────────────────────────
const API = {
  get base() { return S.apiBase; },
  async post(path, body) {
    const r = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  },
  async get(path) {
    const r = await fetch(`${this.base}${path}`);
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }
};

// ── STATE ─────────────────────────────────────────────────
const S = {
  apiBase: 'http://localhost:8000',
  userId:  'user_123',
  pending:   [],
  delivered: [],
  bypassed:  [],
  stats: { pending: 0, delivered: 0, deferred: 0, bypass: 0 }
};

// ── ROUTE ─────────────────────────────────────────────────
const DRIVE_TRACKS = {
  commute: {
    label: 'Commute',
    route: [
      {name:'Home',    sig:3, zone:'always_deliver', pct:0},
      {name:'Ring Rd', sig:3, zone:'always_deliver', pct:13},
      {name:'Tunnel',  sig:0, zone:'defer',           pct:25},
      {name:'Suburb',  sig:1, zone:'defer',           pct:38},
      {name:'Highway', sig:3, zone:'always_deliver',  pct:51},
      {name:'Metro',   sig:2, zone:'critical_only',   pct:64},
      {name:'Mall',    sig:3, zone:'always_deliver',  pct:78},
      {name:'Office',  sig:2, zone:'critical_only',   pct:100}
    ],
    points: [
      {x:70, y:226}, {x:172, y:178}, {x:266, y:220}, {x:378, y:150},
      {x:505, y:110}, {x:622, y:172}, {x:742, y:118}, {x:835, y:70}
    ]
  },
  metro: {
    label: 'Metro Line',
    route: [
      {name:'Station', sig:3, zone:'always_deliver', pct:0},
      {name:'Cutting', sig:1, zone:'defer',          pct:12},
      {name:'Tunnel',  sig:0, zone:'defer',          pct:24},
      {name:'Subway',  sig:0, zone:'defer',          pct:42},
      {name:'Hub',     sig:2, zone:'critical_only',  pct:56},
      {name:'Market',  sig:1, zone:'defer',          pct:70},
      {name:'Flyover', sig:3, zone:'always_deliver', pct:84},
      {name:'Office',  sig:3, zone:'always_deliver', pct:100}
    ],
    points: [
      {x:72, y:90}, {x:178, y:116}, {x:280, y:172}, {x:382, y:226},
      {x:512, y:198}, {x:618, y:138}, {x:730, y:96}, {x:836, y:150}
    ]
  },
  airport: {
    label: 'Airport Run',
    route: [
      {name:'Office',  sig:2, zone:'critical_only',   pct:0},
      {name:'CBD',     sig:3, zone:'always_deliver',  pct:15},
      {name:'Flyover', sig:3, zone:'always_deliver',  pct:29},
      {name:'Toll',    sig:1, zone:'defer',           pct:43},
      {name:'Highway', sig:0, zone:'defer',           pct:58},
      {name:'Service', sig:2, zone:'critical_only',   pct:72},
      {name:'Terminal',sig:3, zone:'always_deliver',  pct:88},
      {name:'Gate',    sig:1, zone:'critical_only',   pct:100}
    ],
    points: [
      {x:64, y:244}, {x:182, y:232}, {x:300, y:188}, {x:420, y:122},
      {x:548, y:88}, {x:666, y:112}, {x:768, y:176}, {x:836, y:246}
    ]
  }
};

let activeTrackKey = 'commute';
let ROUTE = DRIVE_TRACKS[activeTrackKey].route;
let ROUTE_SIM = DRIVE_TRACKS[activeTrackKey].points;

// ── DRIVE STATE ───────────────────────────────────────────
const DS = {
  running: false, prog: 0,
  ivl: null, nivl: null,
  pQ: [], dQ: [], bQ: [],
  stats: { p: 0, d: 0, b: 0 },
  rain: [],
  notifCount: 0,
  notifTarget: 7
};

// ── LOOKUPS ───────────────────────────────────────────────
const CATICON = {otp:'🔐', transactional:'💳', social:'💬', marketing:'📢', alert:'⚠️'};
const CATBG   = {
  otp:           'background:var(--red-s)',
  transactional: 'background:var(--amber-s)',
  social:        'background:var(--green-s)',
  marketing:     'background:rgba(255,255,255,0.04)',
  alert:         'background:var(--amber-s)'
};
const PCLS = {critical:'p-c', high:'p-h', normal:'p-n', low:'p-l'};
const GEOIC = {home:'🏠', office:'🏢', subway:'🚇', gym:'🏋️', hospital:'🏥', airport:'✈️', default:'📍'};

// ── HARDCODED SEED ZONES (shown on map even without API) ──
const SEED_ZONES = [
  {label:'home',   lat:13.0827, lng:80.2707, radius_meters:200, zone_type:'always_deliver', deferral_times:[{start:'06:00', end:'10:00', reason:'morning quiet hours'}]},
  {label:'gym',    lat:13.0800, lng:80.2600, radius_meters:150, zone_type:'critical_only'}
];

// ── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('api-disp').textContent = S.apiBase.replace('http://','');
  updConn();
  updStats();
});

// ── NAV ───────────────────────────────────────────────────
function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.pn-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'geo')   initGeoMap();
  if (id === 'drive') initDriveUI();
  if (id === 'inbox') { loadMessages(); renderInbox(); }
}

// ── TOAST & LOG ───────────────────────────────────────────
function toast(msg, t = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show';
  setTimeout(() => el.className = '', 2600);
}

function addLog(msg, t = 'info') {
  const now = new Date();
  const tm  = [now.getHours(), now.getMinutes()].map(n => String(n).padStart(2,'0')).join(':');
  const el  = document.createElement('div');
  el.className = 'le';
  el.innerHTML = `<span class="lt">${tm}</span><span class="l${t}">${msg}</span>`;
  const s = document.getElementById('logstream');
  if (s) { s.appendChild(el); s.scrollTop = s.scrollHeight; }
}

function clearLog() {
  const s = document.getElementById('logstream');
  if (s) s.innerHTML = '';
}

// ── STATS ─────────────────────────────────────────────────
function updStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('s-p',    S.stats.pending);
  set('s-d',    S.stats.delivered);
  set('s-df',   S.stats.deferred);
  set('s-b',    S.stats.bypass);
  set('nav-qc', S.pending.length);
  set('tcc-p',  S.pending.length);
  set('tcc-d',  S.delivered.length);
  set('tcc-b',  S.bypassed.length);
}

// ── NOTIFICATION CARD ─────────────────────────────────────
function makeQI(m) {
  const d   = document.createElement('div');
  const sc  = m.status === 'delivered' ? 'delivered' : m.status === 'bypassed' ? 'bypassed' : 'pending';
  d.className = `qi ${sc}`;
  const ts  = m.ts || new Date().toLocaleTimeString();
  const cat = m.cat || m.category || 'social';
  const pri = m.pri || m.priority || 'normal';
  const stHtml = m.status === 'delivered'
    ? `<span class="std">✓ delivered @ ${m.deliveredAt || ts}</span>`
    : m.status === 'bypassed'
    ? `<span class="stb">⚡ bypassed @ ${ts}</span>`
    : `<span class="stp">⏸ pending since ${ts}</span>`;
  d.innerHTML = `
    <div class="qic" style="${CATBG[cat] || 'background:var(--s2)'}">${CATICON[cat] || '📩'}</div>
    <div class="qb">
      <div class="qh">
        <span class="ptag ${PCLS[pri] || 'p-l'}">${pri}</span>
        <span class="ctag">${cat}</span>
        ${(m.bypass || m.should_bypass_deferral) ? '<span class="ptag p-c" style="font-size:9px;">⚡</span>' : ''}
      </div>
      <div class="qc">${m.content}</div>
      ${m.summary ? `<div class="qs">"${m.summary}"</div>` : ''}
      <div class="qm">${stHtml}<span>user:${m.userId || S.userId}</span></div>
    </div>`;
  return d;
}

function addActivity(m) {
  const c  = document.getElementById('dash-act');
  const em = c.querySelector('.empty');
  if (em) em.remove();
  c.insertBefore(makeQI(m), c.firstChild);
  if (c.children.length > 20) c.lastChild?.remove();
}

// ── INBOX ─────────────────────────────────────────────────
let curTab = 'p';

function switchTab(t) {
  curTab = t;
  ['p','d','b'].forEach(x => document.getElementById('tab-' + x).classList.toggle('active', x === t));
  renderInbox();
}

function renderInbox() {
  const c     = document.getElementById('inbox-c');
  c.innerHTML = '';
  const list  = curTab === 'p' ? S.pending : curTab === 'd' ? S.delivered : S.bypassed;
  if (!list.length) {
    const labels = {p:'Queue empty', d:'No delivered messages', b:'No bypassed messages'};
    const subs   = {p:'Send a notification or run Drive Sim', d:'Messages appear after delivery', b:'OTP / critical messages appear here'};
    c.innerHTML  = `<div class="empty"><div class="empty-icon">◎</div><div class="empty-title">${labels[curTab]}</div><div class="empty-sub">${subs[curTab]}</div></div>`;
    return;
  }
  [...list].reverse().forEach(m => c.appendChild(makeQI(m)));
  updStats();
}

function clearInbox() {
  S.pending = []; S.delivered = []; S.bypassed = [];
  S.stats   = {pending:0, delivered:0, deferred:0, bypass:0};
  updStats(); renderInbox(); toast('Inbox cleared');
}

// ── SEND NOTIFY ───────────────────────────────────────────
const PRESETS = {
  otp:     {sender:'bankapp',  content:'Your OTP is 7394. Valid for 5 minutes. Do not share.'},
  payment: {sender:'paytm',   content:'INR 2,500 debited from account ending 4821. Ref: TXN20260418.'},
  social:  {sender:'twitter', content:'@devguy liked your post: "Shipped the MVP!"'},
  spam:    {sender:'promo',   content:'CONGRATULATIONS! You WON a FREE iPhone! Click here now!'},
  alert:   {sender:'security',content:'New login from Chrome on Windows in Mumbai. Secure your account.'}
};

function setPreset(k) {
  document.getElementById('n-content').value = PRESETS[k].content;
  document.getElementById('n-sender').value  = PRESETS[k].sender;
}

// Local fallback classifiers (used only if backend returns nothing)
function guessC(c) {
  const t = c.toLowerCase();
  if (/otp|\b\d{4,6}\b/.test(t))                       return 'otp';
  if (/debit|credit|payment|transaction/.test(t))       return 'transactional';
  if (/offer|sale|discount|win|free|click/.test(t))     return 'marketing';
  if (/login|security|alert|breach|server|cpu/.test(t)) return 'alert';
  return 'social';
}
function guessP(c) {
  const t = c.toLowerCase();
  if (/otp|\b\d{4,6}\b|security|breach|emergency|server/.test(t)) return 'critical';
  if (/debit|credit|payment|meeting|taxi/.test(t))                  return 'high';
  if (/offer|sale|discount|free|win/.test(t))                       return 'low';
  return 'normal';
}

async function sendNotify() {
  const recipient_id = document.getElementById('n-rcpt').value;
  const content      = document.getElementById('n-content').value;
  if (!content.trim()) { toast('Enter a message first'); return; }

  const rbox = document.getElementById('n-result');
  rbox.textContent = 'Sending…';
  rbox.className   = 'rbox';

  try {
    const res = await API.post('/api/notify/', { recipient_id, content });
    rbox.textContent = JSON.stringify(res, null, 2);
    procResp(res, content, recipient_id, rbox);
  } catch(e) {
    rbox.textContent = 'Error: ' + e.message;
    rbox.className   = 'rbox err';
    toast('Backend error');
  }
}

function procResp(data, content, rid, el) {
  const ts  = new Date().toLocaleTimeString();
  const cat = data.category || guessC(content);
  const pri = data.priority  || guessP(content);

  if (data.status === 'dropped_spam') {
    el.className = 'rbox err';
    addActivity({content, cat, pri:'low', status:'pending', ts, userId:rid, summary:'spam blocked'});
    S.stats.pending++;
    toast('🚫 Spam dropped');

  } else if (data.status === 'sent_immediately') {
    el.className = 'rbox ok';
    const m = {content, cat, pri:'critical', status:'bypassed', bypass:true, ts, userId:rid, summary:data.summary};
    S.bypassed.push(m);
    addActivity(m);
    S.stats.bypass++;
    S.stats.delivered++;
    toast('⚡ Sent immediately');

  } else {
    el.className = 'rbox info';
    const m = {content, cat, pri, status:'pending', ts, userId:rid, summary:data.summary};
    S.pending.push(m);
    addActivity(m);
    S.stats.pending++;
    toast('📥 Queued');
  }

  showAna(data, content);
  updStats();
}

function showAna(data, content) {
  document.getElementById('ana-empty').style.display = 'none';
  document.getElementById('ana-prev').style.display  = 'block';
  const p   = data.priority || guessP(content);
  const cat = data.category || guessC(content);
  document.getElementById('ana-tags').innerHTML =
    `<span class="ptag ${PCLS[p] || 'p-l'}">${p}</span>` +
    `<span class="ctag">${cat}</span>` +
    (data.should_bypass_deferral ? '<span class="ptag p-c" style="font-size:9px;">⚡ bypass</span>' : '') +
    (data.is_spam ? '<span class="ptag p-c" style="font-size:9px;">🚫 spam</span>' : '');
  document.getElementById('ana-det').textContent =
    `is_spam:      ${data.is_spam ?? false}
confidence:   ${data.confidence ?? '—'}
priority:     ${p}
category:     ${cat}
summary:      ${data.summary || '—'}
bypass:       ${data.should_bypass_deferral ?? false}`;
}

// ── BEACON ────────────────────────────────────────────────
function updConn() {
  const v   = parseInt(document.getElementById('b-conn')?.value ?? 3);
  const L   = ['Offline (0)','2G (1)','3G (2)','4G/WiFi (3)'];
  const lbl = document.getElementById('conn-lbl');
  if (lbl) lbl.textContent = L[v];
  for (let i = 0; i < 4; i++) {
    const b = document.getElementById('cb' + i);
    if (b) b.className = 'cbar' + (i <= v ? ' c' + v : '');
  }
}

async function sendBeacon() {
  const user_id            = document.getElementById('b-uid').value;
  const lat                = parseFloat(document.getElementById('b-lat').value);
  const lng                = parseFloat(document.getElementById('b-lng').value);
  const connectivity_score = parseInt(document.getElementById('b-conn').value);

  try {
    const res = await API.post('/api/beacon/', {user_id, lat, lng, connectivity_score});
    document.getElementById('b-result').textContent = JSON.stringify(res, null, 2);

    if (res.messages && res.messages.length) {
      const ts = new Date().toLocaleTimeString();
      res.messages.forEach(m => {
        const msg = {...m, status:'delivered', deliveredAt:ts, userId:user_id, cat:m.category, pri:m.priority};
        const idx = S.pending.findIndex(p => p.content === m.content);
        if (idx !== -1) S.pending.splice(idx, 1);
        S.delivered.push(msg);
        S.stats.delivered++;
        addActivity(msg);
      });
      S.stats.pending = S.pending.length;
      updStats();
      const zb = document.getElementById('b-zone');
      if (res.zone) {
        const cls = {always_deliver:'za', defer:'zd', critical_only:'zc'}[res.zone.type] || 'za';
        if (zb) zb.innerHTML = `<span class="zbadge ${cls}">◎ ${res.zone.label} — ${res.zone.type}</span>`;
      }
      toast(`✓ ${res.messages.length} delivered`);
    } else {
      toast('Beacon — nothing deliverable');
    }
  } catch(e) {
    toast('Beacon failed');
  }
}

function useGPS() {
  if (!navigator.geolocation) { toast('Geolocation unavailable'); return; }
  navigator.geolocation.getCurrentPosition(
    p => {
      document.getElementById('b-lat').value = p.coords.latitude.toFixed(4);
      document.getElementById('b-lng').value = p.coords.longitude.toFixed(4);
      toast('✓ GPS updated');
    },
    () => toast('Location denied')
  );
}

// ── GEO MAP (LEAFLET) ─────────────────────────────────────
let geoMap = null;
let pendingPinLatLng = null;
let pendingPopup     = null;
const geoCircles     = [];
const geoMarkers     = [];

const ZONE_COLORS = {
  always_deliver: '#27ae60',
  defer:          '#e67e22',
  critical_only:  '#c0392b'
};

const GEO_LOCAL_KEY = 'truenotify_geo_local_v1';
let geoZonesCache = [];
let geoLoadSeq = 0;

function zoneKey(z) {
  return [
    String(z.label || 'custom').trim().toLowerCase(),
    Number(z.lat).toFixed(6),
    Number(z.lng).toFixed(6)
  ].join('|');
}

function normalizeGeoZone(z) {
  const zone = {
    ...z,
    label: String(z.label || 'custom').trim() || 'custom',
    lat: Number(z.lat),
    lng: Number(z.lng),
    radius_meters: Number(z.radius_meters) || 200,
    zone_type: z.zone_type || 'always_deliver',
    deferral_times: Array.isArray(z.deferral_times) ? z.deferral_times : []
  };
  zone._key = zoneKey(zone);
  return zone;
}

function readLocalGeoZones() {
  try {
    const raw = localStorage.getItem(GEO_LOCAL_KEY);
    return raw ? JSON.parse(raw).map(normalizeGeoZone).filter(z => Number.isFinite(z.lat) && Number.isFinite(z.lng)) : [];
  } catch(e) {
    return [];
  }
}

function writeLocalGeoZones(zones) {
  localStorage.setItem(GEO_LOCAL_KEY, JSON.stringify(zones.map(({_key, ...z}) => z)));
}

function upsertLocalGeoZone(zone) {
  const next = normalizeGeoZone(zone);
  const zones = readLocalGeoZones().filter(z => z._key !== next._key);
  zones.push(next);
  writeLocalGeoZones(zones);
}

function mergeGeoZones(...groups) {
  const merged = new Map();
  groups.flat().forEach(z => {
    const zone = normalizeGeoZone(z);
    if (Number.isFinite(zone.lat) && Number.isFinite(zone.lng)) merged.set(zone._key, zone);
  });
  return [...merged.values()];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function getCachedGeoZone(key) {
  return geoZonesCache.find(z => z._key === key);
}

function redrawGeoMap() {
  if (!geoMap) return;
  geoCircles.forEach(c => geoMap.removeLayer(c)); geoCircles.length = 0;
  geoMarkers.forEach(m => geoMap.removeLayer(m)); geoMarkers.length = 0;
  geoZonesCache.forEach(z => renderGeoZone(z));
}

function refreshGeoViews() {
  redrawGeoMap();
  loadGeoCards();
}

function initGeoMap() {
  if (geoMap) { geoMap.invalidateSize(); loadGeoToMap(); return; }

  geoMap = L.map('geo-map', {
    center: [13.0827, 80.2707],
    zoom: 14,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(geoMap);

  // Click handler — drop a pin anywhere
  geoMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    openZonePicker(lat, lng);
  });

  loadGeoToMap();
}

function openZonePicker(lat, lng) {
  if (pendingPopup) { geoMap.closePopup(pendingPopup); }

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="popup-label">📍 Add Zone</div>
    <div style="font-size:9px;color:var(--dim);margin-bottom:8px;">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
    
    <div style="margin-bottom:8px;">
      <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px;">Zone Name</label>
      <input class="popup-input" id="pp-label" placeholder="e.g. home, office, gym" style="margin:0;" />
    </div>
    
    <div style="margin-bottom:8px;">
      <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px;">Radius (meters)</label>
      <input class="popup-input" id="pp-radius" type="number" value="200" style="margin:0;" />
    </div>
    
    <div style="margin-bottom:8px;">
      <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px;">⏰ Quiet Hours (optional)</label>
      <div style="display:flex;gap:3px;margin-bottom:4px;">
        <input class="popup-input" id="pp-defer-start" type="time" style="flex:1;margin:0;font-size:10px;" />
        <span style="color:var(--dim);padding:4px 0;">to</span>
        <input class="popup-input" id="pp-defer-end" type="time" style="flex:1;margin:0;font-size:10px;" />
      </div>
      <div style="display:flex;gap:2px;">
        <button onclick="setQuietPreset('06:00','10:00')" style="flex:1;padding:3px;font-size:8px;background:var(--s2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;">🌅 Morning</button>
        <button onclick="setQuietPreset('21:00','08:00')" style="flex:1;padding:3px;font-size:8px;background:var(--s2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;">🌙 Night</button>
        <button onclick="setQuietPreset('09:00','17:00')" style="flex:1;padding:3px;font-size:8px;background:var(--s2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;">💼 Work</button>
      </div>
    </div>
    
    <div style="margin-bottom:6px;">
      <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px;">Zone Type</label>
      <div style="display:flex;gap:4px;">
        <button class="zone-btn za-btn" onclick="submitZone(${lat},${lng},'always_deliver')" style="flex:1;padding:6px;font-size:10px;margin:0;">✓ Deliver</button>
        <button class="zone-btn zd-btn" onclick="submitZone(${lat},${lng},'defer')" style="flex:1;padding:6px;font-size:10px;margin:0;">⏸ Defer</button>
        <button class="zone-btn zc-btn" onclick="submitZone(${lat},${lng},'critical_only')" style="flex:1;padding:6px;font-size:10px;margin:0;">⚡ Critical</button>
      </div>
    </div>
  `;

  pendingPopup = L.popup({maxWidth: 280, className: 'geo-popup'})
    .setLatLng([lat, lng])
    .setContent(container)
    .openOn(geoMap);
}

function setQuietPreset(start, end) {
  document.getElementById('pp-defer-start').value = start;
  document.getElementById('pp-defer-end').value = end;
}

function editQuietHours(zoneKeyValue) {
  zoneKeyValue = decodeURIComponent(zoneKeyValue);
  const zone = getCachedGeoZone(zoneKeyValue);
  if (!zone) {
    toast('Zone not found');
    return;
  }
  const existing = zone.deferral_times?.[0] || {};
  const editModal = document.createElement('div');
  editModal.className = 'quiet-modal';
  editModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
  editModal.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:20px;max-width:320px;width:90%;">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;">⏰ Edit Quiet Hours</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">${escapeHtml(zone.label)}</div>
      
      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px;">Start Time</label>
        <input id="eh-start" type="time" value="${escapeHtml(existing.start || '')}" style="width:100%;padding:8px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-size:13px;font-family:'Inter',sans-serif;" />
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px;">End Time</label>
        <input id="eh-end" type="time" value="${escapeHtml(existing.end || '')}" style="width:100%;padding:8px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-size:13px;font-family:'Inter',sans-serif;" />
      </div>
      
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="setQuietPresetModal('06:00','10:00')" style="flex:1;padding:8px;font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--muted);cursor:pointer;">🌅 Morning</button>
        <button onclick="setQuietPresetModal('21:00','08:00')" style="flex:1;padding:8px;font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--muted);cursor:pointer;">🌙 Night</button>
        <button onclick="setQuietPresetModal('09:00','17:00')" style="flex:1;padding:8px;font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--muted);cursor:pointer;">💼 Work</button>
      </div>
      
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="this.closest('.quiet-modal').remove()" style="flex:1;padding:8px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);color:var(--muted);cursor:pointer;font-size:12px;">Cancel</button>
        <button onclick="saveQuietHoursEdit('${encodeURIComponent(zone._key)}')" style="flex:1;padding:8px;background:var(--red);border:none;border-radius:var(--rs);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(editModal);
}

function setQuietPresetModal(start, end) {
  document.getElementById('eh-start').value = start;
  document.getElementById('eh-end').value = end;
}

async function saveQuietHoursEdit(zoneKeyValue) {
  zoneKeyValue = decodeURIComponent(zoneKeyValue);
  const start = document.getElementById('eh-start').value;
  const end = document.getElementById('eh-end').value;
  
  if (!start || !end) {
    toast('Please set both start and end times');
    return;
  }

  const selectedZone = getCachedGeoZone(zoneKeyValue);
  if (!selectedZone) {
    toast('Zone not found');
    document.querySelector('.quiet-modal')?.remove();
    return;
  }
  if (selectedZone) {
    const updated = {
      ...selectedZone,
      deferral_times: [{start, end, reason: `${selectedZone.label} quiet hours`}]
    };
    geoZonesCache = geoZonesCache.map(z => z._key === updated._key ? normalizeGeoZone(updated) : z);
    upsertLocalGeoZone(updated);
    try {
      await API.post('/api/geo/quiet-hours', {
        user_id: S.userId,
        label: updated.label,
        lat: updated.lat,
        lng: updated.lng,
        radius_meters: updated.radius_meters,
        zone_type: updated.zone_type,
        deferral_times: updated.deferral_times
      });
    } catch(e) {
      console.warn('quiet hours saved locally only');
    }
  }

  toast(`Quiet hours updated for ${selectedZone?.label || 'zone'}`);
  document.querySelector('.quiet-modal')?.remove();
  refreshGeoViews();
  return; /*
  
  // Find the zone and update it locally
  const allZones = [...SEED_ZONES];
  const zoneToUpdate = allZones.find(z => z.label === zoneName);
  
  if (zoneToUpdate) {
    zoneToUpdate.deferral_times = [{start, end, reason: `${zoneName} quiet hours`}];
  }
  
  toast(`✓ Quiet hours updated for ${zoneName}`);
  document.querySelector('div[style*="rgba(0,0,0,.7)"]').remove();
  
  // Reload map to reflect changes
  if (geoMap) {
    geoCircles.forEach(c => geoMap.removeLayer(c)); geoCircles.length = 0;
    geoMarkers.forEach(m => geoMap.removeLayer(m)); geoMarkers.length = 0;
    loadGeoToMap();
  }
  loadGeoCards(); */
}

async function submitZone(lat, lng, zone_type) {
  const label  = document.getElementById('pp-label')?.value?.trim() || 'custom';
  const radius = parseInt(document.getElementById('pp-radius')?.value) || 200;
  const deferStart = document.getElementById('pp-defer-start')?.value;
  const deferEnd = document.getElementById('pp-defer-end')?.value;

  geoMap.closePopup();

  const payload = {
    user_id: S.userId, label, lat, lng,
    radius_meters: radius, zone_type
  };

  // Add deferral times if provided
  if (deferStart && deferEnd) {
    payload.deferral_times = [{
      start: deferStart,
      end: deferEnd,
      reason: `${label} quiet hours`
    }];
  }

  try {
    await API.post('/api/geo/create', payload);
    toast(`Zone "${label}" added${deferStart ? ' with quiet hours' : ''}`);
  } catch(e) {
    toast('Could not save zone (check backend)');
  }

  // Keep the UI stable even when the backend is slow/offline.
  upsertLocalGeoZone({label, lat, lng, radius_meters: radius, zone_type, deferral_times: payload.deferral_times});
  await loadGeoToMap();
}

function renderGeoZone(z) {
  const color = ZONE_COLORS[z.zone_type] || '#888';
  const icon  = GEOIC[z.label] || GEOIC.default;

  // Circle
  const circle = L.circle([z.lat, z.lng], {
    radius: z.radius_meters,
    color, fillColor: color,
    fillOpacity: 0.15, weight: 2
  }).addTo(geoMap);

  // Marker
  const divIcon = L.divIcon({
    className: '',
    html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.5);">${icon}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  let popupContent = `<strong>${icon} ${z.label}</strong><br/><span style="font-size:11px;color:#999;font-family:monospace;">${z.zone_type}</span><br/><span style="font-size:11px;color:#999;">r=${z.radius_meters}m</span>`;
  
  if (z.deferral_times && z.deferral_times.length > 0) {
    const times = z.deferral_times.map(w => `${w.start}-${w.end}`).join(', ');
    popupContent += `<br/><span style="font-size:10px;color:#f39c12;font-family:monospace;">⏸ Quiet: ${times}</span>`;
  }

  const marker = L.marker([z.lat, z.lng], {icon: divIcon})
    .addTo(geoMap)
    .bindPopup(popupContent);

  geoCircles.push(circle);
  geoMarkers.push(marker);
}

async function loadGeoToMap() {
  const seq = ++geoLoadSeq;
  let apiZones = [];
  try {
    const res = await API.get(`/api/geo/${S.userId}`);
    apiZones = res.profiles || [];
  } catch(e) {
    console.warn('loadGeoToMap API failed; using local zones');
  }

  if (seq !== geoLoadSeq) return;
  geoZonesCache = mergeGeoZones(SEED_ZONES, apiZones, readLocalGeoZones());
  redrawGeoMap();
  loadGeoCards();
  return;

  // Clear existing layers
  geoCircles.forEach(c => geoMap.removeLayer(c)); geoCircles.length = 0;
  geoMarkers.forEach(m => geoMap.removeLayer(m)); geoMarkers.length = 0;

  // Always show seed zones
  SEED_ZONES.forEach(z => renderGeoZone(z));

  // Try to load from API
  try {
    const res = await API.get(`/api/geo/${S.userId}`);
    (res.profiles || []).forEach(z => {
      // Skip if it's already a seed zone
      const isSeed = SEED_ZONES.some(s => s.label === z.label && s.lat == z.lat);
      if (!isSeed) renderGeoZone(z);
    });
  } catch(e) {
    console.warn('loadGeoToMap API failed — using seeds only');
  }

  loadGeoCards();
}

async function loadGeoCards() {
  const container = document.getElementById('geo-cards');
  if (!container) return;

  let zones = geoZonesCache.length ? geoZonesCache : mergeGeoZones(SEED_ZONES, readLocalGeoZones());

  if (!zones.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📍</div><div class="empty-title">No zones yet</div><div class="empty-sub">Click on the map to add one</div></div>';
    return;
  }

  container.innerHTML = '';
  zones.forEach((z, idx) => {
    const div = document.createElement('div');
    div.className = 'geo-card';
    const icon = GEOIC[z.label] || GEOIC.default;
    const cls  = {always_deliver:'za', defer:'zd', critical_only:'zc'}[z.zone_type] || 'za';
    
    let deferralHtml = '';
    let deferralStatus = '';
    const hasQuietHours = z.deferral_times && z.deferral_times.length > 0;
    if (hasQuietHours) {
      const timeWindows = z.deferral_times.map(w => `${w.start}-${w.end}`).join(', ');
      deferralHtml = `<div style="margin-top:6px;padding:6px;background:var(--amber-s);border-radius:5px;">
        <div style="font-size:9px;color:var(--amber);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">⏸ Quiet Hours: ${timeWindows}</div>
        <button onclick="editQuietHours('${encodeURIComponent(z._key)}')" style="width:100%;padding:4px;font-size:9px;background:var(--s2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;transition:all .2s;">✏️ Edit</button>
      </div>`;
      deferralStatus = '<span style="display:inline-block;background:var(--amber-s);color:var(--amber);padding:2px 6px;border-radius:4px;font-size:8px;margin-top:4px;">⏸ Has Quiet Hours</span>';
    } else {
      deferralHtml = `<div style="margin-top:6px;padding:6px;background:var(--s1);border-radius:5px;">
        <div style="font-size:9px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">Quiet Hours: Not set</div>
        <button onclick="editQuietHours('${encodeURIComponent(z._key)}')" style="width:100%;padding:4px;font-size:9px;background:var(--s2);border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;transition:all .2s;">Set Quiet Hours</button>
      </div>`;
    }
    
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <div>
          <div class="geo-card-label">${icon} ${z.label}</div>
          <div class="geo-card-coords">${parseFloat(z.lat).toFixed(4)}, ${parseFloat(z.lng).toFixed(4)}</div>
        </div>
        <button onclick="geoMap.flyTo([${z.lat}, ${z.lng}], 16)" style="padding:4px 8px;background:var(--s2);border:1px solid var(--border);border-radius:4px;font-size:10px;color:var(--muted);cursor:pointer;">📍</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <span class="zbadge ${cls}">${z.zone_type}</span>
        <span style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;">r=${z.radius_meters}m</span>
      </div>
      ${deferralHtml}`;
    div.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON') {
        geoMap && geoMap.flyTo([z.lat, z.lng], 16);
      }
    };
    container.appendChild(div);
  });
}

// Legacy loadGeo alias used by other pages
async function loadGeo() { loadGeoCards(); }

// ── MESSAGES FROM DB ──────────────────────────────────────
async function loadMessages() {
  try {
    const res  = await API.get(`/api/messages/${S.userId}`);
    const msgs = res.messages || [];
    // DB messages are already delivered — populate delivered tab
    // but only add ones not already tracked in session
    msgs.forEach(m => {
      const already = S.delivered.some(d => d.content === m.content && d.ts === (m.created_at || ''));
      if (!already) {
        S.delivered.push({
          ...m, status:'delivered',
          cat: m.category, pri: m.priority,
          ts: m.created_at ? new Date(m.created_at).toLocaleTimeString() : '—',
          userId: S.userId
        });
      }
    });
    updStats();
  } catch(e) {
    console.warn('loadMessages failed:', e.message);
  }
}

// ── SETTINGS ──────────────────────────────────────────────
function saveSettings() {
  S.apiBase = document.getElementById('set-url').value;
  S.userId  = document.getElementById('set-uid').value;
  document.getElementById('api-disp').textContent = S.apiBase.replace('http://','');
  toast('Settings saved');
}

function resetSession() {
  S.pending=[]; S.delivered=[]; S.bypassed=[];
  S.stats={pending:0,delivered:0,deferred:0,bypass:0};
  updStats();
  const da = document.getElementById('dash-act');
  if (da) da.innerHTML = '<div class="empty"><div class="empty-icon">◎</div><div class="empty-title">No activity</div><div class="empty-sub">Send a notification to begin</div></div>';
  toast('Session reset');
}

// ── DRIVE SIMULATOR ───────────────────────────────────────
function getSeg(pct) {
  for (let i = ROUTE.length - 1; i >= 0; i--)
    if (pct >= ROUTE[i].pct) return ROUTE[i];
  return ROUTE[0];
}

function getRouteIndex(pct) {
  for (let i = ROUTE.length - 2; i >= 0; i--)
    if (pct >= ROUTE[i].pct) return i;
  return 0;
}

function getRoutePosition(pct) {
  const idx = Math.min(getRouteIndex(pct), ROUTE_SIM.length - 2);
  const from = ROUTE[idx];
  const to = ROUTE[idx + 1];
  const a = ROUTE_SIM[idx];
  const b = ROUTE_SIM[idx + 1];
  const span = Math.max(1, to.pct - from.pct);
  const t = Math.max(0, Math.min(1, (pct - from.pct) / span));
  const eased = t * t * (3 - 2 * t);
  return {
    x: a.x + (b.x - a.x) * eased,
    y: a.y + (b.y - a.y) * eased,
    idx
  };
}

function routeSegmentPath(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const bend = (b.y >= a.y ? -1 : 1) * 22;
  return `M ${a.x} ${a.y} Q ${mx} ${my + bend} ${b.x} ${b.y}`;
}

function setDriveTrack(key) {
  if (!DRIVE_TRACKS[key]) return;
  if (DS.running) stopDrive();
  activeTrackKey = key;
  ROUTE = DRIVE_TRACKS[key].route;
  ROUTE_SIM = DRIVE_TRACKS[key].points;
  resetDrive(false);
  initDriveUI();
  addLog(`Track: ${DRIVE_TRACKS[key].label}`, 'info');
}

function initDriveUI() {
  const track = DRIVE_TRACKS[activeTrackKey];
  const trackSelect = document.getElementById('drive-track');
  const routeLabel = document.getElementById('route-label');
  if (trackSelect) trackSelect.value = activeTrackKey;
  if (routeLabel) routeLabel.textContent = `Route · ${track.label}`;
  const segs = document.getElementById('tsegs');
  if (!segs) return;
  segs.innerHTML = '';
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const cls = ROUTE[i].sig >= 2 ? 'seg-g' : ROUTE[i].sig === 1 ? 'seg-a' : 'seg-r';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bg.setAttribute('class', 'route-seg route-seg-bg');
    bg.setAttribute('d', routeSegmentPath(ROUTE_SIM[i], ROUTE_SIM[i + 1]));
    segs.appendChild(bg);
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    s.setAttribute('class', `route-seg seg ${cls}`);
    s.setAttribute('d', routeSegmentPath(ROUTE_SIM[i], ROUTE_SIM[i + 1]));
    s.dataset.idx = i;
    segs.appendChild(s);
  }
  const wp = document.getElementById('wps');
  if (!wp) return;
  wp.innerHTML = '';
  ROUTE.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'wp'; d.id = 'wp' + i;
    d.style.left = (ROUTE_SIM[i].x / 9) + '%';
    d.style.top = (ROUTE_SIM[i].y / 3.2) + '%';
    d.innerHTML = `<div class="wp-dot"></div><div class="wp-name">${r.name}</div>`;
    wp.appendChild(d);
  });
  moveCar(DS.prog);
  updDriveMsg(getSeg(DS.prog));
  updDrivePanels();
  updSigUI(3);
}

function updSigUI(score) {
  const L   = ['Offline','2G','3G','4G'];
  const lbl = document.getElementById('sig-lbl');
  if (lbl) lbl.textContent = L[score] ?? '4G';
  const C = ['s0','s1','s2','s3'];
  for (let i = 0; i < 4; i++) {
    const b = document.getElementById('sb' + i);
    if (b) b.className = 'sigb' + (i <= score ? ' ' + C[score] : '');
  }
}

function toggleDrive() { DS.running ? stopDrive() : startDrive(); }

function startDrive() {
  if (DS.prog >= 100) { resetDrive(); return; }
  DS.running = true;
  if (DS.prog === 0 || DS.notifCount >= DS.notifTarget) {
    DS.notifCount = 0;
    DS.notifTarget = 5 + Math.floor(Math.random() * 5);
  }
  document.getElementById('dr-btn').textContent = '⏸ Pause';
  addLog(`Drive started · ${DRIVE_TRACKS[activeTrackKey].label} · ${DS.notifTarget} events`, 'ok');

  DS.ivl = setInterval(() => {
    const sp = parseInt(document.getElementById('dr-spd')?.value) || 3;
    DS.prog  = Math.min(100, DS.prog + sp * 0.35);
    moveCar(DS.prog);
    const seg = getSeg(DS.prog);
    updSigUI(seg.sig);
    updDriveMsg(seg);
    ROUTE.forEach((r,i) => {
      const wp = document.getElementById('wp'+i);
      const isActive = DS.prog >= r.pct;
      wp?.classList.toggle('wpa', isActive);
      // Add a glow pulse effect when entering a waypoint
      if (isActive && !wp?.dataset.passed) {
        wp.dataset.passed = 'true';
        wp.style.animation = 'none';
        setTimeout(() => { wp.style.animation = 'wpGlow .6s ease-out'; }, 10);
      }
    });
    if (DS.prog >= 100) { stopDrive(); finishDrive(); }
  }, 100);

  injectNotif();
  DS.nivl = setInterval(() => injectNotif(), 1100);
}

function stopDrive() {
  DS.running = false;
  clearInterval(DS.ivl); clearInterval(DS.nivl);
  const btn = document.getElementById('dr-btn');
  if (btn) btn.textContent = '▶ Resume';
}

function moveCar(pct) {
  const map = document.getElementById('drive-map');
  const rt  = document.getElementById('tsegs');
  const car = document.getElementById('dr-car');
  if (!map || !rt || !car) return;
  const pos = getRoutePosition(pct);
  car.style.left = (pos.x / 9) + '%';
  car.style.top = (pos.y / 3.2) + '%';

  rt.querySelectorAll('.route-seg.seg').forEach(seg => {
    seg.classList.toggle('active', Number(seg.dataset.idx) === pos.idx);
  });
}

function updDriveMsg(seg) {
  const msgs = {
    0: 'No signal — all messages queued.',
    1: 'Weak 2G — deferring non-critical.',
    2: '3G — delivering messages now.',
    3: 'Strong 4G — real-time delivery.'
  };
  const zl = seg.zone === 'defer'         ? ' ◉ defer zone'
           : seg.zone === 'critical_only' ? ' ◉ critical_only'
           :                                ' ◉ always_deliver';
  const msgEl = document.getElementById('dr-msg');
  const zEl   = document.getElementById('dr-z');
  const pill  = document.getElementById('drive-zone-pill');
  if (msgEl) msgEl.textContent = (msgs[seg.sig] || '') + zl;
  if (zEl)   zEl.textContent   = seg.name;
  if (pill)  pill.textContent  = `${seg.name} · ${seg.zone}`;

  // Flush local queue when signal returns
  const can = seg.sig >= 2 && seg.zone !== 'defer';
  if (can && DS.pQ.length > 0) {
    const toFlush = seg.zone === 'critical_only'
      ? DS.pQ.filter(m => (m.pri || m.priority) === 'critical')
      : [...DS.pQ];
    const keep = seg.zone === 'critical_only'
      ? DS.pQ.filter(m => (m.pri || m.priority) !== 'critical')
      : [];

    if (toFlush.length) {
      const ts = new Date().toLocaleTimeString();
      toFlush.forEach(m => {
        const dm = {...m, status:'delivered', deliveredAt:ts};
        DS.dQ.push(dm);
        DS.stats.d++;
        S.delivered.push(dm);
        S.stats.delivered++;
        const idx = S.pending.findIndex(p => p.content === m.content);
        if (idx !== -1) S.pending.splice(idx, 1);
      });
      DS.pQ      = keep;
      DS.stats.p = DS.pQ.length;
      S.stats.pending = S.pending.length;
      addLog(`✓ Flushed ${toFlush.length} at ${seg.name}`, 'ok');
      toast(`✓ ${toFlush.length} delivered at ${seg.name}`);
      updStats();
      updDrivePanels();
    }
  }
}

async function injectNotif() {
  if (!DS.running) return;
  if (DS.notifCount >= DS.notifTarget) {
    clearInterval(DS.nivl);
    return;
  }
  DS.notifCount++;
  const seg = getSeg(DS.prog);
  try {
    const gen = await API.get('/api/generate/');
    const res = await API.post('/api/notify/', {recipient_id: S.userId, content: gen.content});

    const ts  = new Date().toLocaleTimeString();
    const cat = res.category || guessC(gen.content);
    const pri = res.priority  || guessP(gen.content);
    const msg = {
      content: gen.content, cat, pri,
      priority: pri, category: cat,
      summary: res.summary || '',
      status: 'pending', ts, userId: S.userId,
      should_bypass_deferral: res.should_bypass_deferral
    };

    if (res.status === 'dropped_spam') {
      addLog(`🚫 spam: ${gen.content.slice(0,30)}…`, 'warn');
      return;
    }

    if (res.status === 'sent_immediately') {
      const bMsg = {...msg, status:'bypassed', bypass:true, deliveredAt:ts};
      DS.bQ.push(bMsg);
      DS.stats.b++;
      S.bypassed.push(bMsg);
      S.stats.bypass++;
      S.stats.delivered++;
      addActivity(bMsg);
      addLog(`⚡ bypass: ${gen.content.slice(0,30)}…`, 'ok');
      addRain(bMsg, 'nri-b', false);
    } else {
      const can = seg.sig >= 2 && seg.zone !== 'defer';
      if (can) {
        const dMsg = {...msg, status:'delivered', deliveredAt:ts};
        DS.dQ.push(dMsg);
        DS.stats.d++;
        S.delivered.push(dMsg);
        S.stats.delivered++;
        addActivity(dMsg);
        addLog(`✓ delivered: ${gen.content.slice(0,30)}…`, 'ok');
        addRain(dMsg, 'nri-d', false);
      } else {
        DS.pQ.push(msg);
        DS.stats.p = DS.pQ.length;
        S.pending.push({...msg});
        S.stats.pending++;
        S.stats.deferred++;
        addActivity({...msg, status:'pending'});
        addLog(`⏸ deferred: ${gen.content.slice(0,30)}…`, 'warn');
        addRain(msg, 'nri-p', true);
      }
    }

    updStats();
    updDrivePanels();

    // Sync server queue
    API.post('/api/beacon/', {
      user_id: S.userId,
      lat: 13.0827 + Math.random() * 0.01,
      lng: 80.2707 + Math.random() * 0.01,
      connectivity_score: seg.sig
    }).catch(() => {}); // non-blocking, ignore errors

  } catch(e) {
    addLog('❌ ' + e.message, 'err');
  }
}

function addRain(m, cls, blocked) {
  const rain = document.getElementById('nrain');
  const packetLayer = document.getElementById('packet-layer');
  const pos = getRoutePosition(DS.prog);
  const text = (blocked ? 'hold · ' : cls === 'nri-b' ? 'bypass · ' : 'send · ') + (m.content || '').slice(0, 34);
  const packetClass = cls === 'nri-b' ? 'packet-b' : blocked ? 'packet-p' : 'packet-d';

  if (packetLayer) {
    const p = document.createElement('div');
    p.className = `packet ${packetClass}`;
    p.style.left = (pos.x / 9) + '%';
    p.style.top = (pos.y / 3.2) + '%';
    p.textContent = text;
    packetLayer.appendChild(p);
    DS.rain.push(p);
    setTimeout(() => p.remove(), 2200);
  }
  if (!rain) return;
  const el  = document.createElement('div');
  el.className = `nri ${cls}`;
  el.style.left = (Math.random() * 60 + 5) + '%';
  el.textContent = (blocked ? '⏸ ' : '') + (m.content || '').slice(0, 36) + '…';
  rain.appendChild(el);
  DS.rain.push(el);
  requestAnimationFrame(() => { el.style.top = (15 + Math.random() * 55) + '%'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 3000);
  if (DS.rain.length > 12) DS.rain.shift()?.remove();
}

function updDrivePanels() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('dr-p',  DS.stats.p);
  set('dr-d',  DS.stats.d);
  set('dr-b',  DS.stats.b);
  set('dqpc',  DS.pQ.length);
  set('dqdc',  DS.dQ.length);
  set('dqbc',  DS.bQ.length);
  renderDQL('dqpl', DS.pQ, 'var(--amber)');
  renderDQL('dqdl', DS.dQ, 'var(--green)');
  renderDQL('dqbl', DS.bQ, 'var(--red)');
}

function renderDQL(id, arr, color) {
  const c = document.getElementById(id);
  if (!c) return;
  if (!arr.length) {
    c.innerHTML = `<div style="text-align:center;padding:8px;font-size:10px;color:var(--dim);font-family:'JetBrains Mono',monospace;">empty</div>`;
    return;
  }
  c.innerHTML = '';
  [...arr].reverse().slice(0, 8).forEach(m => {
    const d   = document.createElement('div');
    d.className = 'dqitem';
    const pri = m.pri || m.priority || 'normal';
    const cat = m.cat || m.category || 'social';
    d.innerHTML = `
      <div class="dqdot" style="background:${color}"></div>
      <div class="dqmsg">${(m.content||'').slice(0,42)}${(m.content||'').length>42?'…':''}</div>
      <div class="dqinfo">
        <span class="ptag ${PCLS[pri]||'p-l'}" style="font-size:9px;padding:1px 4px;">${pri}</span>
        ${m.deliveredAt ? `<span style="color:var(--green)">✓</span>` : ''}
      </div>`;
    c.appendChild(d);
  });
}

function finishDrive() {
  const btn = document.getElementById('dr-btn');
  const msg = document.getElementById('dr-msg');
  if (btn) btn.textContent = '▶ Start Drive';
  if (msg) msg.textContent = `Complete — Delivered:${DS.stats.d}  Bypassed:${DS.stats.b}  Pending:${DS.stats.p}`;
  addLog(`Done · D:${DS.stats.d} B:${DS.stats.b} P:${DS.stats.p}`, 'ok');
  toast('🏁 Drive complete!');
}

function resetDrive(announce = true) {
  stopDrive();
  DS.prog=0; DS.pQ=[]; DS.dQ=[]; DS.bQ=[];
  DS.stats={p:0,d:0,b:0};
  DS.notifCount=0; DS.notifTarget=7;
  DS.rain.forEach(e => e.remove()); DS.rain=[];
  const btn = document.getElementById('dr-btn');
  const msg = document.getElementById('dr-msg');
  const car = document.getElementById('dr-car');
  if (btn) btn.textContent = '▶ Start Drive';
  if (msg) msg.textContent = 'Press Start — notifications queue in dead zones and flush when signal returns.';
  if (car) moveCar(0);
  document.getElementById('packet-layer')?.replaceChildren();
  updDrivePanels();
  document.querySelectorAll('.wpa').forEach(e => {
    e.classList.remove('wpa');
    delete e.dataset.passed;
  });
  document.querySelectorAll('.seg').forEach(e => e.classList.remove('active'));
  updSigUI(3);
  updDriveMsg(getSeg(0));
  if (announce) addLog('Drive reset', 'warn');
}
