import type { Request, Response, NextFunction } from 'express';
import type { SessionState, AttackConfig, AttackGuards } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
      session: SessionState;
    }
  }
}

const users = new Map<string, SessionState>();

function createEmptyAttackConfig(): AttackConfig {
  return {
    enabled: false,
    type: 'none',
    gapAt: null,
    reorderSeg1: null,
    reorderSeg2: null,
    replaySegment: null,
    _attackSegment: null,
  };
}

function createEmptyGuards(): AttackGuards {
  return { replay: false, gap: false, mdatSwap: false, reorder: false };
}

function createEmptyState(): SessionState {
  return {
    attackConfig: createEmptyAttackConfig(),
    guards: createEmptyGuards(),
    lastSeenSegment: null,
    pendingGap: false,
    pendingMoofTamper: false,
    mdatAttackAt: null,
    observedSegments: [],
    contentCache: new Map(),
  };
}

function getOrCreateUserState(userId: string): SessionState {
  if (!users.has(userId)) {
    users.set(userId, createEmptyState());
  }
  return users.get(userId) as SessionState;
}

export function clearAllSessions(): void {
  users.clear();
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userId = (req.headers['x-session-id'] as string ?? '').trim() || 'default';
  req.userId = userId;
  req.session = getOrCreateUserState(userId);
  next();
}
