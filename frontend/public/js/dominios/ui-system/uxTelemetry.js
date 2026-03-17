const STORAGE_KEY = 'uxTelemetryEvents';
const MAX_EVENTS = 200;

function safeParse(jsonText, fallback) {
  try {
    return JSON.parse(jsonText);
  } catch (_) {
    return fallback;
  }
}

function readEvents() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch (_) {
    // Best effort only.
  }
}

function getSessionId() {
  const key = 'uxTelemetrySessionId';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function sanitizeData(data) {
  if (!data || typeof data !== 'object') return {};
  const output = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      output[key] = value.slice(0, 160);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
      continue;
    }
    output[key] = String(value).slice(0, 160);
  }
  return output;
}

function postEventBestEffort(eventRecord) {
  const endpoint = window.__UX_TELEMETRY_ENDPOINT;
  if (!endpoint || typeof endpoint !== 'string') return;
  if (!navigator.sendBeacon) return;

  try {
    const body = JSON.stringify({ events: [eventRecord] });
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
  } catch (_) {
    // Best effort only.
  }
}

export function trackUIEvent(eventName, data = {}) {
  if (!eventName) return null;

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    eventName: String(eventName),
    path: window.location.pathname,
    sessionId: getSessionId(),
    data: sanitizeData(data)
  };

  const events = readEvents();
  events.push(record);
  writeEvents(events);
  postEventBestEffort(record);

  try {
    window.dispatchEvent(new CustomEvent('ux-telemetry-event', { detail: record }));
  } catch (_) {
    // Ignore browser compatibility issues for telemetry events.
  }

  return record;
}

export function readUIEvents() {
  return readEvents();
}

export function clearUIEvents() {
  localStorage.removeItem(STORAGE_KEY);
}
