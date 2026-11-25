import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from './db.js';
import { getUserById, verifyToken } from './auth.js';
import { filterChatMessage } from './moderation.js';
import { checkMessageWithWorkersAi } from './cloudflare.js';
import type { AvatarConfig, BlockPart, ChatMessage, UserProfile } from '../src/types/aniblox.js';

interface RoomClient {
  ws: WebSocket;
  user: UserProfile;
  roomId: string;
  worldId: string;
  position: [number, number, number];
  yaw: number;
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'dance';
  speaking: boolean;
  voiceJoined: boolean;
  sfuTrack?: { sessionId: string; trackName: string };
  score: number;
  lastMoveTs: number;
  violationCount: number;
}

interface RoomState {
  id: string;
  worldId: string;
  isPrivate: boolean;
  clients: Map<string, RoomClient>;
  chatHistory: ChatMessage[];
}

const rooms = new Map<string, RoomState>();
const onlineUsers = new Map<string, { ws: WebSocket; user: UserProfile; roomId: string; worldId: string }>();

function getOrCreateRoom(roomId: string, worldId: string, isPrivate = false): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      worldId,
      isPrivate,
      clients: new Map(),
      chatHistory: [],
    };
    rooms.set(roomId, room);
  }
  return room;
}

export function getActiveRoomCount(worldId?: string): number {
  let total = 0;
  for (const r of rooms.values()) {
    if (!worldId || r.worldId === worldId) {
      total += r.clients.size;
    }
  }
  return total;
}

export function getOnlineUserIds(): Set<string> {
  return new Set(onlineUsers.keys());
}

export function getOnlineUserWorld(userId: string): string | undefined {
  return onlineUsers.get(userId)?.worldId;
}

export function findMatchmakingRoom(worldId: string, elo: number): string {
  const bracket = Math.floor(elo / 400);
  // Look for an open public room in this world & compatible skill bracket
  for (const room of rooms.values()) {
    if (!room.isPrivate && room.worldId === worldId && room.clients.size < 20) {
      if (room.id.includes(`_b${bracket}_`) || room.clients.size === 0) {
        return room.id;
      }
    }
  }
  return `pub_${worldId}_b${bracket}_${Date.now().toString(36).slice(-4)}`;
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: RoomState, payload: unknown, excludeUserId?: string) {
  const msg = JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (excludeUserId && client.user.id === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token') || undefined;
    const uid = verifyToken(token);
    const user = uid ? getUserById(uid) : null;

    if (!user) {
      sendJson(ws, { type: 'error', message: 'Unauthorized WebSocket session' });
      ws.close();
      return;
    }

    let currentClient: RoomClient | null = null;

    onlineUsers.set(user.id, { ws, user, roomId: '', worldId: '' });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:join') {
        const worldId = String(msg.worldId || 'world_sky_obby');
        const requestedRoom = msg.roomId ? String(msg.roomId) : '';
        const isPrivate = Boolean(msg.isPrivate);
        const roomId = requestedRoom || findMatchmakingRoom(worldId, user.elo);

        // Leave previous room if any
        if (currentClient) {
          const prev = rooms.get(currentClient.roomId);
          if (prev) {
            if (currentClient.voiceJoined) {
              broadcastRoom(prev, { type: 'voice:peer_left', userId: user.id }, user.id);
            }
            prev.clients.delete(user.id);
            broadcastRoom(prev, { type: 'player:leave', userId: user.id });
            if (prev.clients.size === 0) rooms.delete(prev.id);
          }
        }

        const room = getOrCreateRoom(roomId, worldId, isPrivate);
        currentClient = {
          ws,
          user,
          roomId,
          worldId,
          position: [0, 3, 0],
          yaw: 0,
          anim: 'idle',
          speaking: false,
          voiceJoined: false,
          score: 0,
          lastMoveTs: Date.now(),
          violationCount: 0,
        };
        room.clients.set(user.id, currentClient);
        onlineUsers.set(user.id, { ws, user, roomId, worldId });

        const players = Array.from(room.clients.values())
          .filter((c) => c.user.id !== user.id)
          .map((c) => ({
            id: c.user.id,
            username: c.user.username,
            displayName: c.user.displayName,
            avatarConfig: c.user.avatarConfig,
            position: c.position,
            yaw: c.yaw,
            anim: c.anim,
            speaking: c.speaking,
            score: c.score,
            elo: c.user.elo,
          }));

        const voicePeers = Array.from(room.clients.values())
          .filter((c) => c.user.id !== user.id && c.voiceJoined)
          .map((c) => c.user.id);

        const voiceSfuPeers = Array.from(room.clients.values())
          .filter((c) => c.user.id !== user.id && c.sfuTrack)
          .map((c) => ({
            userId: c.user.id,
            displayName: c.user.displayName,
            sessionId: c.sfuTrack!.sessionId,
            trackName: c.sfuTrack!.trackName,
          }));

        sendJson(ws, {
          type: 'room:state',
          roomId,
          worldId,
          players,
          voicePeers,
          voiceSfuPeers,
          chatHistory: room.chatHistory.slice(-40),
        });

        broadcastRoom(
          room,
          {
            type: 'player:join',
            player: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarConfig: user.avatarConfig,
              position: currentClient.position,
              yaw: currentClient.yaw,
              anim: currentClient.anim,
              speaking: false,
              score: 0,
              elo: user.elo,
            },
          },
          user.id
        );
      } else if (type === 'player:move' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;

        const pos = Array.isArray(msg.position) ? (msg.position as number[]) : [0, 3, 0];
        const nx = Number(pos[0]) || 0;
        const ny = Number(pos[1]) || 0;
        const nz = Number(pos[2]) || 0;
        const yaw = Number(msg.yaw) || 0;
        const anim = (['idle', 'walk', 'run', 'jump', 'dance'].includes(String(msg.anim))
          ? msg.anim
          : 'idle') as RoomClient['anim'];
        const isRespawn = Boolean(msg.respawn);

        const now = Date.now();
        const dt = Math.max(0.05, (now - currentClient.lastMoveTs) / 1000);
        const dx = nx - currentClient.position[0];
        const dz = nz - currentClient.position[2];
        const horizDist = Math.hypot(dx, dz);
        const speed = horizDist / dt;

        // Server-Authoritative Anti-Cheat speed/teleport check
        if (!isRespawn && horizDist > 26 && speed > 42) {
          currentClient.violationCount += 1;
          db.prepare(`
            INSERT INTO anticheat_logs (id, user_id, username, world_id, violation_type, details, severity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `ac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            user.id,
            user.username,
            currentClient.worldId,
            'SPEED_TELEPORT_ANOMALY',
            `Horizontal speed ${speed.toFixed(1)} studs/s (limit 42)`,
            currentClient.violationCount > 2 ? 'high' : 'medium',
            new Date().toISOString()
          );

          sendJson(ws, {
            type: 'anticheat:snap',
            position: currentClient.position,
            reason: 'Speed/teleport anomaly blocked by server anti-cheat',
          });
          return;
        }

        currentClient.position = [nx, ny, nz];
        currentClient.yaw = yaw;
        currentClient.anim = anim;
        currentClient.lastMoveTs = now;
        if (typeof msg.score === 'number') {
          currentClient.score = msg.score;
        }

        broadcastRoom(
          room,
          {
            type: 'player:update',
            userId: user.id,
            position: currentClient.position,
            yaw,
            anim,
            score: currentClient.score,
          },
          user.id
        );
      } else if (type === 'chat:send' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;

        // Check mute status from DB
        const dbRow = db.prepare('SELECT is_muted FROM users WHERE id = ?').get(user.id) as { is_muted: number } | undefined;
        if (dbRow?.is_muted) {
          sendJson(ws, {
            type: 'chat:message',
            message: {
              id: `sys_${Date.now()}`,
              userId: 'system',
              username: 'Moderation',
              displayName: 'Safety System',
              text: 'Your account is currently muted by community moderation.',
              filtered: true,
              system: true,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const rawText = String(msg.text || '');
        if (!rawText.trim()) return;
        const mod = filterChatMessage(rawText);

        const emitChat = (cleanedText: string, isFlagged: boolean, severity: 'none' | 'mild' | 'severe') => {
          if (severity === 'severe') {
            db.prepare(`
              INSERT INTO reports (id, reporter_id, reporter_name, target_user_id, target_username, reason, chat_excerpt, world_id, status, action_taken, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              `rep_auto_${Date.now()}`,
              'system_automod',
              'Aniblox Safety AI',
              user.id,
              user.username,
              'Automated severe toxicity detection',
              rawText.slice(0, 120),
              currentClient!.worldId,
              'open',
              '',
              new Date().toISOString()
            );
          }

          const chatMsg: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            text: cleanedText,
            filtered: isFlagged,
            timestamp: new Date().toISOString(),
          };

          room.chatHistory.push(chatMsg);
          if (room.chatHistory.length > 80) room.chatHistory.shift();
          broadcastRoom(room, { type: 'chat:message', message: chatMsg });
        };

        if (!mod.flagged && process.env.CLOUDFLARE_API_TOKEN) {
          checkMessageWithWorkersAi(rawText)
            .then((aiRes) => {
              if (aiRes?.unsafe) {
                emitChat('[Filtered by Cloudflare AI Safety]', true, 'severe');
              } else {
                emitChat(mod.cleaned, mod.flagged, mod.severity);
              }
            })
            .catch(() => emitChat(mod.cleaned, mod.flagged, mod.severity));
          return;
        }

        emitChat(mod.cleaned, mod.flagged, mod.severity);
      } else if (type === 'studio:sync' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        const blocks = msg.blocks as BlockPart[] | undefined;
        if (Array.isArray(blocks)) {
          broadcastRoom(room, { type: 'studio:blocks', blocks, editorName: user.displayName }, user.id);
        }
      } else if (type === 'avatar:update' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        currentClient.user.avatarConfig = msg.avatarConfig as AvatarConfig;
        broadcastRoom(
          room,
          { type: 'player:avatar', userId: user.id, avatarConfig: currentClient.user.avatarConfig },
          user.id
        );
      } else if (type === 'voice:speaking' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        currentClient.speaking = Boolean(msg.speaking);
        broadcastRoom(room, { type: 'voice:speaking', userId: user.id, speaking: currentClient.speaking }, user.id);
      } else if (type === 'voice:sfu_publish' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        const sessionId = String(msg.sessionId || '').slice(0, 128);
        const trackName = String(msg.trackName || '').slice(0, 128);
        if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) || !trackName) return;
        currentClient.voiceJoined = true;
        currentClient.sfuTrack = { sessionId, trackName };
        broadcastRoom(
          room,
          {
            type: 'voice:sfu_peer',
            userId: user.id,
            displayName: user.displayName,
            sessionId,
            trackName,
          },
          user.id
        );
      } else if (type === 'voice:sfu_unpublish' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        currentClient.sfuTrack = undefined;
        broadcastRoom(room, { type: 'voice:sfu_leave', userId: user.id }, user.id);
      } else if (type === 'voice:signal' && currentClient) {
        // Relay WebRTC offer / answer / ICE candidate to target peer in room
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        const targetId = String(msg.targetUserId || '');
        const target = room.clients.get(targetId);
        if (target) {
          sendJson(target.ws, {
            type: 'voice:signal',
            fromUserId: user.id,
            fromDisplayName: user.displayName,
            signal: msg.signal,
          });
        }
      } else if (type === 'voice:join' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        currentClient.voiceJoined = true;
        broadcastRoom(room, { type: 'voice:peer_joined', userId: user.id, displayName: user.displayName }, user.id);
      } else if (type === 'voice:leave' && currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (!room) return;
        currentClient.voiceJoined = false;
        currentClient.sfuTrack = undefined;
        currentClient.speaking = false;
        broadcastRoom(room, { type: 'voice:peer_left', userId: user.id }, user.id);
        broadcastRoom(room, { type: 'voice:sfu_leave', userId: user.id }, user.id);
      } else if (type === 'party:invite') {
        const targetId = String(msg.targetUserId || '');
        const worldId = String(msg.worldId || '');
        const worldTitle = String(msg.worldTitle || '');
        const roomId = String(msg.roomId || '');
        const targetOnline = onlineUsers.get(targetId);
        if (targetOnline) {
          sendJson(targetOnline.ws, {
            type: 'party:invite',
            fromUserId: user.id,
            fromDisplayName: user.displayName,
            worldId,
            worldTitle,
            roomId,
          });
        }
      }
    });

    ws.on('close', () => {
      onlineUsers.delete(user.id);
      if (currentClient) {
        const room = rooms.get(currentClient.roomId);
        if (room) {
          if (currentClient.voiceJoined) {
            broadcastRoom(room, { type: 'voice:peer_left', userId: user.id }, user.id);
          }
          room.clients.delete(user.id);
          broadcastRoom(room, { type: 'player:leave', userId: user.id });
          if (room.clients.size === 0) rooms.delete(room.id);
        }
      }
    });
  });

  return wss;
}
