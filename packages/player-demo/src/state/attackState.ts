/**
 * Thin client for controlling proxy-server attack scenarios.
 * Only sends HTTP commands to the proxy — does not touch dash.js or segment state.
 */

export const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'http://localhost:8083';

async function post(path: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  } catch (error) {
    console.warn('[attackState] POST request failed:', error);
    return false;
  }
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PROXY_BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    console.warn('[attackState] GET request failed:', error);
    return null;
  }
}

export async function injectGapAttack(gapSize = 1): Promise<boolean> {
  return post('/attack/gap', { gapSize });
}

export async function injectOutOfOrderAttack(offset: number): Promise<boolean> {
  return post('/attack/out-of-order', { offset });
}

export async function injectReplayAttack(): Promise<boolean> {
  return post('/attack/replay');
}

export async function injectMdatSwapAttack(offset = 3): Promise<boolean> {
  return post('/attack/mdat-swap', { offset });
}

export async function disableAllAttacks(): Promise<boolean> {
  return post('/attack/disable');
}

type AttackStatus = {
  observed: { lastSeen: number | null };
};

export async function getCurrentSegmentNumber(): Promise<number | null> {
  const status = await get<AttackStatus>('/attack/status');
  return status?.observed?.lastSeen ?? null;
}
