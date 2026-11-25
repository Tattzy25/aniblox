import type { WorldSave } from '../types/aniblox';

let memoryToken: string | null = null;
const OFFLINE_SAVES_KEY = 'aniblox_offline_saves_v1';
const OFFLINE_QUEUE_KEY = 'aniblox_offline_sync_queue_v1';

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'AnibloxClient',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function cacheOfflineSave(save: WorldSave) {
  try {
    const raw = localStorage.getItem(OFFLINE_SAVES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, WorldSave>) : {};
    map[save.worldId] = save;
    localStorage.setItem(OFFLINE_SAVES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function getOfflineSave(worldId: string): WorldSave | null {
  try {
    const raw = localStorage.getItem(OFFLINE_SAVES_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, WorldSave>;
    return map[worldId] || null;
  } catch {
    return null;
  }
}

export function queueOfflineSync(worldId: string, payload: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as Array<{ worldId: string; payload: Record<string, unknown> }>) : [];
    queue.push({ worldId, payload });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch {
    // Ignore storage quota errors
  }
}

export async function flushOfflineSyncQueue(): Promise<number> {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const queue = JSON.parse(raw) as Array<{ worldId: string; payload: Record<string, unknown> }>;
    if (queue.length === 0) return 0;

    let synced = 0;
    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        await apiFetch(`/api/saves/${item.worldId}`, {
          method: 'POST',
          body: JSON.stringify(item.payload),
        });
        synced += 1;
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return synced;
  } catch {
    return 0;
  }
}
