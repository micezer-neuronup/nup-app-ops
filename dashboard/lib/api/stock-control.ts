import { SERVER_URL } from '@/lib/stock-control/constants';
import type {
  User,
  Market,
  DashboardStats,
  DashboardSettings,
  HubspotOwner,
  DistributionRun,
  DistributionAssignmentItem,
} from '@/lib/stock-control/types';

const HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

// ────── Function: request ─────────────────────────────────────────────────
// ─── Calls the stock-control API and returns the JSON body
// ─── Throws the API's own error message ("error" field) if the call fails
// ──────────────────────────────────────────────────────────────────────────
async function request<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `Error ${r.status} en ${path}`);
  return data as T;
}

// ─── Dashboard ─────────────────────────────────────────────
export async function fetchDashboardStats(): Promise<DashboardStats> {
  return (await request('/api/stock-control')).stats;
}

// ─── Global automation ─────────────────────────────────────
export async function fetchGlobalAutomation(): Promise<boolean> {
  return (await request('/api/global-automation')).automation_enabled;
}

export async function updateGlobalAutomation(enabled: boolean): Promise<void> {
  await request('/api/global-automation', 'PUT', { enabled });
}

// ─── Markets ───────────────────────────────────────────────
export async function fetchMarkets(): Promise<Market[]> {
  return request('/api/markets');
}

export async function updateMarketAutomation(marketId: number, enabled: boolean): Promise<void> {
  await request(`/api/markets/${marketId}`, 'PUT', { automation_enabled: enabled });
}

// ─── Dashboard settings (auto-rotate) ──────────────────────
export async function fetchDashboardSettings(): Promise<DashboardSettings> {
  return request('/api/dashboard-settings');
}

export async function updateDashboardSettings(
  payload: Partial<DashboardSettings>
): Promise<DashboardSettings> {
  return request('/api/dashboard-settings', 'PUT', payload);
}

// ─── Users ─────────────────────────────────────────────────
export async function fetchUsers(): Promise<User[]> {
  return request('/api/users/');
}

export async function updateUser(userId: number, payload: Record<string, any>): Promise<void> {
  await request(`/api/users/${userId}`, 'PUT', payload);
}

export async function createUser(payload: Record<string, any>): Promise<number> {
  return (await request('/api/users/', 'POST', payload)).id;
}

export async function deleteUser(
  userId: number,
  payload: { deleted_by: string }
): Promise<void> {
  await request(`/api/users/${userId}`, 'DELETE', payload);
}

// Admins que pueden eliminar usuarios
export async function fetchAdmins(): Promise<string[]> {
  return request('/api/admins');
}

// ─── HubSpot owners (para crear usuarios) ──────────────────
export async function fetchHubspotOwners(): Promise<HubspotOwner[]> {
  return request('/api/hubspot/owners');
}

// ─── Market targets ────────────────────────────────────────
export async function updateUserMarketTargets(
  userId: number,
  targets: { market_id: number; target_percent: number }[]
): Promise<void> {
  await request(`/api/users/${userId}/market-targets`, 'PUT', { targets });
}

export async function deleteUserMarketTargets(userId: number): Promise<void> {
  await request(`/api/users/${userId}/market-targets`, 'DELETE');
}

// ─── Historial de distribuciones ───────────────────────────
export async function fetchDistributionRuns(includeEmpty = false): Promise<DistributionRun[]> {
  return request(`/api/distribution-runs?limit=50&include_empty=${includeEmpty ? 1 : 0}`);
}

export async function fetchDistributionRun(runId: number): Promise<DistributionAssignmentItem[]> {
  return request(`/api/distribution-runs/${runId}`);
}
