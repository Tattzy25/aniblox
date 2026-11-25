import Database from 'better-sqlite3';
import path from 'path';
import {
  DEFAULT_AVATAR,
  STARTER_MARKETPLACE,
  STARTER_WORLDS,
} from '../src/data/presets.js';

const dbPath = path.resolve(process.cwd(), 'aniblox.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT 'Building worlds on Aniblox.',
      avatar_config TEXT NOT NULL,
      anibux INTEGER NOT NULL DEFAULT 500,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      elo INTEGER NOT NULL DEFAULT 1000,
      battle_pass_tier INTEGER NOT NULL DEFAULT 1,
      battle_pass_premium INTEGER NOT NULL DEFAULT 0,
      claimed_pass_tiers TEXT NOT NULL DEFAULT '[]',
      daily_streak INTEGER NOT NULL DEFAULT 0,
      last_daily_claim TEXT,
      role TEXT NOT NULL DEFAULT 'player',
      tutorial_step INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      blocks_placed INTEGER NOT NULL DEFAULT 0,
      is_muted INTEGER NOT NULL DEFAULT 0,
      is_guest INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      genre TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      sky_color TEXT NOT NULL DEFAULT '#38BDF8',
      blocks_json TEXT NOT NULL,
      script_code TEXT NOT NULL DEFAULT '',
      max_players INTEGER NOT NULL DEFAULT 20,
      plays INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_saves (
      user_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      checkpoint INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      tycoon_stage INTEGER NOT NULL DEFAULT 0,
      best_time_ms INTEGER,
      score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, world_id)
    );

    CREATE TABLE IF NOT EXISTS marketplace_items (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      color TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      sales INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS feed_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      world_id TEXT NOT NULL,
      world_title TEXT NOT NULL,
      content TEXT NOT NULL,
      stat_highlight TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      reason TEXT NOT NULL,
      chat_excerpt TEXT NOT NULL DEFAULT '',
      world_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      action_taken TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anticheat_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      world_id TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      details TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS private_servers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      world_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      name TEXT NOT NULL,
      max_players INTEGER NOT NULL DEFAULT 12,
      created_at TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const now = new Date().toISOString();

  // Seed creator accounts for leaderboards and friend discovery
  const seedUsers = [
    {
      id: 'creator_aniblox',
      username: 'AnibloxCore',
      displayName: 'AnibloxCore',
      bio: 'Official Aniblox platform architect and game template creator.',
      anibux: 12500,
      xp: 4800,
      level: 14,
      elo: 1840,
      role: 'moderator',
      wins: 64,
      matchesPlayed: 88,
      blocksPlaced: 1420,
      avatar: { ...DEFAULT_AVATAR, torsoColor: '#10B981', accessories: ['crown_studs', 'visor_cyber'] },
    },
    {
      id: 'creator_luna',
      username: 'LunaVoxel',
      displayName: 'Luna Voxel',
      bio: 'Crystal Cavern & Valkyrie designer. Building immersive obbies!',
      anibux: 6840,
      xp: 3650,
      level: 11,
      elo: 1690,
      role: 'creator',
      wins: 48,
      matchesPlayed: 74,
      blocksPlaced: 980,
      avatar: { ...DEFAULT_AVATAR, skinColor: '#FDE68A', torsoColor: '#06B6D4', accessories: ['valkyrie_helm', 'wings_mech'] },
    },
    {
      id: 'creator_kai',
      username: 'BuilderKai',
      displayName: 'Builder Kai',
      bio: 'Tycoon automation & Lua scripting specialist.',
      anibux: 4920,
      xp: 2890,
      level: 9,
      elo: 1520,
      role: 'creator',
      wins: 31,
      matchesPlayed: 55,
      blocksPlaced: 760,
      avatar: { ...DEFAULT_AVATAR, torsoColor: '#EA580C', accessories: ['jetpack_neon'] },
    },
    {
      id: 'creator_arena',
      username: 'ArenaMaster',
      displayName: 'Arena Master',
      bio: 'Top 3 Colosseum Blox Arena contender.',
      anibux: 5400,
      xp: 4120,
      level: 12,
      elo: 1920,
      role: 'creator',
      wins: 82,
      matchesPlayed: 105,
      blocksPlaced: 510,
      avatar: { ...DEFAULT_AVATAR, torsoColor: '#DC2626', accessories: ['cape_shadow', 'blade_plasma'] },
    },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, username, password_hash, salt, display_name, bio, avatar_config,
      anibux, xp, level, elo, battle_pass_tier, battle_pass_premium,
      claimed_pass_tiers, daily_streak, role, tutorial_step, matches_played,
      wins, blocks_placed, is_guest, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of seedUsers) {
    insertUser.run(
      u.id,
      u.username,
      'seeded_account_locked',
      'seeded_salt',
      u.displayName,
      u.bio,
      JSON.stringify(u.avatar),
      u.anibux,
      u.xp,
      u.level,
      u.elo,
      4,
      1,
      '[1,2,3]',
      5,
      u.role,
      4,
      u.matchesPlayed,
      u.wins,
      u.blocksPlaced,
      0,
      now
    );
  }

  const insertWorld = db.prepare(`
    INSERT OR IGNORE INTO worlds (
      id, creator_id, creator_name, title, description, genre, thumbnail_url,
      sky_color, blocks_json, script_code, max_players, plays, likes, is_published, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const w of STARTER_WORLDS) {
    insertWorld.run(
      w.id,
      w.creatorId,
      w.creatorName,
      w.title,
      w.description,
      w.genre,
      w.thumbnailUrl,
      w.skyColor,
      JSON.stringify(w.blocks),
      w.scriptCode,
      w.maxPlayers,
      w.plays,
      w.likes,
      w.isPublished ? 1 : 0,
      w.updatedAt
    );
    if (w.id === 'world_sky_obby') {
      db.prepare('UPDATE worlds SET blocks_json = ?, script_code = ? WHERE id = ? AND creator_id = ?').run(
        JSON.stringify(w.blocks),
        w.scriptCode,
        w.id,
        'creator_aniblox'
      );
    }
    if (w.id === 'world_combat_arena' || w.id === 'world_social_plaza') {
      db.prepare('UPDATE worlds SET sky_color = ?, blocks_json = ? WHERE id = ? AND creator_id = ?').run(
        w.skyColor,
        JSON.stringify(w.blocks),
        w.id,
        'creator_aniblox'
      );
    }
  }

  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO marketplace_items (
      id, creator_id, creator_name, name, description, category, price,
      color, accent_color, asset_key, sales, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of STARTER_MARKETPLACE) {
    insertItem.run(
      item.id,
      item.creatorId,
      item.creatorName,
      item.name,
      item.description,
      item.category,
      item.price,
      item.color,
      item.accentColor,
      item.assetKey,
      item.sales,
      item.createdAt
    );
  }

  const feedCount = (db.prepare('SELECT COUNT(*) as cnt FROM feed_posts').get() as { cnt: number }).cnt;
  if (feedCount === 0) {
    const insertFeed = db.prepare(`
      INSERT INTO feed_posts (id, user_id, username, display_name, world_id, world_title, content, stat_highlight, likes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFeed.run(
      'feed_1',
      'creator_arena',
      'ArenaMaster',
      'Arena Master',
      'world_combat_arena',
      'Colosseum Blox Arena',
      'Hit 1,920 Elo on the Center Bridge! Drop in for ranked 4v4 matches.',
      '1,920 Elo · 82 Wins',
      48,
      now
    );
    insertFeed.run(
      'feed_2',
      'creator_luna',
      'LunaVoxel',
      'Luna Voxel',
      'world_sky_obby',
      'Skyward Stud Obby',
      'Cleared the Cloud Deck laser bridge in 28.4 seconds with the new Ninja animation pack.',
      '28.4s Clear · Summit',
      37,
      now
    );
  }
}
