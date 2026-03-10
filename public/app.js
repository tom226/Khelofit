const state = {
  mode: 'login',
  token: localStorage.getItem('kf_token') || '',
  user: null,
  foods: [],
  mealCache: [],
  notifications: [],
  unreadNotifications: 0,
  pushConfig: { enabled: false, publicKey: '' },
  pushEnabledOnDevice: false,
  waterGlasses: Number(localStorage.getItem('kf_water_' + new Date().toISOString().slice(0, 10)) || 0),
  darkMode: localStorage.getItem('kf_dark') === '1',
};

const API_BASE = (() => {
  try {
    if (window?.Capacitor?.isNativePlatform?.()) {
      return 'https://khelofit-web-production.up.railway.app';
    }
  } catch (_) {
  }
  return window.location.origin;
})();

const el = (id) => document.getElementById(id);
const qa = (selector) => Array.from(document.querySelectorAll(selector));

const activityTracker = {
  running: false,
  startTime: null,
  stepCount: 0,
  distanceMeters: 0,
  caloriesEstimate: 0,
  lastPeakAt: 0,
  watchId: null,
  motionBound: null,
  intervalId: null,
  route: [],
  lastPoint: null,
  type: 'walking',
  // improved step detection
  magHistory: [],
  filteredMag: 9.8,
  stepThreshold: 1.2,
  stepRefractory: 280,
  lastValley: 9.8,
  rising: false,
  map: null,
  mapReady: false,
  livePolyline: null,
  plannedPolyline: null,
  routeMarkers: [],
  currentMarker: null,
  plannedRoute: [],
  routeBuilderEnabled: false,
};

const ACTIVITY_LOCAL_KEY = 'kf_activity_local_v1';
const ACTIVITY_SYNC_QUEUE_KEY = 'kf_activity_sync_queue_v1';

function readArrayFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeArrayToStorage(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
  } catch (_) {
  }
}

function getLocalActivities() {
  return readArrayFromStorage(ACTIVITY_LOCAL_KEY)
    .filter((item) => item && typeof item === 'object')
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
}

function saveLocalActivities(list) {
  writeArrayToStorage(ACTIVITY_LOCAL_KEY, list);
}

function upsertLocalActivity(activity) {
  const current = getLocalActivities();
  const incoming = { ...activity };
  if (!incoming.localId) incoming.localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idx = current.findIndex((item) => item.localId && item.localId === incoming.localId);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...incoming };
  } else {
    current.unshift(incoming);
  }
  saveLocalActivities(current.slice(0, 200));
  return incoming;
}

function getActivitySyncQueue() {
  return readArrayFromStorage(ACTIVITY_SYNC_QUEUE_KEY)
    .filter((item) => item && typeof item === 'object' && item.payload);
}

function saveActivitySyncQueue(queue) {
  writeArrayToStorage(ACTIVITY_SYNC_QUEUE_KEY, queue);
}

function queueActivityForSync(localId, payload) {
  const queue = getActivitySyncQueue();
  const idx = queue.findIndex((item) => item.localId === localId);
  const queued = {
    localId,
    payload,
    queuedAt: new Date().toISOString(),
    retryCount: idx >= 0 ? Number(queue[idx].retryCount || 0) : 0,
  };
  if (idx >= 0) {
    queue[idx] = queued;
  } else {
    queue.push(queued);
  }
  saveActivitySyncQueue(queue);
}

function removeQueuedActivity(localId) {
  const queue = getActivitySyncQueue().filter((item) => item.localId !== localId);
  saveActivitySyncQueue(queue);
}

function markLocalActivitySynced(localId) {
  const list = getLocalActivities();
  const idx = list.findIndex((item) => item.localId === localId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      pendingSync: false,
      syncedAt: new Date().toISOString(),
      syncError: '',
    };
    saveLocalActivities(list);
  }
}

function markLocalActivitySyncError(localId, message) {
  const list = getLocalActivities();
  const idx = list.findIndex((item) => item.localId === localId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      pendingSync: true,
      syncError: message || 'Sync pending',
    };
    saveLocalActivities(list);
  }
}

function mergeActivitiesForView(remoteActivities, localActivities) {
  const merged = [];
  const seen = new Set();

  (remoteActivities || []).forEach((activity) => {
    const key = activity?._id || `${activity?.date || ''}|${activity?.type || ''}|${activity?.durationMinutes || 0}|${activity?.caloriesBurned || 0}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ ...activity, pendingSync: false, localOnly: false });
  });

  (localActivities || []).forEach((activity) => {
    const key = activity?.serverId || activity?._id || `${activity?.date || ''}|${activity?.type || ''}|${activity?.durationMinutes || 0}|${activity?.caloriesBurned || 0}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ ...activity, localOnly: true });
  });

  return merged.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
}

function computeActivityStatsFromList(activities) {
  const list = Array.isArray(activities) ? activities : [];
  const totalMinutes = list.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const totalCalories = list.reduce((sum, item) => sum + Number(item.caloriesBurned || 0), 0);
  const totalDistance = list.reduce((sum, item) => sum + Number(item.distanceKm || 0), 0);
  const totalSteps = list.reduce((sum, item) => sum + Number(item.steps || 0), 0);
  const lastActivityType = list[0]?.type || '';
  const uniqueDays = new Set(list.map((item) => String(item.date || '').slice(0, 10)).filter(Boolean));
  return {
    totalMinutes,
    totalCalories,
    totalDistance: Number(totalDistance.toFixed(2)),
    totalSteps,
    sessionCount: list.length,
    streak: uniqueDays.size,
    lastActivityType,
  };
}

async function syncQueuedActivities(showToast = false) {
  if (!state.token) return { synced: 0, remaining: getActivitySyncQueue().length };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: getActivitySyncQueue().length };
  }

  const queue = getActivitySyncQueue();
  if (!queue.length) return { synced: 0, remaining: 0 };

  let synced = 0;
  let blocked = false;

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (blocked) break;
    try {
      await api('/api/activities', { method: 'POST', body: JSON.stringify(item.payload) });
      removeQueuedActivity(item.localId);
      markLocalActivitySynced(item.localId);
      synced += 1;
    } catch (err) {
      markLocalActivitySyncError(item.localId, err.message || 'Sync pending');
      const updatedQueue = getActivitySyncQueue();
      const idx = updatedQueue.findIndex((entry) => entry.localId === item.localId);
      if (idx >= 0) {
        updatedQueue[idx] = {
          ...updatedQueue[idx],
          retryCount: Number(updatedQueue[idx].retryCount || 0) + 1,
          lastError: err.message || 'Request failed',
          lastTriedAt: new Date().toISOString(),
        };
        saveActivitySyncQueue(updatedQueue);
      }
      blocked = true;
    }
  }

  const remaining = getActivitySyncQueue().length;
  if (showToast && synced > 0) toast(`Synced ${synced} offline activit${synced === 1 ? 'y' : 'ies'}`);
  return { synced, remaining };
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceBetweenMeters(a, b) {
  if (!a || !b) return 0;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function plannedRouteDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) {
    meters += distanceBetweenMeters(points[i - 1], points[i]);
  }
  return Number((meters / 1000).toFixed(2));
}

function clearRouteMarkers() {
  if (!activityTracker.map || !Array.isArray(activityTracker.routeMarkers)) return;
  activityTracker.routeMarkers.forEach((marker) => {
    try { marker.remove(); } catch (_) {}
  });
  activityTracker.routeMarkers = [];
}

function updateRouteBuilderUi() {
  const countNode = el('rbPointCount');
  const kmNode = el('rbPlanKm');
  const modeNode = el('rbMode');
  const useBtn = el('usePlannedDistanceBtn');
  const smartBtn = el('buildRoadRouteBtn');
  const clearBtn = el('clearRouteBtn');

  const count = activityTracker.plannedRoute.length;
  const km = plannedRouteDistanceKm(activityTracker.plannedRoute);
  if (countNode) countNode.textContent = String(count);
  if (kmNode) kmNode.textContent = km.toFixed(2);
  if (modeNode) modeNode.textContent = activityTracker.routeBuilderEnabled ? 'Tap map to add waypoints' : 'Builder is off';
  if (useBtn) useBtn.disabled = count < 2;
  if (smartBtn) smartBtn.disabled = count < 2;
  if (clearBtn) clearBtn.disabled = count < 1;
}

function drawPlannedRouteOnMap() {
  if (!activityTracker.map || !window.L) return;
  if (activityTracker.plannedPolyline) {
    try { activityTracker.plannedPolyline.remove(); } catch (_) {}
    activityTracker.plannedPolyline = null;
  }

  clearRouteMarkers();

  const routeLatLngs = activityTracker.plannedRoute.map((p) => [p.lat, p.lng]);
  if (routeLatLngs.length >= 2) {
    activityTracker.plannedPolyline = window.L.polyline(routeLatLngs, {
      color: '#3B7EFE',
      weight: 4,
      opacity: 0.85,
      dashArray: '6,8',
    }).addTo(activityTracker.map);
  }

  routeLatLngs.forEach((latLng, idx) => {
    const marker = window.L.circleMarker(latLng, {
      radius: idx === 0 || idx === routeLatLngs.length - 1 ? 6 : 4,
      color: '#1C1F2A',
      weight: 2,
      fillColor: idx === 0 ? '#25C569' : idx === routeLatLngs.length - 1 ? '#FF6B2B' : '#3B7EFE',
      fillOpacity: 0.95,
    }).addTo(activityTracker.map);
    activityTracker.routeMarkers.push(marker);
  });

  if (routeLatLngs.length >= 2) {
    try {
      activityTracker.map.fitBounds(activityTracker.plannedPolyline.getBounds(), { padding: [20, 20] });
    } catch (_) {}
  }

  updateRouteBuilderUi();
}

function drawLiveRouteOnMap() {
  if (!activityTracker.map || !window.L) return;

  const liveLatLngs = activityTracker.route.map((p) => [p.lat, p.lng]);
  if (activityTracker.livePolyline) {
    try { activityTracker.livePolyline.remove(); } catch (_) {}
    activityTracker.livePolyline = null;
  }

  if (liveLatLngs.length >= 2) {
    activityTracker.livePolyline = window.L.polyline(liveLatLngs, {
      color: '#25C569',
      weight: 5,
      opacity: 0.95,
    }).addTo(activityTracker.map);
  }

  const last = activityTracker.lastPoint;
  if (last) {
    if (activityTracker.currentMarker) {
      try { activityTracker.currentMarker.remove(); } catch (_) {}
      activityTracker.currentMarker = null;
    }
    activityTracker.currentMarker = window.L.circleMarker([last.lat, last.lng], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#25C569',
      fillOpacity: 1,
    }).addTo(activityTracker.map);
  }
}

function routeProfileFromType(type) {
  if (type === 'cycling') return 'cycling';
  if (type === 'walking' || type === 'running') return 'foot';
  return 'foot';
}

async function buildRoadRouteFromWaypoints() {
  const points = activityTracker.plannedRoute;
  if (!Array.isArray(points) || points.length < 2) {
    toast('Add at least 2 waypoints');
    return;
  }

  const profile = routeProfileFromType(String(el('actType')?.value || activityTracker.type || 'walking').toLowerCase());
  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`;

  const btn = el('buildRoadRouteBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Building...';
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates || [];
    if (!coords.length) throw new Error('No route generated');
    activityTracker.plannedRoute = coords.map((entry) => ({
      lng: Number(entry[0]),
      lat: Number(entry[1]),
      timestamp: new Date().toISOString(),
    }));
    drawPlannedRouteOnMap();
    toast('Road route ready');
  } catch (_) {
    toast('Smart route unavailable. Using straight-line route.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Smart Route';
    }
    updateRouteBuilderUi();
  }
}

function clearPlannedRoute() {
  activityTracker.plannedRoute = [];
  drawPlannedRouteOnMap();
}

function initActivityMap() {
  const mapNode = el('trkMap');
  const mapStatus = el('rbMapStatus');
  if (!mapNode) return;

  if (!window.L) {
    if (mapStatus) mapStatus.textContent = 'Map library unavailable. Check internet and reload.';
    return;
  }

  if (!activityTracker.map) {
    activityTracker.map = window.L.map(mapNode, {
      zoomControl: true,
      attributionControl: true,
    }).setView([12.9716, 77.5946], 13);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(activityTracker.map);

    activityTracker.map.on('click', (event) => {
      if (!activityTracker.routeBuilderEnabled) return;
      const point = {
        lat: Number(event.latlng.lat),
        lng: Number(event.latlng.lng),
        timestamp: new Date().toISOString(),
      };
      activityTracker.plannedRoute.push(point);
      drawPlannedRouteOnMap();
    });

    activityTracker.mapReady = true;
  }

  setTimeout(() => {
    try { activityTracker.map.invalidateSize(); } catch (_) {}
    drawPlannedRouteOnMap();
    drawLiveRouteOnMap();
  }, 60);

  if (mapStatus) {
    mapStatus.textContent = activityTracker.routeBuilderEnabled
      ? 'Builder ON: tap map to add waypoints.'
      : 'Builder OFF: enable builder to design route.';
  }

  updateRouteBuilderUi();
}

function getMetForType(type) {
  const map = {
    walking: 3.8,
    running: 7.8,
    cycling: 6.8,
    gym: 5,
    yoga: 2.8,
    football: 7,
    cricket: 5,
    badminton: 6,
    tennis: 7.3,
    swimming: 8,
    kabaddi: 7.5,
    hockey: 8,
    other: 4,
  };
  return map[type] || 4;
}

function getActivityWeightKg() {
  const weight = Number(state.user?.healthProfile?.weightKg || state.user?.goals?.targetWeight || 70);
  if (!Number.isFinite(weight) || weight <= 0) return 70;
  return weight;
}

function estimateCaloriesForSession(type, durationMinutes) {
  const met = getMetForType(type);
  const weight = getActivityWeightKg();
  return Math.round((met * 3.5 * weight / 200) * durationMinutes);
}

function updateActivityTrackerUi() {
  const durationNode = el('trkDuration');
  const timerNode = el('trkTimerDisplay');
  const stepsNode = el('trkSteps');
  const distanceNode = el('trkDistance');
  const caloriesNode = el('trkCalories');
  const statusNode = el('trkStatus');
  const startBtn = el('startTrackingBtn');
  const stopBtn = el('stopTrackingBtn');
  const applyBtn = el('applyTrackingBtn');

  const durationMinutes = activityTracker.startTime
    ? Math.max(0, Math.round((Date.now() - activityTracker.startTime) / 60000))
    : 0;
  const totalSeconds = activityTracker.startTime
    ? Math.max(0, Math.round((Date.now() - activityTracker.startTime) / 1000))
    : 0;
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  if (durationNode) durationNode.value = String(durationMinutes);
  if (timerNode) timerNode.textContent = `${mm}:${ss}`;
  if (stepsNode) stepsNode.textContent = String(activityTracker.stepCount || 0);
  if (distanceNode) distanceNode.textContent = (activityTracker.distanceMeters / 1000).toFixed(2);
  if (caloriesNode) {
    const calories = durationMinutes > 0
      ? estimateCaloriesForSession(activityTracker.type, durationMinutes)
      : Math.round(activityTracker.caloriesEstimate || 0);
    caloriesNode.textContent = String(calories);
  }
  if (statusNode) {
    statusNode.textContent = activityTracker.running
      ? 'Tracking live activity from your device sensors'
      : 'Tap play to begin tracking';
  }

  if (startBtn) startBtn.disabled = activityTracker.running;
  if (stopBtn) stopBtn.disabled = !activityTracker.running;
  if (applyBtn) applyBtn.disabled = activityTracker.running;
}

function stopActivityTracking(reason = '') {
  if (activityTracker.motionBound) {
    window.removeEventListener('devicemotion', activityTracker.motionBound);
    activityTracker.motionBound = null;
  }
  if (activityTracker.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(activityTracker.watchId);
    activityTracker.watchId = null;
  }
  if (activityTracker.intervalId) {
    clearInterval(activityTracker.intervalId);
    activityTracker.intervalId = null;
  }
  activityTracker.running = false;
  updateActivityTrackerUi();
  if (reason) toast(reason);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function toast(message) {
  const node = el('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => node.classList.add('hidden'), 2500);
}

/* ═══ ANIMATED COUNTER ═══ */
function animateCounter(element, target, duration = 800, suffix = '') {
  if (!element) return;
  const start = 0;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + (target - start) * eased);
    element.textContent = current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
    else element.classList.add('counter-animate');
  }
  requestAnimationFrame(update);
}

/* ═══ CONFETTI CELEBRATION ═══ */
function fireConfetti(count = 40) {
  const container = el('confettiContainer');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#FF6B2B', '#FFB020', '#3B7EFE', '#25C569', '#7B61FF', '#FF6B9D'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * .8 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

/* ═══ MOTIVATIONAL QUOTES ═══ */
const FITNESS_QUOTES = [
  { text: 'The only bad workout is the one that didn\'t happen.', author: 'Unknown' },
  { text: 'Take care of your body. It\'s the only place you have to live.', author: 'Jim Rohn' },
  { text: 'Strength does not come from the body. It comes from the will.', author: 'Gandhi' },
  { text: 'The body achieves what the mind believes.', author: 'Napoleon Hill' },
  { text: 'Don\'t count the days, make the days count.', author: 'Muhammad Ali' },
  { text: 'Fitness is not about being better than someone. It\'s about being better than you used to be.', author: 'Khloe Kardashian' },
  { text: 'Your health is an investment, not an expense.', author: 'Unknown' },
  { text: 'Push yourself, because no one else is going to do it for you.', author: 'Unknown' },
  { text: 'Success usually comes to those who are too busy to be looking for it.', author: 'Henry David Thoreau' },
  { text: 'A one hour workout is 4% of your day. No excuses.', author: 'Unknown' },
];

function getRandomQuote() {
  return FITNESS_QUOTES[Math.floor(Math.random() * FITNESS_QUOTES.length)];
}

/* ═══ DARK MODE ═══ */
function applyDarkMode(on) {
  state.darkMode = on;
  document.body.classList.toggle('dark-mode', on);
  localStorage.setItem('kf_dark', on ? '1' : '0');
  const btn = el('darkToggle');
  if (btn) btn.textContent = on ? '☀️' : '🌙';
}

/* ═══ WATER TRACKER ═══ */
function getWaterKey() {
  return 'kf_water_' + new Date().toISOString().slice(0, 10);
}

function addWater(amount) {
  state.waterGlasses = Math.max(0, state.waterGlasses + amount);
  localStorage.setItem(getWaterKey(), String(state.waterGlasses));
  updateWaterUI();
  if (state.waterGlasses >= 8 && amount > 0) {
    fireConfetti(30);
    toast('💧 Hydration goal reached!');
  }
}

function updateWaterUI() {
  const glass = document.querySelector('.water-glass');
  const num = el('waterCount');
  const dots = qa('.water-dot');
  if (glass) glass.style.setProperty('--fill', Math.min(100, (state.waterGlasses / 8) * 100) + '%');
  if (num) animateCounter(num, state.waterGlasses, 300, '');
  dots.forEach((d, i) => d.classList.toggle('filled', i < state.waterGlasses));
}

/* ═══ BMI CALCULATOR ═══ */
function calculateBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm < 50) return null;
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: 'var(--blue)' };
  if (bmi < 25) return { label: 'Normal', color: 'var(--green)' };
  if (bmi < 30) return { label: 'Overweight', color: 'var(--amber)' };
  return { label: 'Obese', color: 'var(--red)' };
}

/* ═══ ACHIEVEMENT BADGES ═══ */
function computeBadges(user, mealSummary, activityStats) {
  const badges = [
    { id: 'first-meal', icon: '🍽️', name: 'First Meal', unlocked: (mealSummary?.totalCalories || 0) > 0 },
    { id: 'first-workout', icon: '💪', name: 'First Workout', unlocked: (activityStats?.sessionCount || 0) > 0 },
    { id: 'streak-3', icon: '🔥', name: '3-Day Streak', unlocked: (activityStats?.streak || 0) >= 3 },
    { id: 'streak-7', icon: '⚡', name: '7-Day Streak', unlocked: (activityStats?.streak || 0) >= 7 },
    { id: 'protein-100', icon: '🥩', name: '100g Protein', unlocked: (mealSummary?.totalProtein || 0) >= 100 },
    { id: 'step-5k', icon: '👟', name: '5K Steps', unlocked: (activityStats?.totalSteps || 0) >= 5000 },
    { id: 'hydrated', icon: '💧', name: 'Hydrated', unlocked: state.waterGlasses >= 8 },
    { id: 'complete-profile', icon: '✅', name: 'Profile Done', unlocked: Boolean(user?.city && user?.healthProfile?.weightKg && (user?.sportsPrefs || []).length > 0) },
    { id: 'calorie-goal', icon: '🎯', name: 'Calorie Goal', unlocked: (mealSummary?.totalCalories || 0) >= (user?.goals?.dailyCalorieTarget || 9999) },
    { id: 'early-bird', icon: '🌅', name: 'Early Bird', unlocked: new Date().getHours() < 8 },
    { id: 'night-owl', icon: '🦉', name: 'Night Owl', unlocked: new Date().getHours() >= 22 },
    { id: 'social', icon: '🏏', name: 'Social Player', unlocked: (user?.sportsPrefs || []).length >= 3 },
  ];
  return badges;
}

function pushNotification(title, message, level = 'info') {
  // Native local notification on Capacitor
  try {
    if (window?.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.LocalNotifications) {
      window.Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [{
          title,
          body: message,
          id: Math.floor(Math.random() * 100000),
          schedule: { at: new Date(Date.now() + 100) },
          sound: null,
          smallIcon: 'ic_launcher',
        }],
      }).catch(() => {});
    }
  } catch (_) {}

  if (state.token) {
    loadNotifications().catch(() => {});
    return;
  }
  const item = {
    id: Date.now().toString(36),
    title,
    message,
    level,
    createdAt: new Date().toISOString(),
  };
  state.notifications.unshift(item);
  state.notifications = state.notifications.slice(0, 100);
  localStorage.setItem('kf_notifications', JSON.stringify(state.notifications));
  if (!el('notifications')?.classList.contains('hidden')) renderNotifications();
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

async function setupGoogleLogin() {
  const wrap = el('googleLoginWrap');
  const hint = el('googleHint');
  if (!wrap || !hint) return;

  wrap.innerHTML = '';
  hint.textContent = '';

  try {
    const config = await api('/api/auth/google-config');
    if (!config?.enabled) {
      hint.textContent = 'Gmail login not configured on server.';
      return;
    }

    const isNative = Boolean(window.Capacitor?.isNativePlatform?.());

    if (isNative) {
      const googleAuth = window.Capacitor?.Plugins?.GoogleAuth;
      if (!googleAuth?.signIn) {
        hint.textContent = 'Native Google login plugin not available. Sync Capacitor plugins.';
        return;
      }

      if (typeof googleAuth.initialize === 'function') {
        await googleAuth.initialize({
          clientId: config.webClientId || config.clientId || '',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
      }

      const nativeBtn = document.createElement('button');
      nativeBtn.className = 'btn btn-primary';
      nativeBtn.style.width = '100%';
      nativeBtn.textContent = 'Continue with Google';
      nativeBtn.addEventListener('click', async () => {
        try {
          const result = await googleAuth.signIn();
          const idToken = result?.authentication?.idToken || result?.idToken || '';
          if (!idToken) throw new Error('Google token not returned from device sign-in');

          const data = await api('/api/auth/google-login', {
            method: 'POST',
            body: JSON.stringify({ idToken })
          });
          setAuth(data.token, data.user);
          pushNotification('Welcome', 'Gmail login successful.', 'success');
          toast('Authenticated with Gmail');
          await refreshAll();
        } catch (err) {
          toast(err.message || 'Gmail login failed');
        }
      });

      wrap.appendChild(nativeBtn);
      return;
    }

    if (!config?.webClientId && !config?.clientId) {
      hint.textContent = 'Web Google Client ID is missing on server.';
      return;
    }

    if (!window.google?.accounts?.id) {
      hint.textContent = 'Google SDK unavailable. Refresh this page.';
      return;
    }

    window.google.accounts.id.initialize({
      client_id: config.webClientId || config.clientId,
      callback: async (response) => {
        try {
          const data = await api('/api/auth/google-login', {
            method: 'POST',
            body: JSON.stringify({ credential: response.credential })
          });
          setAuth(data.token, data.user);
          pushNotification('Welcome', 'Gmail login successful.', 'success');
          toast('Authenticated with Gmail');
          await refreshAll();
        } catch (err) {
          toast(err.message || 'Gmail login failed');
        }
      }
    });

    const btn = document.createElement('div');
    wrap.appendChild(btn);
    window.google.accounts.id.renderButton(btn, {
      type: 'standard',
      theme: 'outline',
      text: 'continue_with',
      shape: 'pill',
      size: 'large'
    });
  } catch (err) {
    hint.textContent = 'Unable to load Gmail login.';
  }
}

function setAuthVisible(visible) {
  const gate = el('authGate');
  const shell = el('appShell');
  const panel = el('authPanel'); // legacy compat
  if (gate) gate.classList.toggle('hidden', !visible);
  if (shell) shell.classList.toggle('hidden', visible);
  if (panel) panel.classList.add('hidden'); // always keep old panel hidden
}

function setView(name) {
  qa('.view').forEach((node) => node.classList.add('hidden'));
  const section = el(name);
  if (section) section.classList.remove('hidden');
  // Update both sidebar and bottom nav links
  qa('.nav-link').forEach((btn) => btn.classList.remove('active'));
  qa(`.nav-link[data-view="${name}"]`).forEach((a) => a.classList.add('active'));
  const title = el('screenTitle');
  const titles = {
    dashboard: '🏠 Home',
    meals: '🍛 Meals',
    activities: '🏃 Activities',
    coach: '🤖 AI Coach',
    events: '📅 Events',
    profile: '👤 Profile',
    onboarding: '✨ Setup',
    matches: '🏏 Matches',
    referrals: '🎁 Referrals',
    notifications: '🔔 Notifications',
    status: '⚙️ System',
  };
  if (title) title.textContent = titles[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function setUserChip() {
  const chip = el('userChip');
  if (!chip) return;
  if (!state.user) {
    chip.classList.add('hidden');
    return;
  }
  chip.classList.remove('hidden');
  chip.textContent = `${state.user.name || 'User'} • ${state.user.email || '-'}`;
}

function setAuth(token, user) {
  state.token = token || '';
  state.user = user || null;
  if (state.token) localStorage.setItem('kf_token', state.token);
  else {
    localStorage.removeItem('kf_token');
    state.notifications = [];
    state.unreadNotifications = 0;
    state.pushEnabledOnDevice = false;
  }
  setAuthVisible(!state.token);
  setUserChip();
}

function renderDashboardActions({ insights, pendingPayments }) {
  const target = el('dashboardActions');
  if (!target) return;

  const items = [];
  const score = Number(insights?.healthScore || 0);
  const unread = Number(state.unreadNotifications || 0);

  if (pendingPayments > 0) {
    items.push({ icon: '💳', iconClass: 'amber', text: 'Pending Payments', desc: `${pendingPayments} booking(s) awaiting payment`, view: 'events', cta: 'Open Events' });
  }
  if (unread > 0) {
    items.push({ icon: '🔔', iconClass: 'pink', text: 'Unread Notifications', desc: `${unread} notification(s) to review`, view: 'notifications', cta: 'Open' });
  }
  if (score < 60) {
    items.push({ icon: '🤖', iconClass: 'purple', text: 'AI Coach Suggestion', desc: 'Health score is low. Generate a plan!', view: 'coach', cta: 'Open Coach' });
  }
  if (!state.user?.city || !(state.user?.sportsPrefs || []).length) {
    items.push({ icon: '✨', iconClass: 'mint', text: 'Complete Your Profile', desc: 'Set city & sports for better matches', view: 'onboarding', cta: 'Setup' });
  }
  if (!items.length) {
    items.push({ icon: '🎯', iconClass: 'blue', text: 'All on Track!', desc: 'Check events or matches to stay active', view: 'events', cta: 'Browse' });
  }

  target.innerHTML = `<div class="action-cards">${items.map((item) => `
    <div class="action-item" data-dashboard-action="${item.view}">
      <div class="action-icon ${item.iconClass}">${item.icon}</div>
      <div class="action-text">
        <h4>${item.text}</h4>
        <p>${item.desc}</p>
      </div>
      <span class="action-chevron">›</span>
    </div>

    <!-- Route Builder Map -->
    <div class="card">
      <h3>🗺 Route Builder</h3>
      <p class="muted" style="margin:4px 0 10px;">For running/walking/cycling: enable builder, tap map to place waypoints, then start activity to overlay live GPS.</p>
      <div id="trkMap" style="height:260px;border-radius:14px;border:1px solid var(--border);overflow:hidden;background:#E9EEF5;"></div>
      <p id="rbMapStatus" class="muted" style="margin-top:8px;">Loading map...</p>
      <div class="toolbar" style="margin-top:8px;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
        <button id="toggleRouteBuilderBtn" class="btn btn-outline">Enable Builder</button>
        <button id="clearRouteBtn" class="btn btn-outline">Clear Route</button>
      </div>
      <div class="toolbar" style="margin-top:8px;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
        <button id="buildRoadRouteBtn" class="btn btn-primary">Smart Route</button>
        <button id="usePlannedDistanceBtn" class="btn btn-ok">Use Planned Distance</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px;font-size:.72rem;color:var(--text-muted);">
        <span>Waypoints: <strong id="rbPointCount">0</strong></span>
        <span>Planned KM: <strong id="rbPlanKm">0.00</strong></span>
        <span id="rbMode">Builder is off</span>
      </div>
    </div>
  `).join('')}</div>`;

  qa('[data-dashboard-action]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.dashboardAction));
  });
}

async function ensurePushEnabled() {
  if (!state.token) return false;
  if (!state.pushConfig?.enabled || !state.pushConfig?.publicKey) {
    toast('Push not configured on server yet');
    return false;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Push not supported on this browser');
    return false;
  }
  if (Notification.permission === 'denied') {
    toast('Push permission denied in browser settings');
    return false;
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') {
    toast('Push permission was not granted');
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.pushConfig.publicKey),
    });
  }

  await api('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription }),
  });

  state.pushEnabledOnDevice = true;
  return true;
}

function healthScore({ mealSummary, activityStats }) {
  const calories = Number(mealSummary?.totalCalories || 0);
  const protein = Number(mealSummary?.totalProtein || 0);
  const sessions = Number(activityStats?.sessionCount || 0);
  const streak = Number(activityStats?.streak || 0);
  const calorieScore = Math.max(0, 40 - Math.abs(2200 - calories) / 55);
  const proteinScore = Math.min(20, protein / 2.5);
  const activityScore = Math.min(25, sessions * 5);
  const streakScore = Math.min(15, streak * 1.5);
  return Math.max(0, Math.min(100, Math.round(calorieScore + proteinScore + activityScore + streakScore)));
}

function renderOnboarding(user) {
  const target = el('onboarding');
  target.innerHTML = `
    <div class="card" style="text-align:center;">
      <div style="font-size:3rem;margin-bottom:8px;">🎯</div>
      <h3>Personalize KheloFit</h3>
      <p class="muted">Set your language, city, sports, and goals</p>
    </div>
    <div class="card">
      <h3>Preferences</h3>
      <div class="form-grid">
        <select id="obLang">
          <option value="en">🇬🇧 English</option>
          <option value="hi">🇮🇳 Hindi</option>
          <option value="ta">Tamil</option>
          <option value="te">Telugu</option>
          <option value="kn">Kannada</option>
          <option value="bn">Bengali</option>
          <option value="mr">Marathi</option>
          <option value="gu">Gujarati</option>
          <option value="ml">Malayalam</option>
        </select>
        <input id="obCity" placeholder="Your city" value="${user?.city || ''}" />
        <input id="obSports" placeholder="Sports (comma separated)" value="${(user?.sportsPrefs || []).join(', ')}" />
      </div>
    </div>
    <div class="card">
      <h3>Goals</h3>
      <div class="form-grid">
        <input id="obGoalWeight" type="number" placeholder="Target Weight (kg)" value="${user?.goals?.targetWeight || ''}" />
        <input id="obGoalCalories" type="number" placeholder="Daily Calories Goal" value="${user?.goals?.dailyCalorieTarget || ''}" />
        <input id="obGoalSteps" type="number" placeholder="Daily Steps Goal" value="${user?.goals?.dailyStepTarget || ''}" />
      </div>
    </div>
    <div class="card">
      <h3>Health Details</h3>
      <div class="form-grid">
        <div class="grid two">
          <input id="obAge" type="number" min="1" max="120" placeholder="Age" value="${user?.healthProfile?.age || ''}" />
          <input id="obHeight" type="number" min="50" max="250" placeholder="Height (cm)" value="${user?.healthProfile?.heightCm || ''}" />
        </div>
        <div class="grid two">
          <input id="obWeight" type="number" min="20" max="300" placeholder="Current Weight (kg)" value="${user?.healthProfile?.weightKg || ''}" />
          <input id="obSleep" type="number" min="0" max="24" step="0.5" placeholder="Avg Sleep (hrs)" value="${user?.healthProfile?.sleepHours || ''}" />
        </div>
      </div>
    </div>
    <button id="saveOnboardingBtn" class="btn btn-primary" style="width:100%;">Save & Continue</button>
  `;

  const lang = el('obLang');
  if (lang) lang.value = user?.language || 'en';

  el('saveOnboardingBtn')?.addEventListener('click', async () => {
    try {
      const goals = {
        targetWeight: Number(el('obGoalWeight').value || 0),
        dailyCalorieTarget: Number(el('obGoalCalories').value || 0),
        dailyStepTarget: Number(el('obGoalSteps').value || 0),
      };
      const payload = {
        language: el('obLang').value,
        city: el('obCity').value.trim(),
        sportsPrefs: (el('obSports').value || '').split(',').map((s) => s.trim()).filter(Boolean),
        healthProfile: {
          age: Number(el('obAge').value || 0),
          heightCm: Number(el('obHeight').value || 0),
          weightKg: Number(el('obWeight').value || 0),
          sleepHours: Number(el('obSleep').value || 0),
        },
        goals,
      };
      await api('/api/users/profile', { method: 'PUT', body: JSON.stringify(payload) });
      pushNotification('Onboarding Updated', 'Your onboarding preferences were saved.', 'success');
      toast('Onboarding saved');
      await loadUser();
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderProfile(user) {
  const target = el('profile');
  const initial = (user?.name || 'U')[0].toUpperCase();
  const healthIntegration = user?.integrations?.healthApp || {};
  const isHealthConnected = Boolean(healthIntegration.connected);
  const syncLabel = healthIntegration.lastSyncedAt
    ? new Date(healthIntegration.lastSyncedAt).toLocaleString()
    : 'Never synced';
  target.innerHTML = `
    <!-- Profile Hero -->
    <div style="text-align:center; padding:20px 20px 8px;">
      <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#FF6B2B,#7B61FF);margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff;font-weight:700;box-shadow:0 6px 24px rgba(255,107,43,0.35);">${initial}</div>
      <div style="font-size:1.2rem;font-weight:800;color:var(--text);">${user?.name || 'User'}</div>
      <div style="font-size:.78rem;color:var(--text-3);">${user?.city || 'India'} • ${user?.language || 'en'}</div>
      <div style="display:flex;justify-content:center;gap:32px;margin:16px 0;">
        <div><div style="font-size:1.1rem;font-weight:800;color:var(--text);">${(user?.sportsPrefs || []).length}</div><div style="font-size:0.68rem;color:var(--text-muted);">Sports</div></div>
        <div><div style="font-size:1.1rem;font-weight:800;color:var(--text);">${user?.goals?.dailyStepTarget || 0}</div><div style="font-size:0.68rem;color:var(--text-muted);">Step Goal</div></div>
      </div>
    </div>

    <!-- Stat Pills -->
    <div class="stat-pills">
      <div class="stat-pill amber-pill">
        <div class="pill-value">${user?.goals?.targetWeight || '–'} <span class="pill-unit">kg</span></div>
        <div class="pill-label">Goal Weight</div>
      </div>
      <div class="stat-pill mint-pill">
        <div class="pill-value">${user?.goals?.dailyCalorieTarget || '–'} <span class="pill-unit">kcal</span></div>
        <div class="pill-label">Daily Calories</div>
      </div>
      <div class="stat-pill blue-pill">
        <div class="pill-value">${user?.healthProfile?.sleepHours || '–'} <span class="pill-unit">hrs</span></div>
        <div class="pill-label">Avg Sleep</div>
      </div>
    </div>

    <!-- BMI Gauge -->
    <div id="bmiGaugeSlot"></div>

    <!-- Edit Profile -->
    <div class="card">
      <h3>Edit Profile</h3>
      <div class="form-grid">
        <input id="pName" value="${user?.name || ''}" placeholder="Name" />
        <input id="pCity" value="${user?.city || ''}" placeholder="City" />
        <input id="pLang" value="${user?.language || ''}" placeholder="Language" />
        <input id="pSports" value="${(user?.sportsPrefs || []).join(', ')}" placeholder="Sports (comma separated)" />
        <div class="grid two">
          <input id="pGoalWeight" type="number" value="${user?.goals?.targetWeight || ''}" placeholder="Target Weight (kg)" />
          <input id="pGoalCalories" type="number" value="${user?.goals?.dailyCalorieTarget || ''}" placeholder="Daily Calories" />
        </div>
        <input id="pGoalSteps" type="number" value="${user?.goals?.dailyStepTarget || ''}" placeholder="Daily Steps Goal" />
        <div class="grid two">
          <input id="pAge" type="number" min="1" max="120" value="${user?.healthProfile?.age || ''}" placeholder="Age" />
          <input id="pHeight" type="number" min="50" max="250" value="${user?.healthProfile?.heightCm || ''}" placeholder="Height (cm)" />
        </div>
        <div class="grid two">
          <input id="pWeight" type="number" min="20" max="300" value="${user?.healthProfile?.weightKg || ''}" placeholder="Weight (kg)" />
          <input id="pSleep" type="number" min="0" max="24" step="0.5" value="${user?.healthProfile?.sleepHours || ''}" placeholder="Avg Sleep (hrs)" />
        </div>
        <button id="saveProfileBtn" class="btn btn-primary" style="width:100%;padding:14px;">Save Profile</button>
      </div>
    </div>

    <div class="card">
      <h3>🔗 Health App Sync</h3>
      <p class="muted">Status: ${isHealthConnected ? `Connected (${healthIntegration.provider || 'Health Connect'})` : 'Not connected'}</p>
      <p class="muted" style="margin-top:4px;">Last synced: ${syncLabel}</p>
      <p class="muted" style="margin-top:8px;">Note: Web browsers cannot directly read data from every installed health app. This connection flow prepares your profile for native Health Connect integration.</p>
      <div class="toolbar" style="margin-top:10px;">
        <button id="connectHealthBtn" class="btn btn-primary">Connect App</button>
        <button id="syncHealthBtn" class="btn btn-ok" ${isHealthConnected ? '' : 'disabled'}>Sync Now</button>
      </div>
      <button id="disconnectHealthBtn" class="btn btn-outline" style="width:100%;margin-top:8px;" ${isHealthConnected ? '' : 'disabled'}>Disconnect</button>
    </div>

    <!-- Quick Links -->
    <div class="card" style="padding:4px 20px;">
      <div class="menu-item" data-profile-nav="matches"><span class="menu-icon">🏏</span><div class="menu-text"><h4>My Matches</h4><p>Find sports partners</p></div><span class="menu-chevron">›</span></div>
      <div class="menu-item" data-profile-nav="referrals"><span class="menu-icon">🎁</span><div class="menu-text"><h4>Referrals & Points</h4><p>Earn rewards</p></div><span class="menu-chevron">›</span></div>
      <div class="menu-item" data-profile-nav="notifications"><span class="menu-icon">🔔</span><div class="menu-text"><h4>Notifications</h4><p>${state.unreadNotifications || 0} unread</p></div><span class="menu-chevron">›</span></div>
      <div class="menu-item" data-profile-nav="status"><span class="menu-icon">⚙️</span><div class="menu-text"><h4>System Status</h4><p>API & database health</p></div><span class="menu-chevron">›</span></div>
    </div>
  `;

  // Render BMI gauge
  const bmiSlot = el('bmiGaugeSlot');
  if (bmiSlot) {
    const bmi = calculateBMI(user?.healthProfile?.weightKg, user?.healthProfile?.heightCm);
    if (!bmi) {
      bmiSlot.innerHTML = '<div class="bmi-gauge"><h3>BMI</h3><p class="muted" style="text-align:center;">Add weight & height to see your BMI gauge</p></div>';
    } else {
      const cat = getBMICategory(bmi);
      const arcLen = Math.PI * 70;
      const bmiClamped = Math.min(40, Math.max(15, bmi));
      const pct = (bmiClamped - 15) / 25;
      const offset = arcLen * (1 - pct);
      const angle = -90 + pct * 180;
      bmiSlot.innerHTML = '<div class="bmi-gauge"><h3>Body Mass Index</h3>' +
        '<div class="bmi-svg-wrap"><svg viewBox="0 0 180 100">' +
        '<path class="bmi-arc-bg" d="M 20 90 A 70 70 0 0 1 160 90" />' +
        '<path class="bmi-arc-fill" d="M 20 90 A 70 70 0 0 1 160 90" stroke="' + cat.color + '" stroke-dasharray="' + arcLen + '" stroke-dashoffset="' + offset + '" />' +
        '<circle cx="90" cy="90" r="4" fill="' + cat.color + '" class="bmi-needle" style="transform:rotate(' + angle + 'deg)" />' +
        '</svg><div class="bmi-center-val">' + bmi + '</div>' +
        '<div class="bmi-center-label" style="color:' + cat.color + '">' + cat.label + '</div></div>' +
        '<div class="bmi-labels"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div></div>';
    }
  }

  el('saveProfileBtn')?.addEventListener('click', async () => {
    try {
      const payload = {
        name: el('pName').value.trim(),
        city: el('pCity').value.trim(),
        language: el('pLang').value.trim() || 'en',
        sportsPrefs: (el('pSports').value || '').split(',').map((s) => s.trim()).filter(Boolean),
        healthProfile: {
          age: Number(el('pAge').value || 0),
          heightCm: Number(el('pHeight').value || 0),
          weightKg: Number(el('pWeight').value || 0),
          sleepHours: Number(el('pSleep').value || 0),
        },
        goals: {
          targetWeight: Number(el('pGoalWeight').value || 0),
          dailyCalorieTarget: Number(el('pGoalCalories').value || 0),
          dailyStepTarget: Number(el('pGoalSteps').value || 0),
        },
      };
      await api('/api/users/profile', { method: 'PUT', body: JSON.stringify(payload) });
      pushNotification('Profile Updated', 'Your profile has been successfully updated.', 'success');
      toast('Profile updated');
      await loadUser();
    } catch (err) {
      toast(err.message);
    }
  });

  el('connectHealthBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          integrations: {
            healthApp: {
              connected: true,
              provider: 'Health Connect',
              lastSyncedAt: new Date().toISOString(),
            }
          }
        })
      });
      pushNotification('Health Sync', 'Health app connected successfully.', 'success');
      toast('Health app connected');
      await loadUser();
    } catch (err) {
      toast(err.message);
    }
  });

  el('syncHealthBtn')?.addEventListener('click', async () => {
    try {
      if (!isHealthConnected) return toast('Connect health app first');
      await api('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          integrations: {
            healthApp: {
              connected: true,
              provider: healthIntegration.provider || 'Health Connect',
              lastSyncedAt: new Date().toISOString(),
            }
          }
        })
      });
      pushNotification('Health Sync', 'Health data sync completed.', 'success');
      toast('Health data synced');
      await loadUser();
    } catch (err) {
      toast(err.message);
    }
  });

  el('disconnectHealthBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          integrations: {
            healthApp: {
              connected: false,
              provider: '',
              lastSyncedAt: null,
            }
          }
        })
      });
      pushNotification('Health Sync', 'Health app disconnected.', 'info');
      toast('Health app disconnected');
      await loadUser();
    } catch (err) {
      toast(err.message);
    }
  });

  qa('[data-profile-nav]').forEach((item) => {
    item.addEventListener('click', () => setView(item.dataset.profileNav));
  });
}

function mealTypeOptions(selected = 'breakfast') {
  const list = ['breakfast', 'lunch', 'snack', 'dinner'];
  return list.map((type) => `<option value="${type}" ${selected === type ? 'selected' : ''}>${type[0].toUpperCase()}${type.slice(1)}</option>`).join('');
}

function renderMeals(foods, meals, summary) {
  const target = el('meals');
  const foodOptions = foods.map((food) => `<option value="${food._id}">${food.name} (${food.calories || 0} cal)</option>`).join('');
  const mealItems = meals.map((m) => `
    <div class="item">
      <h4>🍽️ ${m.mealType} · ${m.totalCalories || 0} cal</h4>
      <p>${(m.items || []).map((i) => `${i.name} x${i.quantity || 1}`).join(', ')}</p>
      <div class="actions"><button class="btn btn-danger" data-meal-delete="${m._id}">Delete</button></div>
    </div>
  `).join('');

  const goalCal = state.user?.goals?.dailyCalorieTarget || 2200;
  const calPct = Math.min(100, Math.round(((summary.totalCalories || 0) / goalCal) * 100));
  const calLeft = Math.max(0, goalCal - (summary.totalCalories || 0));
  const protPct = Math.min(100, Math.round(((summary.totalProtein || 0) / 120) * 100));
  const carbPct = Math.min(100, Math.round(((summary.totalCarbs || 0) / 300) * 100));
  const fatPct = Math.min(100, Math.round(((summary.totalFat || 0) / 65) * 100));
  // Ring SVG
  const ringR = 60;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - calPct / 100);

  target.innerHTML = `
    <!-- Calorie Hero Ring -->
    <div class="completed-ring-card">
      <div class="cr-title">Today's Nutrition</div>
      <div class="cr-ring-wrap">
        <svg viewBox="0 0 150 150">
          <circle class="cr-ring-bg" cx="75" cy="75" r="${ringR}"/>
          <circle class="cr-ring-fill" cx="75" cy="75" r="${ringR}"
            stroke-dasharray="${ringC}"
            stroke-dashoffset="${ringOffset}"
            transform="rotate(-90 75 75)"/>
        </svg>
        <div class="cr-ring-center">
          <div class="cr-ring-val">${summary.totalCalories || 0}</div>
          <div class="cr-ring-unit">kcal</div>
        </div>
      </div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;">Burn ${calLeft} calorie left</div>
      <!-- Macro Progress Bars -->
      <div style="text-align:left;padding:0 4px;">
        <div class="macro-row">
          <div class="macro-dot" style="background:var(--green)"></div>
          <div class="macro-name">Protein</div>
          <div class="macro-bar-wrap"><div class="macro-bar-fill" style="width:${protPct}%;background:var(--green)"></div></div>
          <div class="macro-val">${summary.totalProtein || 0}g</div>
        </div>
        <div class="macro-row">
          <div class="macro-dot" style="background:var(--amber)"></div>
          <div class="macro-name">Carbs</div>
          <div class="macro-bar-wrap"><div class="macro-bar-fill" style="width:${carbPct}%;background:var(--amber)"></div></div>
          <div class="macro-val">${summary.totalCarbs || 0}g</div>
        </div>
        <div class="macro-row">
          <div class="macro-dot" style="background:var(--blue)"></div>
          <div class="macro-name">Fat</div>
          <div class="macro-bar-wrap"><div class="macro-bar-fill" style="width:${fatPct}%;background:var(--blue)"></div></div>
          <div class="macro-val">${summary.totalFat || 0}g</div>
        </div>
      </div>
    </div>

    <!-- Camera Food Scanner -->
    <div class="card" style="background:linear-gradient(135deg,#7B61FF22,#FF6B2B22);border:1px solid #7B61FF44;">
      <h3>📸 Scan Food Photo</h3>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;">Take a photo of your food and AI will detect items & calories instantly</p>
      <div class="form-grid">
        <input type="file" id="foodPhotoInput" accept="image/*" capture="environment" style="display:none;" />
        <div id="photoPreviewWrap" style="display:none;text-align:center;margin-bottom:8px;">
          <img id="photoPreview" style="max-width:100%;max-height:200px;border-radius:12px;object-fit:cover;" />
        </div>
        <div class="toolbar">
          <button id="takePhotoBtn" class="btn btn-primary" style="flex:1;">📷 Take Photo</button>
          <button id="scanPhotoBtn" class="btn btn-ok" style="flex:1;" disabled>🔬 Analyze</button>
        </div>
        <div id="scanResults" style="display:none;">
          <div id="scanResultsContent"></div>
          <button id="addScannedMealBtn" class="btn btn-primary" style="width:100%;margin-top:8px;" disabled>Add All Detected Items</button>
        </div>
      </div>
    </div>

    <!-- Add Meal -->
    <div class="card">
      <h3>Add Meal</h3>
      <div class="form-grid">
        <div class="toolbar">
          <input id="foodSearchInput" placeholder="Search food…" />
          <button id="foodSearchBtn" class="btn btn-outline">🔍 Search</button>
        </div>
        <div class="toolbar">
          <input id="mealDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          <select id="mealType">${mealTypeOptions('breakfast')}</select>
        </div>
        <div class="toolbar">
          <select id="foodSelect">${foodOptions || '<option value="">No foods</option>'}</select>
          <input id="foodQty" type="number" min="1" step="1" value="1" placeholder="Qty" />
        </div>
        <button id="addMealBtn" class="btn btn-primary" style="width:100%;">Add Selected Food</button>
      </div>
    </div>

    <!-- Custom Meal -->
    <div class="card">
      <h3>Quick Custom Entry</h3>
      <div class="form-grid">
        <input id="customFoodName" placeholder="Custom meal name" />
        <input id="customFoodCalories" type="number" placeholder="Calories" />
        <button id="addCustomMealBtn" class="btn btn-ok" style="width:100%;">Add Custom Item</button>
      </div>
    </div>

    <!-- Meal Log -->
    <div class="card"><h3>Today's Meals</h3><div class="list">${mealItems || '<p class="muted" style="text-align:center;padding:20px 0;">No meals logged yet. Start tracking! 🍛</p>'}</div></div>
  `;

  // --- Camera food scanner handlers ---
  let scannedItems = [];

  el('takePhotoBtn')?.addEventListener('click', () => {
    el('foodPhotoInput')?.click();
  });

  el('foodPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = el('photoPreview');
      const wrap = el('photoPreviewWrap');
      if (preview) preview.src = reader.result;
      if (wrap) wrap.style.display = 'block';
      el('scanPhotoBtn').disabled = false;
    };
    reader.readAsDataURL(file);
  });

  el('scanPhotoBtn')?.addEventListener('click', async () => {
    const preview = el('photoPreview');
    if (!preview?.src) return toast('Take a photo first');
    const btn = el('scanPhotoBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Analyzing...';
    try {
      const base64 = preview.src;
      const data = await api('/api/coach/analyze-photo', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      });
      const analysis = data.analysis || data;
      scannedItems = analysis.items || [];
      const resultsDiv = el('scanResults');
      const content = el('scanResultsContent');
      if (resultsDiv) resultsDiv.style.display = 'block';
      if (content) {
        if (scannedItems.length === 0) {
          content.innerHTML = '<p class="muted">Could not detect any food items. Try a clearer photo.</p>';
        } else {
          const healthScoreVal = analysis.healthScore || '—';
          const tips = (analysis.tips || []).join(' · ');
          content.innerHTML = `
            <div style="margin-bottom:8px;font-size:.82rem;">
              <strong>Health Score:</strong> <span style="color:var(--green);font-weight:700;">${healthScoreVal}/10</span>
              ${tips ? `<br><em style="color:var(--text-muted);font-size:.72rem;">${tips}</em>` : ''}
            </div>
            ${scannedItems.map((item) => `
              <div class="item" style="padding:8px 10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>${item.name}</strong>
                    <span style="font-size:.72rem;color:var(--text-muted);margin-left:6px;">${item.confidence ? Math.round(item.confidence) + '%' : ''}</span>
                  </div>
                  <span style="font-weight:700;color:var(--amber);">${item.calories || 0} cal</span>
                </div>
                <div style="font-size:.72rem;color:var(--text-muted);">P:${item.protein || 0}g  C:${item.carbs || 0}g  F:${item.fat || 0}g</div>
              </div>
            `).join('')}
          `;
          el('addScannedMealBtn').disabled = false;
        }
      }
      toast(`Detected ${scannedItems.length} food items`);
    } catch (err) {
      toast(err.message || 'Photo analysis failed');
    } finally {
      btn.textContent = '🔬 Analyze';
      btn.disabled = false;
    }
  });

  el('addScannedMealBtn')?.addEventListener('click', async () => {
    if (!scannedItems.length) return toast('No scanned items to add');
    try {
      const items = scannedItems.map((item) => ({
        name: item.name,
        quantity: 1,
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        carbs: Number(item.carbs || 0),
        fat: Number(item.fat || 0),
        fiber: Number(item.fiber || 0),
        unit: 'serving',
      }));
      const payload = {
        date: el('mealDate')?.value || new Date().toISOString().slice(0, 10),
        mealType: el('mealType')?.value || 'lunch',
        items,
      };
      await api('/api/meals', { method: 'POST', body: JSON.stringify(payload) });
      pushNotification('Meal Scanned', `${items.length} items added from photo scan.`, 'success');
      toast(`${items.length} items added from photo`);
      scannedItems = [];
      el('scanResults').style.display = 'none';
      el('photoPreviewWrap').style.display = 'none';
      await loadMeals();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  // --- Existing meal handlers ---
  el('foodSearchBtn')?.addEventListener('click', async () => {
    const qText = el('foodSearchInput').value.trim();
    if (!qText || qText.length < 2) return toast('Enter at least 2 letters');
    try {
      const data = await api(`/api/foods/search?q=${encodeURIComponent(qText)}&limit=50`);
      state.foods = data.data || [];
      const select = el('foodSelect');
      if (!select) return;
      select.innerHTML = state.foods.map((food) => `<option value="${food._id}">${food.name} (${food.calories || 0} cal)</option>`).join('') || '<option value="">No results</option>';
      toast(`Found ${state.foods.length} foods`);
    } catch (err) {
      toast(err.message);
    }
  });

  el('addMealBtn')?.addEventListener('click', async () => {
    try {
      const selectedFoodId = el('foodSelect').value;
      const selectedFood = state.foods.find((f) => f._id === selectedFoodId);
      if (!selectedFood) return toast('Select a food');

      const quantity = Number(el('foodQty').value || 1);
      const payload = {
        date: el('mealDate').value,
        mealType: el('mealType').value,
        items: [{
          foodDbId: selectedFood._id,
          name: selectedFood.name,
          quantity,
          calories: Number(selectedFood.calories || 0),
          protein: Number(selectedFood.protein || 0),
          carbs: Number(selectedFood.carbs || 0),
          fat: Number(selectedFood.fat || 0),
          fiber: Number(selectedFood.fiber || 0),
          unit: selectedFood.servingUnit || 'serving',
        }],
      };
      await api('/api/meals', { method: 'POST', body: JSON.stringify(payload) });
      pushNotification('Meal Logged', `${selectedFood.name} added to ${payload.mealType}.`, 'success');
      toast('Meal added');
      await loadMeals();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  el('addCustomMealBtn')?.addEventListener('click', async () => {
    try {
      const name = el('customFoodName').value.trim();
      const calories = Number(el('customFoodCalories').value || 0);
      if (!name) return toast('Enter custom food name');
      const payload = {
        date: el('mealDate').value,
        mealType: el('mealType').value,
        items: [{ name, quantity: Number(el('foodQty').value || 1), calories, protein: 0, carbs: 0, fat: 0, fiber: 0, unit: 'serving' }],
      };
      await api('/api/meals', { method: 'POST', body: JSON.stringify(payload) });
      pushNotification('Meal Logged', `${name} added to ${payload.mealType}.`, 'success');
      toast('Custom meal added');
      await loadMeals();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  qa('[data-meal-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/meals/${btn.dataset.mealDelete}`, { method: 'DELETE' });
        pushNotification('Meal Deleted', 'A meal entry was removed.', 'info');
        toast('Meal deleted');
        await loadMeals();
        await loadDashboard();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

function activityTypeOptions(selected = 'running') {
  const list = ['running', 'walking', 'cycling', 'cricket', 'football', 'badminton', 'tennis', 'swimming', 'gym', 'yoga', 'kabaddi', 'hockey', 'other'];
  return list.map((type) => `<option value="${type}" ${selected === type ? 'selected' : ''}>${type[0].toUpperCase()}${type.slice(1)}</option>`).join('');
}

function renderActivities(payload, stats) {
  const target = el('activities');
  if (activityTracker.map) {
    try { activityTracker.map.remove(); } catch (_) {}
    activityTracker.map = null;
    activityTracker.mapReady = false;
    activityTracker.livePolyline = null;
    activityTracker.plannedPolyline = null;
    activityTracker.currentMarker = null;
    activityTracker.routeMarkers = [];
  }
  const activities = payload.activities || [];
  const activityRows = activities.map((a) => `
    <div class="item">
      <h4>${a.type === 'running' ? '🏃' : a.type === 'cycling' ? '🚴' : a.type === 'yoga' ? '🧘' : a.type === 'swimming' ? '🏊' : '💪'} ${a.type} · ${a.durationMinutes} min</h4>
      <p>${String(a.date || '').slice(0, 10)} · ${a.caloriesBurned || 0} cal · ${a.distanceKm || 0} km</p>
      <span class="pill">${a.gpsRoute?.length ? '📍 GPS' : '✏️ Manual'}${a.pendingSync ? ' · ⏳ Pending Sync' : a.localOnly ? ' · 📱 Local' : ''}</span>
    </div>
  `).join('');

  target.innerHTML = `
    <!-- Active Session Card (dark – 45:25 style) -->
    <div class="active-session">
      <div class="as-header">
        <div class="as-title">${activityTracker.type || 'Jogging'}</div>
        <div class="as-settings">⚙</div>
      </div>
      <div class="as-timer" id="trkTimerDisplay">00:00</div>
      <div class="as-timer-label">Total Duration</div>
      <div class="as-metrics">
        <div class="as-metric"><div class="as-metric-val" id="trkCalories">0</div><div class="as-metric-unit">kcal</div></div>
        <div class="as-metric"><div class="as-metric-val" id="trkDistance">0.00</div><div class="as-metric-unit">km</div></div>
        <div class="as-metric"><div class="as-metric-val" id="trkSteps">0</div><div class="as-metric-unit">steps</div></div>
      </div>
      <div class="as-controls">
        <button id="stopTrackingBtn" class="as-ctrl-btn stop" title="Stop">⏹</button>
        <button id="startTrackingBtn" class="as-ctrl-btn play" title="Start">▶</button>
        <button id="applyTrackingBtn" class="as-ctrl-btn pause" title="Apply">✓</button>
      </div>
      <p id="trkStatus" class="muted" style="text-align:center;margin-top:10px;color:rgba(255,255,255,.4);font-size:.68rem;">Tap play to begin tracking</p>
      <input id="trkDuration" type="hidden" value="0" />
      <p id="gpsStatus" style="text-align:center;margin-top:4px;font-size:.62rem;color:rgba(255,255,255,.3);">GPS not captured</p>
    </div>

    <!-- Jogging Completed Ring -->
    ${stats.totalCalories > 0 ? `
    <div class="completed-ring-card">
      <div class="cr-title">${stats.lastActivityType || 'Activity'} Completed</div>
      <div class="cr-ring-wrap">
        <svg viewBox="0 0 150 150">
          <circle class="cr-ring-bg" cx="75" cy="75" r="60"/>
          <circle class="cr-ring-fill" cx="75" cy="75" r="60"
            stroke-dasharray="${2 * Math.PI * 60}"
            stroke-dashoffset="${2 * Math.PI * 60 * (1 - Math.min(1, (stats.totalCalories || 0) / Math.max(1, state.user?.goals?.dailyCalorieTarget || 500)))}"
            transform="rotate(-90 75 75)"/>
        </svg>
        <div class="cr-ring-center">
          <div class="cr-ring-val">${stats.totalCalories || 0}</div>
          <div class="cr-ring-unit">kcal</div>
        </div>
      </div>
      <div class="cr-dots">
        <span class="cr-dot orange">Distance</span>
        <span class="cr-dot blue">Calorie</span>
        <span class="cr-dot red">BPM</span>
      </div>
    </div>` : ''}

    <!-- Activity Stats -->
    <div class="card" style="text-align:center;">
      <h3>Activity Stats</h3>
      <div style="display:flex;justify-content:space-around;padding:12px 0;">
        <div><div style="font-size:1.5rem;font-weight:800;color:#7B61FF;">${stats.totalMinutes || 0}</div><div class="label">Minutes</div></div>
        <div><div style="font-size:1.5rem;font-weight:800;color:#FF6B2B;">${stats.totalCalories || 0}</div><div class="label">Burned</div></div>
        <div><div style="font-size:1.5rem;font-weight:800;color:#25C569;">${stats.sessionCount || 0}</div><div class="label">Sessions</div></div>
        <div><div style="font-size:1.5rem;font-weight:800;color:#FFB020;">${stats.streak || 0}</div><div class="label">Streak</div></div>
      </div>
    </div>

    <!-- Log Activity -->
    <div class="card">
      <h3>Log Activity</h3>
      <div class="form-grid">
        <div class="toolbar">
          <select id="actType">${activityTypeOptions('running')}</select>
          <input id="actDuration" type="number" min="1" placeholder="Duration (min)" />
        </div>
        <div class="toolbar">
          <input id="actCalories" type="number" min="0" placeholder="Calories burned" />
          <input id="actDistance" type="number" min="0" step="0.1" placeholder="Distance (km)" />
        </div>
        <input id="actNotes" placeholder="Notes (optional)" />
        <div class="toolbar">
          <button id="captureGpsBtn" class="btn btn-outline">📍 Capture GPS</button>
          <button id="addActivityBtn" class="btn btn-primary">Log Activity</button>
        </div>
      </div>
      <input id="gpsLat" type="hidden" />
      <input id="gpsLng" type="hidden" />
    </div>

    <!-- Recent Activities -->
    <div class="card"><h3>Recent Activities</h3><div class="list">${activityRows || '<p class="muted" style="text-align:center;padding:20px 0;">No activities logged yet. Get moving! 🏃</p>'}</div></div>
  `;

  updateActivityTrackerUi();
  initActivityMap();

  el('captureGpsBtn')?.addEventListener('click', async () => {
    if (!navigator.geolocation) return toast('Geolocation not supported');
    const status = el('gpsStatus');
    status.textContent = 'Capturing GPS...';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        el('gpsLat').value = String(position.coords.latitude);
        el('gpsLng').value = String(position.coords.longitude);
        status.textContent = `GPS captured: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
        activityTracker.lastPoint = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          timestamp: new Date().toISOString(),
        };
        drawLiveRouteOnMap();
      },
      () => {
        status.textContent = 'Failed to capture GPS';
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  el('toggleRouteBuilderBtn')?.addEventListener('click', () => {
    activityTracker.routeBuilderEnabled = !activityTracker.routeBuilderEnabled;
    const btn = el('toggleRouteBuilderBtn');
    const status = el('rbMapStatus');
    if (btn) btn.textContent = activityTracker.routeBuilderEnabled ? 'Disable Builder' : 'Enable Builder';
    if (status) status.textContent = activityTracker.routeBuilderEnabled
      ? 'Builder ON: tap map to add waypoints.'
      : 'Builder OFF: enable builder to design route.';
    updateRouteBuilderUi();
  });

  el('clearRouteBtn')?.addEventListener('click', () => {
    clearPlannedRoute();
    toast('Planned route cleared');
  });

  el('buildRoadRouteBtn')?.addEventListener('click', async () => {
    await buildRoadRouteFromWaypoints();
  });

  el('usePlannedDistanceBtn')?.addEventListener('click', () => {
    const km = plannedRouteDistanceKm(activityTracker.plannedRoute);
    if (km <= 0) {
      toast('Build a route with at least 2 waypoints');
      return;
    }
    const distanceInput = el('actDistance');
    if (distanceInput) distanceInput.value = km.toFixed(2);
    toast(`Planned distance applied: ${km.toFixed(2)} km`);
  });

  el('addActivityBtn')?.addEventListener('click', async () => {
    try {
      const lat = Number(el('gpsLat').value || 0);
      const lng = Number(el('gpsLng').value || 0);
      const hasTrackerRoute = Array.isArray(activityTracker.route) && activityTracker.route.length > 0;
      const routeFromCapture = lat && lng ? [{ lat, lng, timestamp: new Date().toISOString() }] : [];
      const routeToSend = hasTrackerRoute ? activityTracker.route.slice(-400) : routeFromCapture;
      const stepsToSend = Number(activityTracker.stepCount || 0);
      const durationToSend = Number(el('actDuration').value || 0);
      const distanceToSend = Number(el('actDistance').value || 0);
      const caloriesToSend = Number(el('actCalories').value || 0);

      if (durationToSend <= 0 && distanceToSend <= 0 && stepsToSend <= 0) {
        toast('Start tracker or enter a real activity before syncing');
        return;
      }

      const activityType = String(el('actType').value || '').toLowerCase();
      const gpsRequired = ['running', 'walking', 'cycling'].includes(activityType);
      if (gpsRequired && !routeToSend.length) {
        toast('Capture GPS or start live tracking for this activity type');
        return;
      }

      const payloadToSend = {
        type: activityType,
        durationMinutes: durationToSend,
        caloriesBurned: caloriesToSend,
        distanceKm: distanceToSend,
        steps: stepsToSend,
        notes: el('actNotes').value || '',
        date: new Date().toISOString().slice(0, 10),
        gpsRoute: routeToSend,
        plannedRoute: activityTracker.plannedRoute.slice(0, 800),
        plannedDistanceKm: plannedRouteDistanceKm(activityTracker.plannedRoute),
        source: 'mobile_tracker',
      };

      const localActivity = upsertLocalActivity({
        ...payloadToSend,
        createdAt: new Date().toISOString(),
        pendingSync: true,
        localOnly: true,
      });

      try {
        await api('/api/activities', { method: 'POST', body: JSON.stringify(payloadToSend) });
        markLocalActivitySynced(localActivity.localId);
        removeQueuedActivity(localActivity.localId);
        pushNotification('Activity Logged', `${payloadToSend.type} activity recorded.`, 'success');
        toast('Activity logged and synced');
      } catch (syncErr) {
        queueActivityForSync(localActivity.localId, payloadToSend);
        markLocalActivitySyncError(localActivity.localId, syncErr.message || 'Sync pending');
        pushNotification('Offline Saved', 'Activity saved locally and will sync automatically.', 'info');
        toast('Saved offline. Will sync when online.');
      }

      await loadActivities();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  el('startTrackingBtn')?.addEventListener('click', async () => {
    try {
      if (activityTracker.running) return;

      activityTracker.running = true;
      activityTracker.startTime = Date.now();
      activityTracker.stepCount = 0;
      activityTracker.distanceMeters = 0;
      activityTracker.caloriesEstimate = 0;
      activityTracker.lastPeakAt = 0;
      activityTracker.route = [];
      activityTracker.lastPoint = null;
      activityTracker.type = el('actType')?.value || 'walking';
      if (el('gpsLat')) el('gpsLat').value = '';
      if (el('gpsLng')) el('gpsLng').value = '';

      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
          stopActivityTracking('Motion permission denied');
          return;
        }
      }

      activityTracker.magHistory = [];
      activityTracker.filteredMag = 9.8;
      activityTracker.lastValley = 9.8;
      activityTracker.rising = false;

      activityTracker.motionBound = (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const rawMag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
        // Low-pass filter (alpha=0.15) for smoother signal
        const alpha = 0.15;
        activityTracker.filteredMag = alpha * rawMag + (1 - alpha) * activityTracker.filteredMag;
        const mag = activityTracker.filteredMag;
        const now = Date.now();

        // Peak detection with valley tracking
        if (!activityTracker.rising && mag < activityTracker.lastValley) {
          activityTracker.lastValley = mag;
        }
        if (!activityTracker.rising && mag > activityTracker.lastValley + activityTracker.stepThreshold) {
          activityTracker.rising = true;
        }
        if (activityTracker.rising && mag < activityTracker.lastValley + activityTracker.stepThreshold * 0.6) {
          // Crossed back down – count step if enough time passed
          if (now - activityTracker.lastPeakAt > activityTracker.stepRefractory) {
            activityTracker.stepCount += 1;
            activityTracker.lastPeakAt = now;
            // Estimate distance from stride ONLY when GPS is not active
            if (!activityTracker.lastPoint) {
              const stride = activityTracker.type === 'running' ? 1.1 : 0.72;
              activityTracker.distanceMeters += stride;
            }
          }
          activityTracker.rising = false;
          activityTracker.lastValley = mag;
        }
      };
      window.addEventListener('devicemotion', activityTracker.motionBound);

      if (navigator.geolocation) {
        activityTracker.watchId = navigator.geolocation.watchPosition(
          (position) => {
            const point = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              timestamp: new Date().toISOString(),
            };
            if (activityTracker.lastPoint) {
              activityTracker.distanceMeters += distanceBetweenMeters(activityTracker.lastPoint, point);
            }
            activityTracker.lastPoint = point;
            activityTracker.route.push(point);
            if (activityTracker.route.length > 400) activityTracker.route.shift();

            el('gpsLat').value = String(point.lat);
            el('gpsLng').value = String(point.lng);
            const gpsStatus = el('gpsStatus');
            if (gpsStatus) gpsStatus.textContent = `GPS live: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
            drawLiveRouteOnMap();
            if (activityTracker.map && activityTracker.running) {
              try { activityTracker.map.panTo([point.lat, point.lng], { animate: true, duration: 0.25 }); } catch (_) {}
            }
            updateActivityTrackerUi();
          },
          () => {
            const gpsStatus = el('gpsStatus');
            if (gpsStatus) gpsStatus.textContent = 'GPS tracking unavailable';
          },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
        );
      }

      activityTracker.intervalId = setInterval(() => {
        updateActivityTrackerUi();
      }, 1000);

      updateActivityTrackerUi();
      toast('Live tracking started');
    } catch (err) {
      stopActivityTracking('Failed to start tracker');
      toast(err.message || 'Failed to start tracking');
    }
  });

  el('stopTrackingBtn')?.addEventListener('click', () => {
    const durationMinutes = activityTracker.startTime
      ? Math.max(0, Math.round((Date.now() - activityTracker.startTime) / 60000))
      : 0;
    activityTracker.caloriesEstimate = estimateCaloriesForSession(activityTracker.type, durationMinutes);
    stopActivityTracking('Tracking stopped');
  });

  el('applyTrackingBtn')?.addEventListener('click', () => {
    if (activityTracker.running) {
      toast('Stop tracking before applying values');
      return;
    }
    const durationMinutes = activityTracker.startTime
      ? Math.max(1, Math.round((Date.now() - activityTracker.startTime) / 60000))
      : 0;
    const distanceKm = Number((activityTracker.distanceMeters / 1000).toFixed(2));
    const calories = durationMinutes > 0
      ? estimateCaloriesForSession(el('actType')?.value || activityTracker.type, durationMinutes)
      : Math.round(activityTracker.caloriesEstimate || 0);

    if (durationMinutes > 0) el('actDuration').value = String(durationMinutes);
    if (distanceKm > 0) el('actDistance').value = String(distanceKm);
    if (calories > 0) el('actCalories').value = String(calories);

    const currentNotes = el('actNotes').value || '';
    const stepNote = `Steps: ${activityTracker.stepCount}`;
    const sensorTag = 'Sensor: mobile_tracker';
    let nextNotes = currentNotes;
    if (!nextNotes.includes('Steps:')) nextNotes = `${nextNotes}${nextNotes ? ' | ' : ''}${stepNote}`;
    if (!nextNotes.includes(sensorTag)) nextNotes = `${nextNotes}${nextNotes ? ' | ' : ''}${sensorTag}`;
    el('actNotes').value = nextNotes;

    toast('Tracker details applied to activity form');
  });
}

function renderCoach() {
  const target = el('coach');
  target.innerHTML = `
    <!-- Coach Profile Card (Farnese style) -->
    <div class="coach-profile">
      <div class="coach-avatar-wrap">🤖</div>
      <div class="coach-actions-row">
        <button class="coach-action-btn dark">💬</button>
        <button class="coach-action-btn orange" id="generateWorkoutBtn">💪</button>
        <button class="coach-action-btn outline" id="generateDietBtn">🥗</button>
      </div>
      <div class="coach-tags">
        <span class="coach-tag">AI POWERED</span>
        <span class="coach-tag">GPT</span>
      </div>
      <div class="coach-name">Coach KheloFit AI <span class="coach-verified">✓</span></div>
      <div class="coach-stats-row">
        <div class="coach-stat"><div class="coach-stat-val">24/7</div><div class="coach-stat-label">Available</div></div>
        <div class="coach-stat"><div class="coach-stat-val">∞</div><div class="coach-stat-label">Plans</div></div>
        <div class="coach-stat"><div class="coach-stat-val">4.5</div><div class="coach-stat-label">Rating</div></div>
      </div>
    </div>

    <div class="card">
      <h3>Generate Plan</h3>
      <div class="form-grid">
        <div class="toolbar">
          <select id="coachLevel">
            <option value="beginner">Beginner</option>
            <option value="intermediate" selected>Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <input id="coachGoals" placeholder="Goals (fat loss, stamina…)" value="general fitness" />
        </div>
        <div class="toolbar">
          <input id="coachDietType" placeholder="Diet Type" value="vegetarian" />
          <input id="coachCalories" type="number" placeholder="Calorie Goal" value="2000" />
        </div>
        <button id="analyzeMealBtn" class="btn btn-outline" style="width:100%;">🔬 Analyze Latest Meal</button>
      </div>
    </div>
    <div class="card">
      <h3>Coach Output</h3>
      <pre id="coachOutput" class="item pre" style="white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;">Ask the AI Coach to generate a workout or diet plan...</pre>
    </div>
  `;

  const toLines = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => `• ${item}`);
    return [`• ${value}`];
  };

  const formatCoachPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return String(payload || 'No output');

    if (Array.isArray(payload.meals)) {
      const lines = [];
      lines.push('🥗 Daily Diet Plan');
      lines.push('');
      payload.meals.forEach((meal, idx) => {
        lines.push(`${idx + 1}. ${meal.name || 'Meal'}${meal.time ? ` (${meal.time})` : ''}`);
        (meal.items || []).forEach((item) => {
          const macros = `${item.protein || 0}P/${item.carbs || 0}C/${item.fat || 0}F`;
          lines.push(`   • ${item.dish || '-'} — ${item.portion || '-'} — ${item.calories || 0} kcal (${macros})`);
        });
        lines.push('');
      });
      if (payload.totalCalories || payload.macros) {
        lines.push('📊 Totals');
        lines.push(`• Calories: ${payload.totalCalories || 0} kcal`);
        lines.push(`• Macros: ${payload.macros?.protein || 0}P / ${payload.macros?.carbs || 0}C / ${payload.macros?.fat || 0}F`);
      }
      return lines.join('\n').trim();
    }

    if (payload.warmup || payload.workout || payload.cooldown) {
      const lines = [];
      lines.push('💪 Workout Plan');
      lines.push('');
      lines.push('Warm-up');
      lines.push(...toLines(payload.warmup));
      lines.push('');
      lines.push('Main Workout');
      lines.push(...toLines(payload.workout));
      lines.push('');
      lines.push('Cool-down');
      lines.push(...toLines(payload.cooldown));
      if (payload.tips) {
        lines.push('');
        lines.push('Coach Tips');
        lines.push(...toLines(payload.tips));
      }
      return lines.join('\n').trim();
    }

    if (payload.assessment || payload.score || payload.suggestions) {
      const lines = [];
      lines.push('🔬 Meal Analysis');
      if (payload.score !== undefined) lines.push(`• Score: ${payload.score}/10`);
      if (payload.assessment) {
        lines.push('');
        lines.push('Assessment');
        lines.push(`• ${payload.assessment}`);
      }
      if (payload.missing?.length) {
        lines.push('');
        lines.push('Missing');
        lines.push(...toLines(payload.missing));
      }
      if (payload.suggestions?.length) {
        lines.push('');
        lines.push('Suggestions');
        lines.push(...toLines(payload.suggestions));
      }
      if (payload.alternatives?.length) {
        lines.push('');
        lines.push('Alternatives');
        lines.push(...toLines(payload.alternatives));
      }
      return lines.join('\n').trim();
    }

    return JSON.stringify(payload, null, 2);
  };

  const setCoachOutput = (payload, source = 'fallback') => {
    const sourceTag = String(source || 'fallback').toLowerCase() === 'ai'
      ? '✅ AI Plan'
      : '⚠️ Offline Smart Plan';
    const text = formatCoachPayload(payload);
    el('coachOutput').textContent = `${sourceTag}\n\n${text}`;
  };

  el('generateWorkoutBtn')?.addEventListener('click', async () => {
    try {
      const data = await api('/api/coach/workout', {
        method: 'POST',
        body: JSON.stringify({
          goals: el('coachGoals').value || 'general fitness',
          fitnessLevel: el('coachLevel').value || 'intermediate',
          equipment: ['bodyweight', 'dumbbells'],
          durationMinutes: 45,
        }),
      });
      setCoachOutput(data.plan, data.source);
      pushNotification('AI Coach', 'Workout plan generated successfully.', 'success');
    } catch (err) {
      toast(err.message);
    }
  });

  el('generateDietBtn')?.addEventListener('click', async () => {
    try {
      const data = await api('/api/coach/diet', {
        method: 'POST',
        body: JSON.stringify({
          calorieGoal: Number(el('coachCalories').value || 2000),
          dietType: el('coachDietType').value || 'vegetarian',
          meals: 4,
        }),
      });
      setCoachOutput(data.plan, data.source);
      pushNotification('AI Coach', 'Diet plan generated successfully.', 'success');
    } catch (err) {
      toast(err.message);
    }
  });

  el('analyzeMealBtn')?.addEventListener('click', async () => {
    try {
      const latestMeal = state.mealCache[0];
      if (!latestMeal?._id) return toast('Log a meal first to analyze');
      const data = await api('/api/coach/analyze-meal', {
        method: 'POST',
        body: JSON.stringify({ mealId: latestMeal._id }),
      });
      setCoachOutput(data.analysis, data.source);
      pushNotification('AI Coach', 'Meal analysis completed.', 'success');
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderMatches(matches) {
  const target = el('matches');
  const rows = matches.map((m) => `
    <div class="item">
      <h4>${m.sport === 'cricket' ? '🏏' : m.sport === 'football' ? '⚽' : m.sport === 'badminton' ? '🏸' : '🏅'} ${m.sport} · ${m.city}</h4>
      <p>${new Date(m.dateTime).toLocaleString()} · ${m.players?.length || 0}/${m.maxPlayers} players · <span class="pill">${m.status}</span></p>
      <p class="muted">${m.location?.name || ''} ${m.location?.address || ''}</p>
      <div class="actions">
        <button class="btn btn-ok" data-join="${m._id}">Join Match</button>
        <button class="btn btn-outline" data-leave="${m._id}">Leave</button>
      </div>
    </div>
  `).join('');

  target.innerHTML = `
    <div class="card">
      <h3>🏟️ Create Match</h3>
      <div class="form-grid">
        <div class="toolbar">
          <input id="matchSport" placeholder="Sport" value="cricket" />
          <input id="matchCity" placeholder="City" value="Bangalore" />
        </div>
        <div class="toolbar">
          <input id="matchLocationName" placeholder="Location name" />
          <input id="matchMax" type="number" min="2" value="4" placeholder="Max players" />
        </div>
        <input id="matchDate" type="datetime-local" />
        <div class="toolbar">
          <button id="createMatchBtn" class="btn btn-primary" style="flex:1;">Create Match</button>
          <button id="refreshMatchBtn" class="btn btn-outline" style="flex:1;">🔄 Refresh</button>
        </div>
      </div>
    </div>
    <div class="card"><h3>Open Matches</h3><div class="list">${rows || '<p class="muted" style="text-align:center;padding:20px 0;">No open matches. Create one! 🏟️</p>'}</div></div>
  `;

  el('createMatchBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          sport: el('matchSport').value.trim(),
          city: el('matchCity').value.trim(),
          dateTime: el('matchDate').value,
          location: { name: el('matchLocationName').value.trim() },
          maxPlayers: Number(el('matchMax').value || 4),
          skillLevel: 'any',
        }),
      });
      pushNotification('Match Created', 'Your match is now open for players.', 'success');
      toast('Match created');
      await loadMatches();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  el('refreshMatchBtn')?.addEventListener('click', async () => {
    await loadMatches();
  });

  qa('[data-join]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api(`/api/matches/${btn.dataset.join}/join`, { method: 'POST' });
      pushNotification('Match Joined', 'You joined a sports match.', 'success');
      toast('Joined match');
      await loadMatches();
      await loadDashboard();
    } catch (err) { toast(err.message); }
  }));

  qa('[data-leave]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api(`/api/matches/${btn.dataset.leave}/leave`, { method: 'POST' });
      pushNotification('Match Update', 'You left a sports match.', 'info');
      toast('Left match');
      await loadMatches();
      await loadDashboard();
    } catch (err) { toast(err.message); }
  }));
}

function eventCategoryOptions(selected = 'marathon') {
  const list = ['marathon', 'cricket', 'football', 'yoga', 'workshop', 'camp', 'tournament', 'other'];
  return list.map((type) => `<option value="${type}" ${selected === type ? 'selected' : ''}>${type[0].toUpperCase()}${type.slice(1)}</option>`).join('');
}

function renderEvents(events, bookings) {
  const target = el('events');
  const eventRows = events.map((e) => `
    <div class="item">
      <h4>🎪 ${e.title}</h4>
      <p>${e.city} · ${new Date(e.date).toLocaleDateString()} · <span style="font-weight:700;color:var(--orange);">₹${e.price || 'Free'}</span> · <span class="pill">${e.status}</span></p>
      <p class="muted">${e.description || ''}</p>
      <div class="actions"><button class="btn btn-primary" data-book="${e._id}">🎟️ Book Now</button></div>
    </div>
  `).join('');
  const bookingRows = bookings.map((b) => {
    const payBtn = b.status === 'pending' && b.paymentStatus === 'pending'
      ? `<button class="btn btn-ok" data-pay-booking="${b._id}">💳 Confirm Payment</button>`
      : '';
    const cancelBtn = b.status !== 'cancelled'
      ? `<button class="btn btn-danger" data-cancel-booking="${b._id}">Cancel</button>`
      : '';
    return `
      <div class="item">
        <h4>🎟️ ${b.eventId?.title || 'Event'}</h4>
        <p><span class="pill">${b.status}</span> · ${b.paymentStatus || 'free'} · ₹${b.amount || 0} · Ticket #${b.ticketId || '-'}</p>
        <div class="actions">${payBtn}${cancelBtn}</div>
      </div>
    `;
  }).join('');

  target.innerHTML = `
    <div class="card">
      <h3>🎪 Create Event</h3>
      <div class="form-grid">
        <div class="toolbar">
          <input id="eventTitle" placeholder="Event title" />
          <input id="eventCity" placeholder="City" value="Bangalore" />
        </div>
        <div class="toolbar">
          <select id="eventCategory">${eventCategoryOptions('marathon')}</select>
          <input id="eventPrice" type="number" min="0" value="0" placeholder="Price (₹)" />
        </div>
        <input id="eventDate" type="datetime-local" />
        <input id="eventDesc" placeholder="Event description" />
        <div class="toolbar">
          <button id="createEventBtn" class="btn btn-ok" style="flex:1;">Create Event</button>
          <button id="refreshEventBtn" class="btn btn-outline" style="flex:1;">🔄 Refresh</button>
        </div>
      </div>
    </div>
    <div class="card"><h3>Upcoming Events</h3><div class="list">${eventRows || '<p class="muted" style="text-align:center;padding:20px 0;">No upcoming events 🎪</p>'}</div></div>
    <div class="card"><h3>My Bookings</h3><div class="list">${bookingRows || '<p class="muted" style="text-align:center;padding:20px 0;">No bookings yet 🎟️</p>'}</div></div>
  `;

  el('createEventBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: el('eventTitle').value.trim(),
          description: el('eventDesc').value.trim(),
          category: el('eventCategory').value,
          city: el('eventCity').value.trim(),
          date: el('eventDate').value,
          price: Number(el('eventPrice').value || 0),
        }),
      });
      pushNotification('Event Created', 'A new event was created.', 'success');
      toast('Event created');
      await loadEvents();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  el('refreshEventBtn')?.addEventListener('click', async () => {
    await loadEvents();
  });

  qa('[data-book]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api(`/api/events/${btn.dataset.book}/book`, { method: 'POST' });
      pushNotification('Event Booked', 'Your event booking is successful.', 'success');
      toast('Booked event');
      await loadEvents();
      await loadDashboard();
    } catch (err) { toast(err.message); }
  }));

  qa('[data-pay-booking]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api(`/api/events/bookings/${btn.dataset.payBooking}/pay`, {
        method: 'POST',
        body: JSON.stringify({ paymentId: `SIM-${Date.now()}` }),
      });
      toast('Payment confirmed');
      await loadEvents();
      await loadDashboard();
      await loadNotifications();
    } catch (err) { toast(err.message); }
  }));

  qa('[data-cancel-booking]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api(`/api/events/bookings/${btn.dataset.cancelBooking}/cancel`, { method: 'POST' });
      toast('Booking cancelled');
      await loadEvents();
      await loadDashboard();
      await loadNotifications();
    } catch (err) { toast(err.message); }
  }));
}

function renderReferrals(ref, leaderboard) {
  const target = el('referrals');
  const leaderRows = leaderboard.map((l, i) => `<div class="item"><h4>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'} ${l.userId?.name || 'User'} · <span class="code">${l.referralCode}</span></h4><p>${l.totalReferrals} referrals · ${l.pointsEarned} pts</p></div>`).join('');
  target.innerHTML = `
    <div class="card" style="text-align:center;">
      <h3>🎁 Referrals & Points</h3>
      <div style="display:flex;justify-content:space-around;padding:16px 0;">
        <div><div style="font-size:1.4rem;font-weight:800;color:var(--orange);">${ref?.pointsEarned || 0}</div><div class="label">Points</div></div>
        <div><div style="font-size:1.4rem;font-weight:800;color:var(--green);">${ref?.totalReferrals || 0}</div><div class="label">Referrals</div></div>
      </div>
      <p class="muted">Your code: <span class="code" style="font-size:1.1rem;">${ref?.referralCode || '-'}</span></p>
      <div class="toolbar" style="margin-top:12px;">
        <input id="applyCodeInput" placeholder="Enter referral code" />
        <button id="applyCodeBtn" class="btn btn-primary">Apply Code</button>
      </div>
    </div>
    <div class="card"><h3>🏆 Leaderboard</h3><div class="list">${leaderRows || '<p class="muted" style="text-align:center;padding:20px 0;">No leaderboard data yet</p>'}</div></div>
  `;

  el('applyCodeBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/referrals/apply', { method: 'POST', body: JSON.stringify({ code: el('applyCodeInput').value }) });
      pushNotification('Referral Applied', 'Referral code has been applied.', 'success');
      toast('Referral applied');
      await loadReferrals();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderNotifications() {
  const target = el('notifications');
  const rows = state.notifications.map((n) => `
    <div class="item" style="${n.read ? '' : 'border-left:3px solid var(--orange);'}">
      <h4>${n.type === 'success' || n.level === 'success' ? '✅' : n.type === 'info' || n.level === 'info' ? 'ℹ️' : n.type === 'warning' || n.level === 'warning' ? '⚠️' : '🔔'} ${n.title}</h4>
      <p>${n.message}</p>
      <p class="muted">${new Date(n.createdAt).toLocaleString()} · <span class="pill">${n.type || n.level || 'system'}</span>${n.read ? '' : ' · <strong>unread</strong>'}</p>
    </div>
  `).join('');

  target.innerHTML = `
    <div class="card">
      <h3>🔔 Notifications</h3>
      <p class="muted">Unread: <strong>${state.unreadNotifications || 0}</strong></p>
      <div class="toolbar" style="margin-top:8px;">
        <button id="enablePushBtn" class="btn btn-primary" style="flex:1;">🔔 Enable Push</button>
        <button id="testPushBtn" class="btn btn-ok" style="flex:1;">🧪 Test Push</button>
      </div>
      <button id="markNotifReadBtn" class="btn btn-outline" style="width:100%;margin-top:8px;">✓ Mark All Read</button>
      <p class="muted" style="margin-top:8px;">Push: ${state.pushConfig?.enabled ? (state.pushEnabledOnDevice ? '✅ enabled on this device' : '🟡 available') : '⚪ not configured on server'}</p>
    </div>
    <div class="card"><h3>Feed</h3><div class="list">${rows || '<p class="muted" style="text-align:center;padding:20px 0;">No notifications yet 🔔</p>'}</div></div>
  `;

  el('markNotifReadBtn')?.addEventListener('click', async () => {
    try {
      if (state.token) {
        await api('/api/notifications/read-all', { method: 'POST' });
      }
      state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
      state.unreadNotifications = 0;
      renderNotifications();
      toast('Notifications marked read');
    } catch (err) {
      toast(err.message);
    }
  });

  el('enablePushBtn')?.addEventListener('click', async () => {
    try {
      const ok = await ensurePushEnabled();
      if (!ok) return;
      renderNotifications();
      toast('Push enabled for this device');
    } catch (err) {
      toast(err.message || 'Failed to enable push');
    }
  });

  el('testPushBtn')?.addEventListener('click', async () => {
    try {
      const ok = await ensurePushEnabled();
      if (!ok) return;
      await api('/api/push/test', { method: 'POST' });
      toast('Test push sent');
    } catch (err) {
      toast(err.message || 'Failed to send test push');
    }
  });
}

function renderStatus(health, db, stats) {
  const target = el('status');
  target.innerHTML = `
    <div class="card" style="text-align:center;">
      <h3>⚙️ System Status</h3>
      <div style="display:flex;justify-content:space-around;padding:12px 0;">
        <div><div style="font-size:1.2rem;font-weight:800;color:${health?.status === 'ok' ? 'var(--green)' : 'var(--red)'};">${health?.status || '-'}</div><div class="label">API</div><p class="muted">v${health?.version || '-'}</p></div>
        <div><div style="font-size:1.2rem;font-weight:800;color:${db?.status === 'connected' ? 'var(--green)' : 'var(--red)'};">${db?.status || '-'}</div><div class="label">Database</div><p class="muted">${db?.dbName || '-'}</p></div>
        <div><div style="font-size:1.2rem;font-weight:800;color:var(--orange);">${stats?.models?.foods || 0}</div><div class="label">Foods</div><p class="muted">${stats?.models?.meals || 0} meals</p></div>
      </div>
    </div>
    <div class="card">
      <h3>Memory Usage</h3>
      <pre class="item pre" style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${JSON.stringify(stats?.memory || {}, null, 2)}</pre>
    </div>
  `;
}

function renderDashboardPlan(mealSummary, activityStats) {
  const target = el('dashboardPlan');
  const calories = Number(mealSummary?.totalCalories || 0);
  const sessions = Number(activityStats?.sessionsCount || 0);

  const plans = [];
  if (calories < 1200) {
    plans.push({ title: 'Nutrition', desc: 'Log lunch/dinner to stay on track', type: 'medium', badge: 'Nutrition' });
  } else {
    plans.push({ title: 'Nutrition', desc: 'Meal goal looks active today!', type: 'health', badge: 'On Track' });
  }
  if (sessions < 1) {
    plans.push({ title: 'Activity', desc: 'Add a session to keep your streak', type: 'light', badge: 'Fitness' });
  } else {
    plans.push({ title: 'Activity', desc: 'Great momentum this week!', type: 'health', badge: 'Active' });
  }
  plans.push({ title: 'Matches', desc: 'Find sports partners nearby', type: 'events', badge: 'Sports' });
  plans.push({ title: 'AI Coach', desc: 'Get personalized plans', type: 'medium', badge: 'Coach' });

  target.innerHTML = `
    <div class="plan-section-title">Your Plan</div>
    <div class="plan-cards">
      ${plans.map((p) => `
        <div class="plan-card ${p.type}">
          <span class="plan-badge">${p.badge}</span>
          <h4>${p.title}</h4>
          <p>${p.desc}</p>
        </div>
      `).join('')}
    </div>
  `;
}

async function loadUser() {
  if (!state.token) return;
  const { user } = await api('/api/auth/me');
  state.user = user;
  setUserChip();
  renderOnboarding(user);
  renderProfile(user);
}

async function loadMeals() {
  if (!state.token) return;
  const date = new Date().toISOString().slice(0, 10);
  const [foodsResp, mealsResp, summaryResp] = await Promise.all([
    api('/api/foods?limit=150').catch(() => ({ data: [] })),
    api(`/api/meals?date=${date}`).catch(() => ({ data: [] })),
    api(`/api/meals/summary?date=${date}`).catch(() => ({ data: {} })),
  ]);
  state.foods = foodsResp.data || [];
  state.mealCache = mealsResp.data || [];
  renderMeals(state.foods, state.mealCache, summaryResp.data || {});
  return { meals: state.mealCache, summary: summaryResp.data || {} };
}

async function loadActivities() {
  if (!state.token) return;
  const localActivities = getLocalActivities();
  const [remotePayload, remoteStats] = await Promise.all([
    api('/api/activities?limit=20').catch(() => ({ activities: [] })),
    api('/api/activities/stats?period=week').catch(() => ({})),
  ]);

  const mergedActivities = mergeActivitiesForView(remotePayload.activities || [], localActivities);
  const fallbackStats = computeActivityStatsFromList(mergedActivities);
  const stats = {
    ...fallbackStats,
    ...remoteStats,
    totalMinutes: Number(remoteStats.totalMinutes ?? fallbackStats.totalMinutes),
    totalCalories: Number(remoteStats.totalCalories ?? fallbackStats.totalCalories),
    totalDistance: Number(remoteStats.totalDistance ?? fallbackStats.totalDistance),
    totalSteps: Number(remoteStats.totalSteps ?? fallbackStats.totalSteps),
    sessionCount: Number(remoteStats.sessionCount ?? fallbackStats.sessionCount),
    streak: Number(remoteStats.streak ?? fallbackStats.streak),
    lastActivityType: remoteStats.lastActivityType || fallbackStats.lastActivityType,
  };

  const payload = { ...remotePayload, activities: mergedActivities };
  renderActivities(payload, stats);
  return { payload, stats };
}

async function loadCoach() {
  if (!state.token) return;
  renderCoach();
}

async function loadMatches() {
  if (!state.token) return { matches: [] };
  const matches = await api('/api/matches?status=open').then((d) => d.data || []).catch(() => []);
  renderMatches(matches);
  return { matches };
}

async function loadEvents() {
  if (!state.token) return { events: [], bookings: [] };
  const [events, bookings] = await Promise.all([
    api('/api/events?status=upcoming').then((d) => d.data || []).catch(() => []),
    api('/api/events/my/bookings').then((d) => d.data || []).catch(() => []),
  ]);
  renderEvents(events, bookings);
  return { events, bookings };
}

async function loadReferrals() {
  if (!state.token) return { ref: {}, leaders: [] };
  const [ref, leaders] = await Promise.all([
    api('/api/referrals/me').then((d) => d.data || {}).catch(() => ({})),
    api('/api/referrals/leaderboard?limit=10').then((d) => d.data || []).catch(() => []),
  ]);
  renderReferrals(ref, leaders);
  return { ref, leaders };
}

async function loadStatus() {
  const [health, db, stats] = await Promise.all([
    api('/api/health').catch(() => ({})),
    api('/api/health/db').catch(() => ({})),
    api('/api/health/stats').catch(() => ({})),
  ]);
  renderStatus(health, db, stats);
}

async function loadNotifications() {
  if (!state.token) {
    renderNotifications();
    return { data: state.notifications, unreadCount: 0 };
  }
  const payload = await api('/api/notifications?limit=100').catch(() => ({ data: [], unreadCount: 0 }));
  state.notifications = payload.data || [];
  state.unreadNotifications = Number(payload.unreadCount || 0);
  renderNotifications();
  return payload;
}

async function loadDashboard() {
  if (!state.token) return;
  const date = new Date().toISOString().slice(0, 10);
  const [insights, bookingsResp, fullActivityStats] = await Promise.all([
    api(`/api/insights/dashboard?date=${date}`).catch(() => ({})),
    api('/api/events/my/bookings').catch(() => ({ data: [] })),
    api('/api/activities/stats?period=week').catch(() => ({})),
  ]);
  const mealSummary = insights.mealSummary || {};
  const localActivityStats = computeActivityStatsFromList(getLocalActivities());
  const activityStats = {
    ...(insights.activityStats || {}),
    totalMinutes: fullActivityStats.totalMinutes ?? localActivityStats.totalMinutes ?? (insights.activityStats?.totalDuration || 0),
    totalSteps: fullActivityStats.totalSteps ?? localActivityStats.totalSteps ?? 0,
    totalDistance: fullActivityStats.totalDistance ?? localActivityStats.totalDistance ?? 0,
    totalCalories: fullActivityStats.totalCalories ?? localActivityStats.totalCalories ?? (insights.activityStats?.totalCalories || 0),
    sessionCount: fullActivityStats.sessionCount ?? localActivityStats.sessionCount ?? (insights.activityStats?.sessionsCount || 0),
    lastActivityType: fullActivityStats.lastActivityType || localActivityStats.lastActivityType || '',
  };
  const pendingPayments = (bookingsResp.data || []).filter((b) => b.status === 'pending' && b.paymentStatus === 'pending').length;

  const userName = state.user?.name || 'there';
  const firstName = userName.split(' ')[0];
  const initial = firstName[0]?.toUpperCase() || 'U';
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDay = now.getDay();

  // Build calendar strip (current week)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - todayDay);
  let calHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const isToday = i === todayDay;
    calHtml += `<div class="cal-day ${isToday ? 'today' : ''}"><div class="day-name">${dayNames[i]}</div><div class="day-num">${d.getDate()}</div></div>`;
  }

  const scoreVal = insights.healthScore || healthScore({ mealSummary, activityStats });

  const totalCal = mealSummary.totalCalories || 0;
  const goalCal = state.user?.goals?.dailyCalorieTarget || 2200;
  const calLeft = Math.max(0, goalCal - totalCal);
  const calPct = Math.min(100, Math.round((totalCal / goalCal) * 100));
  const totalSteps = activityStats.totalSteps || activityTracker.stepCount || 0;
  const totalDist = activityStats.totalDistance || Number((activityTracker.distanceMeters / 1000).toFixed(1)) || 0;
  const totalDur = activityStats.totalMinutes || 0;
  const totalBurned = activityStats.totalCalories || 0;
  // Build 7 faux chart bars from calorie data
  const fakeBars = [.35,.55,.45,.7,.6, calPct/100, .2].map((v,i) => {
    const h = Math.max(6, Math.round(v * 70));
    const cls = i === 5 ? 'orange' : 'light';
    return `<div class="cal-bar ${cls}" style="height:${h}px"></div>`;
  }).join('');

  const dashTarget = el('dashboard');
  dashTarget.innerHTML = `
    <!-- Greeting -->
    <div class="greeting-section">
      <div class="greeting-card">
        <div class="greeting-avatar">${initial}</div>
        <div class="greeting-text">
          <h2>Hello, ${firstName}!</h2>
          <p>Today ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
        </div>
        <button class="greeting-search" onclick="document.querySelector('[data-view=notifications]').click()">🔔</button>
      </div>
    </div>

    <!-- Motivational Quote -->
    ${(() => { const _q = getRandomQuote(); return `<div class="quote-banner">
      <div class="quote-text">${_q.text}</div>
      <div class="quote-author">— ${_q.author}</div>
    </div>`; })()}

    <!-- Health Score Hero -->
    <div class="health-score-hero">
      <div class="hs-icon">🏃</div>
      <div class="hs-number" id="statScore">${scoreVal}</div>
      <div class="hs-subtitle">You are ${scoreVal >= 70 ? 'a healthy individual' : scoreVal >= 40 ? 'making good progress' : 'just getting started'}.</div>
      <div class="hs-dots">
        <span class="hs-dot orange">Strength</span>
        <span class="hs-dot dark">Agility</span>
        <span class="hs-dot green">Endurance</span>
      </div>
    </div>

    <!-- Steps Hero -->
    <div class="steps-hero">
      <div class="steps-number">${totalSteps.toLocaleString()}</div>
      <div class="steps-label">total steps</div>
      <div class="steps-chips">
        <div class="s-chip">
          <div class="s-chip-icon orange">🔥</div>
          <div class="s-chip-val">${totalBurned || totalCal}</div>
          <div class="s-chip-unit">kcal</div>
        </div>
        <div class="s-chip">
          <div class="s-chip-icon gray">📍</div>
          <div class="s-chip-val">${totalDist}</div>
          <div class="s-chip-unit">kilometer</div>
        </div>
        <div class="s-chip">
          <div class="s-chip-icon blue">⏱</div>
          <div class="s-chip-val">${totalDur}</div>
          <div class="s-chip-unit">minute</div>
        </div>
      </div>
    </div>

    <!-- Calendar Strip -->
    <div class="calendar-strip">${calHtml}</div>

    <!-- Workout Hero Card (dark) -->
    <div class="workout-hero">
      <span class="wh-badge">${activityStats.sessionCount || 0} TOTAL</span>
      <div class="wh-body">
        <h3>${activityStats.sessionCount > 0 ? 'Keep Going!' : 'Start Workout'}</h3>
        <div class="wh-sub">With AI Coach · KheloFit</div>
        <div class="wh-stats">
          <div class="wh-stat-item"><div class="wh-stat-val">${totalDur}min</div><div class="wh-stat-label">Time</div></div>
          <div class="wh-stat-item"><div class="wh-stat-val">${totalBurned}kcal</div><div class="wh-stat-label">Calorie</div></div>
          <div class="wh-stat-item"><div class="wh-stat-val">${activityStats.streak || 0}d</div><div class="wh-stat-label">Streak</div></div>
        </div>
        <div class="wh-actions">
          <button class="btn-ghost" onclick="document.querySelector('[data-view=coach]').click()">📄 Details</button>
          <button class="btn-orange-pill" onclick="document.querySelector('[data-view=activities]').click()">Start 🎯</button>
        </div>
      </div>
    </div>

    <!-- Calorie Card -->
    <div class="calorie-hero">
      <div class="cal-header">
        <div class="cal-header-title">Calorie</div>
        <span style="font-size:.85rem;color:var(--text-muted);cursor:pointer;">⚙️</span>
      </div>
      <div class="cal-big-row">
        <span class="cal-big-icon">🔥</span>
        <span class="cal-big-number" id="statCalories">${totalCal}</span>
        <span class="cal-big-unit">kcal</span>
      </div>
      <div class="cal-remaining">Burn ${calLeft} calorie left.</div>
      <div class="cal-bar-chart">${fakeBars}</div>
      <div class="cal-tabs">
        <div class="cal-tab active">1d</div>
        <div class="cal-tab">1w</div>
        <div class="cal-tab">1m</div>
        <div class="cal-tab">All</div>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="plan-section-title">Stats Overview</div>
    <div class="stats-grid">
      <div class="stat-card purple-b">
        <div class="stat-label">Protein</div>
        <div class="stat-value" id="statProtein">${mealSummary.totalProtein || 0}g</div>
      </div>
      <div class="stat-card amber-b">
        <div class="stat-label">Activities</div>
        <div class="stat-value" id="statActivities">${activityStats.sessionCount || 0}</div>
      </div>
      <div class="stat-card mint-b">
        <div class="stat-label">Events</div>
        <div class="stat-value" id="statEvents">${insights.upcomingEvents || 0}</div>
      </div>
      <div class="stat-card blue-b">
        <div class="stat-label">Matches</div>
        <div class="stat-value" id="statMatches">${insights.openMatches || 0}</div>
      </div>
    </div>

    <!-- Water Intake Tracker -->
    <div class="water-tracker">
      <div class="water-header">
        <h3>💧 Water Intake</h3>
        <span class="water-goal">${state.waterGlasses}/8 glasses</span>
      </div>
      <div class="water-visual">
        <div class="water-glass" style="--fill:${Math.min(100, (state.waterGlasses / 8) * 100)}%"></div>
        <div>
          <div class="water-big-number" id="waterCount">${state.waterGlasses}</div>
          <div class="water-unit">glasses today</div>
        </div>
      </div>
      <div class="water-dots">
        ${Array.from({ length: 8 }, (_, i) => `<div class="water-dot ${i < state.waterGlasses ? 'filled' : ''}"></div>`).join('')}
      </div>
      <div class="water-btns" style="margin-top:12px;">
        <button class="water-btn" data-water="-1">−</button>
        <button class="water-btn active" data-water="1">+</button>
      </div>
    </div>

    <!-- Achievement Badges -->
    <div class="badges-section" id="badgesSection">
      <h3>🏆 Achievements</h3>
      <div class="badges-grid" id="badgesGrid"></div>
    </div>

    <!-- Today Plan -->
    <div id="dashboardPlan"></div>

    <!-- Action Center -->
    <div class="plan-section-title">Action Center</div>
    <div id="dashboardActions"></div>
  `;

  renderDashboardPlan(mealSummary, activityStats);
  renderDashboardActions({ insights, pendingPayments });

  // Render badges
  const badges = computeBadges(state.user, mealSummary, activityStats);
  const badgesGrid = el('badgesGrid');
  if (badgesGrid) {
    badgesGrid.innerHTML = badges.map(b => `
      <div class="badge-item ${b.unlocked ? 'unlocked' : 'locked'}">
        <span class="badge-icon">${b.icon}</span>
        <div class="badge-name">${b.name}</div>
      </div>
    `).join('');
  }

  // Animate dashboard counters
  animateCounter(el('statScore'), scoreVal, 1000);
  animateCounter(el('statCalories'), totalCal, 800);

  // Wire water buttons
  qa('[data-water]').forEach(btn => {
    btn.addEventListener('click', () => addWater(Number(btn.dataset.water)));
  });

  // Streak celebration
  if ((activityStats.streak || 0) >= 3) {
    const streakEl = document.querySelector('.wh-badge');
    if (streakEl) streakEl.innerHTML += ' <span class="streak-flame">' + (activityStats.streak || 0) + 'd</span>';
  }
}

async function loadPushConfig() {
  const config = await api('/api/push/config').catch(() => ({ enabled: false, publicKey: '' }));
  state.pushConfig = {
    enabled: Boolean(config.enabled),
    publicKey: config.publicKey || ''
  };

  if (!('serviceWorker' in navigator) || !state.token) return state.pushConfig;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    state.pushEnabledOnDevice = Boolean(subscription);
  } catch (_) {
    state.pushEnabledOnDevice = false;
  }

  return state.pushConfig;
}

async function refreshAll() {
  if (!state.token) return;
  await syncQueuedActivities(false).catch(() => ({}));
  await loadUser();
  await Promise.all([
    loadPushConfig(),
    loadDashboard(),
    loadNotifications(),
    loadMeals(),
    loadActivities(),
    loadCoach(),
    loadMatches(),
    loadEvents(),
    loadReferrals(),
    loadStatus(),
  ]);
}

function wireNav() {
  qa('.nav-link[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  el('logoutBtn')?.addEventListener('click', () => {
    setAuth('', null);
    renderNotifications();
    setView('dashboard');
    toast('Logged out');
  });
}

function wireAuth() {
  const loginTab = el('loginTab');
  const registerTab = el('registerTab');
  const submit = el('emailSubmit');

  loginTab?.addEventListener('click', () => {
    state.mode = 'login';
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    submit.textContent = 'Login';
  });

  registerTab?.addEventListener('click', () => {
    state.mode = 'register';
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    submit.textContent = 'Register';
  });

  el('emailForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const email = el('emailInput').value.trim();
      const password = el('passwordInput').value.trim();
      const name = el('nameInput').value.trim();
      const endpoint = state.mode === 'register' ? '/api/auth/register-email' : '/api/auth/login-email';
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify({ email, password, name }) });
      setAuth(data.token, data.user);
      pushNotification('Welcome', 'Email authentication successful.', 'success');
      toast('Authenticated');
      await refreshAll();
      setView('dashboard');
      const profileIncomplete = !state.user?.name || !state.user?.city || !Array.isArray(state.user?.sportsPrefs) || state.user.sportsPrefs.length === 0;
      if (profileIncomplete) setView('onboarding');
    } catch (err) {
      toast(err.message);
    }
  });

  setupGoogleLogin();
}

// ─── GLOBAL ERROR LOGGER (sends client errors to server in real-time) ───
(function initErrorLogger() {
  const ERROR_ENDPOINT = `${API_BASE}/api/errors`;
  const _queue = [];
  let _sending = false;

  function getPlatform() {
    try { return window.Capacitor?.isNativePlatform?.() ? 'android' : 'web'; } catch (_) { return 'web'; }
  }

  function sendError(payload) {
    payload.platform = payload.platform || getPlatform();
    payload.userAgent = navigator.userAgent;
    payload.appVersion = '2.0';
    _queue.push(payload);
    _flush();
  }

  async function _flush() {
    if (_sending || _queue.length === 0) return;
    _sending = true;
    while (_queue.length) {
      const item = _queue.shift();
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('kf_token');
        if (token) headers.Authorization = `Bearer ${token}`;
        await fetch(ERROR_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(item) });
      } catch (_) { /* network down — drop silently */ }
    }
    _sending = false;
  }

  // 1. Uncaught exceptions
  window.onerror = function (msg, url, line, col, err) {
    sendError({
      message: String(msg),
      stack: err?.stack || `${url}:${line}:${col}`,
      level: 'error',
      endpoint: window.location.hash || window.location.pathname,
      meta: { type: 'uncaught', url, line, col },
    });
  };

  // 2. Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    sendError({
      message: reason?.message || String(reason),
      stack: reason?.stack || '',
      level: 'error',
      endpoint: window.location.hash || window.location.pathname,
      meta: { type: 'unhandledrejection' },
    });
  });

  // 3. Console.error interception (catches library errors too)
  const _origConsoleError = console.error;
  console.error = function (...args) {
    _origConsoleError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    sendError({
      message: msg.slice(0, 2000),
      level: 'error',
      endpoint: window.location.hash || window.location.pathname,
      meta: { type: 'console.error' },
    });
  };

  // Expose for manual use: window.logError('something broke', { component: 'meals' })
  window.logError = function (message, meta) {
    sendError({ message: String(message), level: 'error', meta });
  };
  window.logWarn = function (message, meta) {
    sendError({ message: String(message), level: 'warn', meta });
  };
})();

async function init() {
  // Start gated: show auth, hide app
  setAuthVisible(true);

  wireNav();
  wireAuth();
  renderNotifications();

  // Dark mode init
  if (state.darkMode) applyDarkMode(true);
  el('darkToggle')?.addEventListener('click', () => applyDarkMode(!state.darkMode));

  window.addEventListener('online', async () => {
    if (!state.token) return;
    const result = await syncQueuedActivities(true).catch(() => ({ synced: 0 }));
    if (result?.synced) {
      await loadActivities().catch(() => ({}));
      await loadDashboard().catch(() => ({}));
    }
  });

  if (state.token) {
    try {
      await refreshAll();
      // Token valid — reveal app
      setAuthVisible(false);
      setView('dashboard');
      const profileIncomplete = !state.user?.name || !state.user?.city || !Array.isArray(state.user?.sportsPrefs) || state.user.sportsPrefs.length === 0;
      if (profileIncomplete) setView('onboarding');
    } catch (err) {
      setAuth('', null);
      toast('Session expired, please login again');
    }
  } else {
    setAuth('', null);
  }
}

init();
