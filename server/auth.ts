import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';
import { DEFAULT_AVATAR } from '../src/data/presets.js';
import type { UserProfile } from '../src/types/aniblox.js';

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const SESSION_COOKIE_NAME = 'aniblox_session';

export function hashPassword(password: string, salt?: string) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  if (!salt || !storedHash || storedHash === 'seeded_account_locked') return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(storedHash, 'hex');
  if (derived.length !== target.length) return false;
  return crypto.timingSafeEqual(derived, target);
}

export function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

export function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME];
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
  });
}

export function mapDbUserToProfile(row: Record<string, unknown>): UserProfile {
  let avatar = DEFAULT_AVATAR;
  try {
    avatar = JSON.parse(String(row.avatar_config));
  } catch {
    avatar = DEFAULT_AVATAR;
  }
  let claimed: number[] = [];
  try {
    claimed = JSON.parse(String(row.claimed_pass_tiers || '[]'));
  } catch {
    claimed = [];
  }
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    bio: String(row.bio),
    avatarConfig: avatar,
    anibux: Number(row.anibux),
    xp: Number(row.xp),
    level: Number(row.level),
    elo: Number(row.elo),
    battlePassTier: Number(row.battle_pass_tier),
    battlePassPremium: Boolean(row.battle_pass_premium),
    claimedPassTiers: claimed,
    dailyStreak: Number(row.daily_streak),
    lastDailyClaim: row.last_daily_claim ? String(row.last_daily_claim) : null,
    role: (row.role as 'player' | 'creator' | 'moderator') || 'player',
    tutorialStep: Number(row.tutorial_step),
    matchesPlayed: Number(row.matches_played),
    wins: Number(row.wins),
    blocksPlaced: Number(row.blocks_placed),
    isGuest: Boolean(row.is_guest),
  };
}

export function getUserById(userId: string): UserProfile | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapDbUserToProfile(row);
}

export interface AuthedRequest extends Request {
  user?: UserProfile;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);
  const uid = verifyToken(token);
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  // CSRF check when using cookie auth on state-changing requests
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  if (!hasBearer && req.method !== 'GET' && req.method !== 'HEAD') {
    const xRequestedWith = req.headers['x-requested-with'];
    if (xRequestedWith !== 'AnibloxClient') {
      res.status(403).json({ error: 'Missing required request header' });
      return;
    }
  }
  const user = getUserById(uid);
  if (!user) {
    res.status(401).json({ error: 'User session invalid' });
    return;
  }
  req.user = user;
  next();
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);
  const uid = verifyToken(token);
  if (uid) {
    const user = getUserById(uid);
    if (user) req.user = user;
  }
  next();
}
