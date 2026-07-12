/**
 * API client for the Telegram-Panel backend.
 *
 * A thin fetch wrapper that attaches the JWT from localStorage and exposes
 * grouped method objects (authApi, accountsApi, automationApi, …) mirroring the
 * backend routes.
 */

const API_BASE_URL: string = (process.env.API_BASE_URL as string) || '/api';
const TOKEN_KEY = 'tg_panel_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    if (res.status === 401) clearToken();
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
};

export const authApi = {
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  register: (data: { username: string; password: string }) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const accountsApi = {
  getAll: () => api.get('/accounts'),
  create: (data: any) => api.post('/accounts', data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
};

export const audienceApi = {
  getAll: () => api.get('/audience'),
  collect: (data: { accountId: number; source: string }) => api.post('/audience/collect', data),
  clear: () => api.delete('/audience'),
};

export const messagesApi = {
  campaigns: () => api.get('/messages/campaigns'),
  send: (data: any) => api.post('/messages/send', data),
};

export const automationApi = {
  reaction: (data: any) => api.post('/automation/reaction', data),
  vote: (data: any) => api.post('/automation/vote', data),
  join: (data: any) => api.post('/automation/join', data),
  leave: (data: any) => api.post('/automation/leave', data),
  block: (data: any) => api.post('/automation/block', data),
  sendPv: (data: any) => api.post('/automation/send-pv', data),
  comment: (data: any) => api.post('/automation/comment', data),
  logs: (limit = 100) => api.get(`/automation/logs?limit=${limit}`),
};

export const proxiesApi = {
  getAll: () => api.get('/proxies'),
  create: (data: any) => api.post('/proxies', data),
  update: (id: number, data: any) => api.put(`/proxies/${id}`, data),
  delete: (id: number) => api.delete(`/proxies/${id}`),
  test: (id: number) => api.post(`/proxies/${id}/test`),
};

export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),
  campaignStats: (id: number) => api.get(`/analytics/campaigns/${id}/stats`),
  activity: (limit = 50) => api.get(`/analytics/activity?limit=${limit}`),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
};

export default api;
