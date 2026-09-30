import { SERVER_URL } from '@/lib/stock-control/constants';
import type {
  User,
  Lead,
  Market,
  DashboardStats,
  DashboardSettings,
} from '@/lib/stock-control/types';

const HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

// ─── Dashboard ─────────────────────────────────────────────
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const r = await fetch(`${SERVER_URL}/api/stock-control`, { headers: HEADERS });
  const d = await r.json();
  return d.stats;
}

// ─── Global automation ─────────────────────────────────────
export async function fetchGlobalAutomation(): Promise<boolean> {
  const r = await fetch(`${SERVER_URL}/api/global-automation`, { headers: HEADERS });
  const d = await r.json();
  return d.automation_enabled;
}

export async function updateGlobalAutomation(enabled: boolean): Promise<void> {
  await fetch(`${SERVER_URL}/api/global-automation`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ enabled }),
  });
}

// ─── Markets ───────────────────────────────────────────────
export async function fetchMarkets(): Promise<Market[]> {
  const r = await fetch(`${SERVER_URL}/api/markets`, { headers: HEADERS });
  return r.json();
}

export async function updateMarketAutomation(marketId: number, enabled: boolean): Promise<void> {
  await fetch(`${SERVER_URL}/api/markets/${marketId}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ automation_enabled: enabled }),
  });
}

// ─── Dashboard settings (auto-rotate) ──────────────────────
export async function fetchDashboardSettings(): Promise<DashboardSettings> {
  const r = await fetch(`${SERVER_URL}/api/dashboard-settings`, { headers: HEADERS });
  return r.json();
}

export async function updateDashboardSettings(
  payload: Partial<DashboardSettings>
): Promise<DashboardSettings> {
  const r = await fetch(`${SERVER_URL}/api/dashboard-settings`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  return r.json();
}

// ─── Users ─────────────────────────────────────────────────
export async function fetchUsers(): Promise<User[]> {
  const r = await fetch(`${SERVER_URL}/api/users/`, { headers: HEADERS });
  if (!r.ok) throw new Error('Error al conectar con la API de Flask');
  return r.json();
}

export async function updateUser(userId: number, payload: Record<string, any>): Promise<void> {
  const r = await fetch(`${SERVER_URL}/api/users/${userId}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('Error al actualizar usuario');
}

export async function fetchUserByName(name: string): Promise<any[]> {
  const r = await fetch(`${SERVER_URL}/api/users/by-name/${encodeURIComponent(name)}`, {
    headers: HEADERS,
  });
  return r.json();
}

// ─── Market targets ────────────────────────────────────────
export async function updateUserMarketTargets(
  userId: number,
  targets: { market_id: number; target_percent: number }[]
): Promise<void> {
  await fetch(`${SERVER_URL}/api/users/${userId}/market-targets`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ targets }),
  });
}

export async function deleteUserMarketTargets(userId: number): Promise<void> {
  await fetch(`${SERVER_URL}/api/users/${userId}/market-targets`, {
    method: 'DELETE',
    headers: HEADERS,
  });
}

// ─── User leads ────────────────────────────────────────────
export async function fetchUserLeads(userId: number): Promise<Lead[]> {
  const r = await fetch(`${SERVER_URL}/api/users/${userId}/leads`, { headers: HEADERS });
  return r.json();
}