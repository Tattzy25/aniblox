import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.js';
import {
  clearSessionCookie,
  getUserById,
  hashPassword,
  mapDbUserToProfile,
  optionalAuth,
  requireAuth,
  setSessionCookie,
  signToken,
  verifyPassword,
  type AuthedRequest,
} from './server/auth.js';
import { generateAiLuaScript, generateAiWorld, modifyAiWorld } from './server/ai.js';
import {
  callsAddTracks,
  callsCreateSession,
  callsRenegotiateSession,
  generateTurnIceServers,
  getCloudflareCapabilities,
  uploadWorldSnapshotToR2,
  uploadWorldThumbnailToR2,
  verifyAllCloudflareServices,
} from './server/cloudflare.js';
import {
  attachWebSocketServer,
  findMatchmakingRoom,
  getActiveRoomCount,
  getOnlineUserIds,
  getOnlineUserWorld,
} from './server/realtime.js';
import { BATTLE_PASS_REWARDS, DAILY_REWARDS, DEFAULT_AVATAR, THUMBNAILS } from './src/data/presets.js';
import type { WorldGenre } from './src/types/aniblox.js';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

// ---------- AUTH ROUTES ----------
app.post('/api/auth/guest', (_req, res) => {
  const now = new Date().toISOString();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const username = `Bloxer${suffix}`;
  const { salt, hash } = hashPassword(Math.random().toString(36));

  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, salt, display_name, bio, avatar_config,
      anibux, xp, level, elo, battle_pass_tier, battle_pass_premium,
      claimed_pass_tiers, daily_streak, role, tutorial_step, matches_played,
      wins, blocks_placed, is_guest, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    username,
    hash,
    salt,
    username,
    'Exploring worlds and building in Aniblox.',
    JSON.stringify(DEFAULT_AVATAR),
    600,
    0,
    1,
    1000,
    1,
    0,
    '[]',
    0,
    'player',
    0,
    0,
    0,
    0,
    1,
    now
  );

  // Give starter free accessory
  db.prepare('INSERT OR IGNORE INTO user_inventory (user_id, item_id, purchased_at) VALUES (?, ?, ?)').run(
    id,
    'visor_cyber',
    now
  );

  const token = signToken(id);
  setSessionCookie(res, token);
  const user = getUserById(id);
  res.json({ token, user });
});

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body?.username || '').trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || username).trim().slice(0, 28) || username;

  if (username.length < 3 || password.length < 4) {
    res.status(400).json({ error: 'Username (3+ chars) and password (4+ chars) are required.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (existing) {
    res.status(409).json({ error: 'Username is already taken.' });
    return;
  }

  const now = new Date().toISOString();
  const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { salt, hash } = hashPassword(password);

  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, salt, display_name, bio, avatar_config,
      anibux, xp, level, elo, battle_pass_tier, battle_pass_premium,
      claimed_pass_tiers, daily_streak, role, tutorial_step, matches_played,
      wins, blocks_placed, is_guest, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    username,
    hash,
    salt,
    displayName,
    'Creator & player on Aniblox.',
    JSON.stringify(DEFAULT_AVATAR),
    750,
    0,
    1,
    1050,
    1,
    0,
    '[]',
    0,
    'creator',
    0,
    0,
    0,
    0,
    0,
    now
  );

  db.prepare('INSERT OR IGNORE INTO user_inventory (user_id, item_id, purchased_at) VALUES (?, ?, ?)').run(
    id,
    'visor_cyber',
    now
  );

  const token = signToken(id);
  setSessionCookie(res, token);
  res.json({ token, user: getUserById(id) });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
    .get(username) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(password, String(row.salt), String(row.password_hash))) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  const token = signToken(String(row.id));
  setSessionCookie(res, token);
  res.json({ token, user: mapDbUserToProfile(row) });
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', optionalAuth, (req: AuthedRequest, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  const token = signToken(req.user.id);
  res.json({ user: req.user, token });
});

// ---------- PROFILE & AVATAR ----------
app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const displayName = typeof req.body?.displayName === 'string'
    ? req.body.displayName.trim().slice(0, 28) || user.displayName
    : user.displayName;
  const bio = typeof req.body?.bio === 'string'
    ? req.body.bio.trim().slice(0, 180)
    : user.bio;
  const avatarConfig = req.body?.avatarConfig ? JSON.stringify(req.body.avatarConfig) : JSON.stringify(user.avatarConfig);
  const tutorialStep = typeof req.body?.tutorialStep === 'number'
    ? Math.max(user.tutorialStep, Math.min(10, req.body.tutorialStep))
    : user.tutorialStep;

  db.prepare(`
    UPDATE users SET display_name = ?, bio = ?, avatar_config = ?, tutorial_step = ?
    WHERE id = ?
  `).run(displayName, bio, avatarConfig, tutorialStep, user.id);

  res.json({ user: getUserById(user.id) });
});

// ---------- WORLDS & TEMPLATES ----------
app.get('/api/worlds', optionalAuth, (req: AuthedRequest, res) => {
  const uid = req.user?.id || '';
  const rows = db
    .prepare('SELECT * FROM worlds WHERE is_published = 1 OR creator_id = ? ORDER BY plays DESC, updated_at DESC')
    .all(uid) as Record<string, unknown>[];
  const worlds = rows.map((r) => ({
    id: String(r.id),
    creatorId: String(r.creator_id),
    creatorName: String(r.creator_name),
    title: String(r.title),
    description: String(r.description),
    genre: String(r.genre) as WorldGenre,
    thumbnailUrl: String(r.thumbnail_url),
    skyColor: String(r.sky_color),
    blocks: JSON.parse(String(r.blocks_json)),
    scriptCode: String(r.script_code),
    maxPlayers: Number(r.max_players),
    plays: Number(r.plays),
    likes: Number(r.likes),
    activePlayers: getActiveRoomCount(String(r.id)),
    isPublished: Boolean(r.is_published),
    updatedAt: String(r.updated_at),
  }));
  res.json({ worlds });
});

function sanitizeThumbnailUrl(candidate: unknown, genre: WorldGenre): string {
  const fallback = THUMBNAILS[genre] || THUMBNAILS.sandbox;
  if (typeof candidate !== 'string') return fallback;
  const trimmed = candidate.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

app.post('/api/worlds/thumbnail', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const worldId = String(req.body?.worldId || `world_${Date.now()}`);
    const imageDataUrl = String(req.body?.imageDataUrl || '');
    if (!imageDataUrl) {
      res.status(400).json({ error: 'imageDataUrl is required.' });
      return;
    }
    const uploaded = await uploadWorldThumbnailToR2(worldId, imageDataUrl);
    if (!uploaded) {
      res.json({ url: null, configured: false });
      return;
    }
    res.json({ url: uploaded.url, key: uploaded.key, configured: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Thumbnail upload failed';
    res.status(400).json({ error: message });
  }
});

app.post('/api/worlds', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const id = req.body?.id ? String(req.body.id) : `world_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const title = String(req.body?.title || 'Untitled Aniblox World').trim().slice(0, 60);
  const description = String(req.body?.description || 'Built in Aniblox Studio.').trim().slice(0, 240);
  const genre = (['obby', 'tycoon', 'simulator', 'arena', 'sandbox', 'social'].includes(String(req.body?.genre))
    ? String(req.body.genre)
    : 'sandbox') as WorldGenre;
  const skyColor = String(req.body?.skyColor || '#38BDF8');
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
  const scriptCode = String(req.body?.scriptCode || '');
  const isPublished = req.body?.isPublished !== undefined ? (req.body.isPublished ? 1 : 0) : 1;
  const thumbnailUrl = sanitizeThumbnailUrl(req.body?.thumbnailUrl, genre);
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT creator_id FROM worlds WHERE id = ?').get(id) as { creator_id: string } | undefined;
  if (existing && existing.creator_id !== user.id && user.role !== 'moderator') {
    // Fork/remix into a new world ID owned by the current user
    const forkedId = `world_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO worlds (id, creator_id, creator_name, title, description, genre, thumbnail_url, sky_color, blocks_json, script_code, max_players, plays, likes, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(forkedId, user.id, user.displayName, title, description, genre, thumbnailUrl, skyColor, JSON.stringify(blocks), scriptCode, 20, 1, 0, isPublished, now);
    db.prepare('UPDATE users SET blocks_placed = blocks_placed + ?, xp = xp + 50 WHERE id = ?').run(blocks.length, user.id);
    uploadWorldSnapshotToR2(forkedId, { id: forkedId, title, genre, skyColor, blocks, scriptCode, updatedAt: now }).catch(() => {});
    res.json({ id: forkedId, thumbnailUrl, user: getUserById(user.id) });
    return;
  }

  if (existing) {
    db.prepare(`
      UPDATE worlds SET title = ?, description = ?, genre = ?, thumbnail_url = ?, sky_color = ?, blocks_json = ?, script_code = ?, is_published = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, genre, thumbnailUrl, skyColor, JSON.stringify(blocks), scriptCode, isPublished, now, id);
  } else {
    db.prepare(`
      INSERT INTO worlds (id, creator_id, creator_name, title, description, genre, thumbnail_url, sky_color, blocks_json, script_code, max_players, plays, likes, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, user.displayName, title, description, genre, thumbnailUrl, skyColor, JSON.stringify(blocks), scriptCode, 20, 1, 0, isPublished, now);
  }

  db.prepare('UPDATE users SET blocks_placed = blocks_placed + ?, xp = xp + 40 WHERE id = ?').run(blocks.length, user.id);
  uploadWorldSnapshotToR2(id, { id, title, genre, skyColor, blocks, scriptCode, updatedAt: now }).catch(() => {});
  res.json({ id, thumbnailUrl, user: getUserById(user.id) });
});

app.post('/api/worlds/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  db.prepare('UPDATE worlds SET likes = likes + 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- CLOUDFLARE VOICE (TURN + CALLS SFU) ----------
app.get('/api/voice/ice', requireAuth, async (_req, res) => {
  const result = await generateTurnIceServers();
  res.json(result);
});

app.post('/api/voice/sfu/sessions/new', requireAuth, async (_req, res) => {
  try {
    const data = await callsCreateSession();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : 'SFU unavailable' });
  }
});

app.post('/api/voice/sfu/sessions/:sessionId/tracks/new', requireAuth, async (req, res) => {
  try {
    const data = await callsAddTracks(String(req.params.sessionId), req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'SFU tracks request failed' });
  }
});

app.put('/api/voice/sfu/sessions/:sessionId/renegotiate', requireAuth, async (req, res) => {
  try {
    const data = await callsRenegotiateSession(String(req.params.sessionId), req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'SFU renegotiate failed' });
  }
});

app.get('/api/cloudflare/status', requireAuth, (_req, res) => {
  res.json(getCloudflareCapabilities());
});

app.get('/api/cloudflare/verify', requireAuth, async (_req, res) => {
  const report = await verifyAllCloudflareServices();
  res.json(report);
});

// ---------- CLOUD SAVES & MATCHMAKING ----------
app.get('/api/saves/:worldId', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const worldId = String(req.params.worldId);
  const row = db.prepare('SELECT * FROM world_saves WHERE user_id = ? AND world_id = ?').get(user.id, worldId) as Record<string, unknown> | undefined;
  if (!row) {
    res.json({
      save: {
        userId: user.id,
        worldId,
        checkpoint: 0,
        coins: 0,
        tycoonStage: 0,
        bestTimeMs: null,
        score: 0,
        updatedAt: new Date().toISOString(),
      },
    });
    return;
  }
  res.json({
    save: {
      userId: String(row.user_id),
      worldId: String(row.world_id),
      checkpoint: Number(row.checkpoint),
      coins: Number(row.coins),
      tycoonStage: Number(row.tycoon_stage),
      bestTimeMs: row.best_time_ms !== null ? Number(row.best_time_ms) : null,
      score: Number(row.score),
      updatedAt: String(row.updated_at),
    },
  });
});

app.post('/api/saves/:worldId', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const worldId = String(req.params.worldId);
  const checkpoint = Math.max(0, Number(req.body?.checkpoint) || 0);
  const coins = Math.max(0, Number(req.body?.coins) || 0);
  const tycoonStage = Math.max(0, Number(req.body?.tycoonStage) || 0);
  const score = Math.max(0, Number(req.body?.score) || 0);
  const bestTimeMs = req.body?.bestTimeMs ? Number(req.body.bestTimeMs) : null;
  const awardAnibux = Math.max(0, Math.min(200, Number(req.body?.awardAnibux) || 0));
  const awardXp = Math.max(0, Math.min(300, Number(req.body?.awardXp) || 0));
  const wonMatch = Boolean(req.body?.wonMatch);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO world_saves (user_id, world_id, checkpoint, coins, tycoon_stage, best_time_ms, score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, world_id) DO UPDATE SET
      checkpoint = MAX(checkpoint, excluded.checkpoint),
      coins = excluded.coins,
      tycoon_stage = MAX(tycoon_stage, excluded.tycoon_stage),
      best_time_ms = COALESCE(MIN(best_time_ms, excluded.best_time_ms), excluded.best_time_ms),
      score = MAX(score, excluded.score),
      updated_at = excluded.updated_at
  `).run(user.id, worldId, checkpoint, coins, tycoonStage, bestTimeMs, score, now);

  if (awardAnibux > 0 || awardXp > 0 || wonMatch) {
    const newXp = user.xp + awardXp;
    const newLevel = Math.floor(newXp / 250) + 1;
    const newTier = Math.min(6, Math.floor(newXp / 350) + 1);
    const eloDelta = wonMatch ? 24 : 0;
    db.prepare(`
      UPDATE users SET
        anibux = anibux + ?,
        xp = ?,
        level = ?,
        battle_pass_tier = MAX(battle_pass_tier, ?),
        elo = elo + ?,
        matches_played = matches_played + ?,
        wins = wins + ?
      WHERE id = ?
    `).run(awardAnibux, newXp, newLevel, newTier, eloDelta, wonMatch ? 1 : 0, wonMatch ? 1 : 0, user.id);
  }

  db.prepare('UPDATE worlds SET plays = plays + ? WHERE id = ?').run(req.body?.incrementPlay ? 1 : 0, worldId);

  res.json({ ok: true, user: getUserById(user.id) });
});

app.post('/api/matchmake', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const worldId = String(req.body?.worldId || 'world_combat_arena');
  const roomId = findMatchmakingRoom(worldId, user.elo);
  res.json({
    roomId,
    worldId,
    bracket: `${Math.floor(user.elo / 400) * 400}–${Math.floor(user.elo / 400) * 400 + 399} Elo`,
  });
});

// ---------- PRIVATE SERVERS ----------
app.get('/api/private-servers', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT ps.*, w.title as world_title
    FROM private_servers ps
    LEFT JOIN worlds w ON w.id = ps.world_id
    ORDER BY ps.created_at DESC
    LIMIT 25
  `).all() as Record<string, unknown>[];

  res.json({
    servers: rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      worldId: String(r.world_id),
      worldTitle: String(r.world_title || 'Aniblox World'),
      ownerId: String(r.owner_id),
      ownerName: String(r.owner_name),
      name: String(r.name),
      maxPlayers: Number(r.max_players),
      activePlayers: 0,
      createdAt: String(r.created_at),
    })),
  });
});

app.post('/api/private-servers', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const worldId = String(req.body?.worldId || 'world_sky_obby');
  const name = String(req.body?.name || `${user.displayName}'s VIP Server`).trim().slice(0, 40);
  const maxPlayers = Math.max(2, Math.min(30, Number(req.body?.maxPlayers) || 12));
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const id = `ps_${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO private_servers (id, code, world_id, owner_id, owner_name, name, max_players, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, code, worldId, user.id, user.displayName, name, maxPlayers, now);

  res.json({ id, code, worldId, name, maxPlayers });
});

app.get('/api/private-servers/join/:code', requireAuth, (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const row = db.prepare('SELECT * FROM private_servers WHERE code = ?').get(code) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Private server code not found.' });
    return;
  }
  res.json({
    server: {
      id: String(row.id),
      code: String(row.code),
      worldId: String(row.world_id),
      name: String(row.name),
    },
  });
});

// ---------- ECONOMY, MARKETPLACE, BATTLE PASS & DAILY REWARDS ----------
app.get('/api/marketplace', optionalAuth, (req: AuthedRequest, res) => {
  const items = db.prepare('SELECT * FROM marketplace_items ORDER BY sales DESC').all() as Record<string, unknown>[];
  const ownedSet = new Set<string>();
  if (req.user) {
    const ownedRows = db.prepare('SELECT item_id FROM user_inventory WHERE user_id = ?').all(req.user.id) as { item_id: string }[];
    for (const r of ownedRows) ownedSet.add(r.item_id);
  }
  res.json({
    items: items.map((i) => ({
      id: String(i.id),
      creatorId: String(i.creator_id),
      creatorName: String(i.creator_name),
      name: String(i.name),
      description: String(i.description),
      category: String(i.category),
      price: Number(i.price),
      color: String(i.color),
      accentColor: String(i.accent_color),
      assetKey: String(i.asset_key),
      sales: Number(i.sales),
      owned: ownedSet.has(String(i.id)) || Number(i.price) === 0,
      createdAt: String(i.created_at),
    })),
  });
});

app.post('/api/marketplace/buy', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const itemId = String(req.body?.itemId || '');
  const item = db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(itemId) as Record<string, unknown> | undefined;
  if (!item) {
    res.status(404).json({ error: 'Item not found.' });
    return;
  }

  const already = db.prepare('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_id = ?').get(user.id, itemId);
  if (already) {
    res.status(400).json({ error: 'You already own this item.' });
    return;
  }

  const price = Number(item.price);
  if (user.anibux < price) {
    res.status(400).json({ error: 'Insufficient Anibux balance.' });
    return;
  }

  const now = new Date().toISOString();
  const creatorShare = Math.floor(price * 0.7); // 70% creator revenue share!

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET anibux = anibux - ? WHERE id = ?').run(price, user.id);
    if (creatorShare > 0) {
      db.prepare('UPDATE users SET anibux = anibux + ? WHERE id = ?').run(creatorShare, String(item.creator_id));
    }
    db.prepare('INSERT INTO user_inventory (user_id, item_id, purchased_at) VALUES (?, ?, ?)').run(user.id, itemId, now);
    db.prepare('UPDATE marketplace_items SET sales = sales + 1 WHERE id = ?').run(itemId);
  });
  tx();

  res.json({ ok: true, user: getUserById(user.id) });
});

app.post('/api/marketplace/publish', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const description = String(req.body?.description || 'User-generated Aniblox cosmetic.').trim().slice(0, 120);
  const category = ['hat', 'wings', 'gear', 'aura'].includes(String(req.body?.category)) ? String(req.body.category) : 'hat';
  const price = Math.max(25, Math.min(2500, Number(req.body?.price) || 150));
  const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color)) ? String(req.body.color) : '#38BDF8';
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.accentColor)) ? String(req.body.accentColor) : '#F59E0B';
  const assetKey = String(req.body?.assetKey || (category === 'hat' ? 'crown' : category === 'wings' ? 'wings' : category === 'gear' ? 'blade' : 'halo'));

  if (name.length < 3) {
    res.status(400).json({ error: 'Item name must be at least 3 characters.' });
    return;
  }

  const id = `ugc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO marketplace_items (id, creator_id, creator_name, name, description, category, price, color, accent_color, asset_key, sales, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, user.displayName, name, description, category, price, color, accentColor, assetKey, 0, now);

  db.prepare('INSERT OR IGNORE INTO user_inventory (user_id, item_id, purchased_at) VALUES (?, ?, ?)').run(user.id, id, now);
  res.json({ id, ok: true });
});

app.post('/api/rewards/daily', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const today = new Date().toISOString().slice(0, 10);
  if (user.lastDailyClaim && user.lastDailyClaim.slice(0, 10) === today) {
    res.status(400).json({ error: 'Daily reward already claimed today.' });
    return;
  }

  const nextStreak = (user.dailyStreak % 7) + 1;
  const reward = DAILY_REWARDS[nextStreak - 1] || DAILY_REWARDS[0];
  const newXp = user.xp + reward.xp;
  const newLevel = Math.floor(newXp / 250) + 1;
  const newTier = Math.min(6, Math.floor(newXp / 350) + 1);

  db.prepare(`
    UPDATE users SET
      anibux = anibux + ?,
      xp = ?,
      level = ?,
      battle_pass_tier = MAX(battle_pass_tier, ?),
      daily_streak = ?,
      last_daily_claim = ?
    WHERE id = ?
  `).run(reward.anibux, newXp, newLevel, newTier, nextStreak, new Date().toISOString(), user.id);

  res.json({ reward, user: getUserById(user.id) });
});

app.post('/api/battlepass/unlock-premium', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.battlePassPremium) {
    res.status(400).json({ error: 'Premium Battle Pass already unlocked.' });
    return;
  }
  if (user.anibux < 350) {
    res.status(400).json({ error: 'Need 350 Anibux to unlock Premium Battle Pass.' });
    return;
  }
  db.prepare('UPDATE users SET anibux = anibux - 350, battle_pass_premium = 1 WHERE id = ?').run(user.id);
  res.json({ user: getUserById(user.id) });
});

app.post('/api/battlepass/claim', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const tier = Number(req.body?.tier);
  const reward = BATTLE_PASS_REWARDS.find((r) => r.tier === tier);
  if (!reward) {
    res.status(404).json({ error: 'Battle pass tier not found.' });
    return;
  }
  if (user.xp < reward.xpRequired) {
    res.status(400).json({ error: `Need ${reward.xpRequired} XP to unlock Tier ${tier}.` });
    return;
  }
  if (user.claimedPassTiers.includes(tier)) {
    res.status(400).json({ error: 'Tier already claimed.' });
    return;
  }

  const nextClaimed = [...user.claimedPassTiers, tier];
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET anibux = anibux + ?, claimed_pass_tiers = ? WHERE id = ?').run(
    reward.anibux,
    JSON.stringify(nextClaimed),
    user.id
  );
  if (user.battlePassPremium && reward.itemId) {
    db.prepare('INSERT OR IGNORE INTO user_inventory (user_id, item_id, purchased_at) VALUES (?, ?, ?)').run(
      user.id,
      reward.itemId,
      now
    );
  }
  res.json({ user: getUserById(user.id) });
});

// ---------- SOCIAL, FRIENDS, FEED & LEADERBOARDS ----------
app.get('/api/social/overview', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const onlineIds = getOnlineUserIds();

  const allUsers = db.prepare('SELECT * FROM users WHERE id != ? ORDER BY elo DESC LIMIT 30').all(user.id) as Record<string, unknown>[];
  const rels = db.prepare('SELECT * FROM friendships WHERE user_id = ? OR friend_id = ?').all(user.id, user.id) as Record<string, unknown>[];

  const relMap = new Map<string, 'accepted' | 'pending_out' | 'pending_in'>();
  for (const r of rels) {
    const uid = String(r.user_id);
    const fid = String(r.friend_id);
    const status = String(r.status);
    if (uid === user.id) {
      relMap.set(fid, status === 'accepted' ? 'accepted' : 'pending_out');
    } else {
      relMap.set(uid, status === 'accepted' ? 'accepted' : 'pending_in');
    }
  }

  const friends = allUsers
    .filter((u) => relMap.has(String(u.id)))
    .map((u) => {
      const id = String(u.id);
      const wid = getOnlineUserWorld(id);
      return {
        id,
        username: String(u.username),
        displayName: String(u.display_name),
        elo: Number(u.elo),
        level: Number(u.level),
        status: relMap.get(id)!,
        online: onlineIds.has(id) || id.startsWith('creator_'),
        currentWorldId: wid,
        avatarConfig: JSON.parse(String(u.avatar_config)),
      };
    });

  const suggestedPlayers = allUsers
    .filter((u) => !relMap.has(String(u.id)) && !Number(u.is_guest))
    .slice(0, 12)
    .map((u) => ({
      id: String(u.id),
      username: String(u.username),
      displayName: String(u.display_name),
      elo: Number(u.elo),
      level: Number(u.level),
    }));

  const feedRows = db.prepare('SELECT * FROM feed_posts ORDER BY created_at DESC LIMIT 25').all() as Record<string, unknown>[];
  const leaderboardRows = db
    .prepare('SELECT id, username, display_name, elo, level, xp, wins, blocks_placed FROM users ORDER BY elo DESC LIMIT 20')
    .all() as Record<string, unknown>[];

  res.json({
    friends,
    suggestedPlayers,
    feed: feedRows.map((f) => ({
      id: String(f.id),
      userId: String(f.user_id),
      username: String(f.username),
      displayName: String(f.display_name),
      worldId: String(f.world_id),
      worldTitle: String(f.world_title),
      content: String(f.content),
      statHighlight: String(f.stat_highlight),
      likes: Number(f.likes),
      createdAt: String(f.created_at),
    })),
    leaderboard: leaderboardRows.map((l) => ({
      id: String(l.id),
      username: String(l.username),
      displayName: String(l.display_name),
      elo: Number(l.elo),
      level: Number(l.level),
      xp: Number(l.xp),
      wins: Number(l.wins),
      blocksPlaced: Number(l.blocks_placed),
    })),
  });
});

app.post('/api/friends/request', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const targetId = String(req.body?.targetUserId || '');
  if (!targetId || targetId === user.id) {
    res.status(400).json({ error: 'Invalid friend target.' });
    return;
  }
  const now = new Date().toISOString();
  // Auto-accept seeded creators for instant multiplayer UX
  const status = targetId.startsWith('creator_') ? 'accepted' : 'pending';
  db.prepare(`
    INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, targetId, status, now);
  res.json({ ok: true, status });
});

app.post('/api/friends/accept', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const targetId = String(req.body?.targetUserId || '');
  db.prepare(`UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`).run(targetId, user.id);
  res.json({ ok: true });
});

app.post('/api/feed', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const worldId = String(req.body?.worldId || 'world_sky_obby');
  const worldTitle = String(req.body?.worldTitle || 'Aniblox World');
  const content = String(req.body?.content || '').trim().slice(0, 220);
  const statHighlight = String(req.body?.statHighlight || `Level ${user.level} · ${user.elo} Elo`).slice(0, 48);
  if (!content) {
    res.status(400).json({ error: 'Post content cannot be empty.' });
    return;
  }
  const id = `feed_${Date.now()}`;
  db.prepare(`
    INSERT INTO feed_posts (id, user_id, username, display_name, world_id, world_title, content, stat_highlight, likes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, user.username, user.displayName, worldId, worldTitle, content, statHighlight, 0, new Date().toISOString());
  res.json({ ok: true, id });
});

app.post('/api/feed/:id/like', requireAuth, (req, res) => {
  db.prepare('UPDATE feed_posts SET likes = likes + 1 WHERE id = ?').run(String(req.params.id));
  res.json({ ok: true });
});

// ---------- MODERATION & ANTI-CHEAT ----------
app.post('/api/reports', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const targetUserId = String(req.body?.targetUserId || 'unknown');
  const targetUsername = String(req.body?.targetUsername || 'UnknownPlayer').slice(0, 32);
  const reason = String(req.body?.reason || 'Toxic behavior').slice(0, 140);
  const chatExcerpt = String(req.body?.chatExcerpt || '').slice(0, 220);
  const worldId = String(req.body?.worldId || '');
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  db.prepare(`
    INSERT INTO reports (id, reporter_id, reporter_name, target_user_id, target_username, reason, chat_excerpt, world_id, status, action_taken, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', '', ?)
  `).run(id, user.id, user.displayName, targetUserId, targetUsername, reason, chatExcerpt, worldId, new Date().toISOString());

  res.json({ ok: true, id });
});

app.get('/api/moderation/overview', requireAuth, (_req, res) => {
  const reports = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 40').all() as Record<string, unknown>[];
  const anticheat = db.prepare('SELECT * FROM anticheat_logs ORDER BY created_at DESC LIMIT 40').all() as Record<string, unknown>[];

  res.json({
    reports: reports.map((r) => ({
      id: String(r.id),
      reporterId: String(r.reporter_id),
      reporterName: String(r.reporter_name),
      targetUserId: String(r.target_user_id),
      targetUsername: String(r.target_username),
      reason: String(r.reason),
      chatExcerpt: String(r.chat_excerpt),
      worldId: String(r.world_id),
      status: String(r.status),
      actionTaken: String(r.action_taken),
      createdAt: String(r.created_at),
    })),
    anticheatLogs: anticheat.map((a) => ({
      id: String(a.id),
      userId: String(a.user_id),
      username: String(a.username),
      worldId: String(a.world_id),
      violationType: String(a.violation_type),
      details: String(a.details),
      severity: String(a.severity),
      createdAt: String(a.created_at),
    })),
  });
});

app.post('/api/moderation/reports/:id/resolve', requireAuth, (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const action = String(req.body?.action || 'dismiss'); // 'mute' | 'warn' | 'dismiss'
  const rep = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!rep) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  if (action === 'mute') {
    db.prepare('UPDATE users SET is_muted = 1 WHERE id = ?').run(String(rep.target_user_id));
    db.prepare(`UPDATE reports SET status = 'actioned', action_taken = 'User Muted' WHERE id = ?`).run(id);
  } else if (action === 'warn') {
    db.prepare(`UPDATE reports SET status = 'actioned', action_taken = 'Official Warning Issued' WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE reports SET status = 'dismissed', action_taken = 'Dismissed' WHERE id = ?`).run(id);
  }

  res.json({ ok: true });
});

// ---------- AI STUDIO BUILDER (MULTI-PROVIDER / AI GATEWAY / GEMINI) ----------
app.post('/api/ai/build-world', requireAuth, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const genre = (req.body?.genre as WorldGenre) || 'obby';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
    if (!prompt) {
      res.status(400).json({ error: 'Please enter a world build prompt.' });
      return;
    }
    const result = await generateAiWorld(prompt, genre, model);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Builder failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/generate-script', requireAuth, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const worldTitle = String(req.body?.worldTitle || 'Aniblox World');
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
    if (!prompt) {
      res.status(400).json({ error: 'Please enter a script description.' });
      return;
    }
    const scriptCode = await generateAiLuaScript(prompt, worldTitle, model);
    res.json({ scriptCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Script Generator failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/edit-world', requireAuth, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const scriptCode = String(req.body?.scriptCode || '');
    const genre = (req.body?.genre as WorldGenre) || 'obby';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
    if (!prompt) {
      res.status(400).json({ error: 'Please enter an edit instruction.' });
      return;
    }
    const result = await modifyAiWorld(prompt, blocks, scriptCode, genre, model);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI World Edit failed';
    res.status(500).json({ error: message });
  }
});

// ---------- START SERVER + VITE + WEBSOCKETS ----------
async function startServer() {
  const server = http.createServer(app);
  attachWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist/index.html'));

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: {
          server,
          path: '/__vite_hmr',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Aniblox server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aniblox server:', err);
  process.exit(1);
});
