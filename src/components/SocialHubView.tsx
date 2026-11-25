import React, { useEffect, useState } from 'react';
import {
  Check,
  Heart,
  Lock,
  Play,
  Plus,
  Send,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  FeedPost,
  FriendEntry,
  PrivateServerInfo,
  UserProfile,
  WorldData,
} from '../types/aniblox';
import { apiFetch } from '../lib/api';

interface SocialHubViewProps {
  user: UserProfile;
  worlds: WorldData[];
  onJoinWorld: (world: WorldData, roomId?: string, isPrivate?: boolean) => void;
  onUserUpdate: (u: UserProfile) => void;
}

interface LeaderboardRow {
  id: string;
  username: string;
  displayName: string;
  elo: number;
  level: number;
  xp: number;
  wins: number;
  blocksPlaced: number;
}

export const SocialHubView: React.FC<SocialHubViewProps> = ({
  user,
  worlds,
  onJoinWorld,
  onUserUpdate,
}) => {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [suggested, setSuggested] = useState<Array<{ id: string; username: string; displayName: string; elo: number; level: number }>>([]);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [privateServers, setPrivateServers] = useState<PrivateServerInfo[]>([]);
  const [postText, setPostText] = useState('');
  const [postWorldId, setPostWorldId] = useState(worlds[0]?.id || 'world_sky_obby');
  const [serverName, setServerName] = useState(`${user.displayName}'s VIP Room`);
  const [serverWorldId, setServerWorldId] = useState(worlds[0]?.id || 'world_sky_obby');
  const [joinCode, setJoinCode] = useState('');
  const [bioDraft, setBioDraft] = useState(user.bio);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const notify = (m: string) => {
    setStatusMsg(m);
    setTimeout(() => setStatusMsg((p) => (p === m ? null : p)), 3000);
  };

  const loadAll = async () => {
    try {
      const [soc, ps] = await Promise.all([
        apiFetch<{
          friends: FriendEntry[];
          suggestedPlayers: Array<{ id: string; username: string; displayName: string; elo: number; level: number }>;
          feed: FeedPost[];
          leaderboard: LeaderboardRow[];
        }>('/api/social/overview'),
        apiFetch<{ servers: PrivateServerInfo[] }>('/api/private-servers'),
      ]);
      setFriends(soc.friends);
      setSuggested(soc.suggestedPlayers);
      setFeed(soc.feed);
      setLeaderboard(soc.leaderboard);
      setPrivateServers(ps.servers);
    } catch {
      // Offline mode fallback
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddFriend = async (targetUserId: string) => {
    await apiFetch('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    notify('Friend request sent!');
    loadAll();
  };

  const handleAcceptFriend = async (targetUserId: string) => {
    await apiFetch('/api/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    notify('Friend added!');
    loadAll();
  };

  const handlePostFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim()) return;
    const w = worlds.find((x) => x.id === postWorldId) || worlds[0];
    await apiFetch('/api/feed', {
      method: 'POST',
      body: JSON.stringify({
        worldId: w.id,
        worldTitle: w.title,
        content: postText,
        statHighlight: `Level ${user.level} · ${user.elo} Elo`,
      }),
    });
    setPostText('');
    loadAll();
  };

  const handleCreatePrivateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ code: string; worldId: string }>('/api/private-servers', {
      method: 'POST',
      body: JSON.stringify({ name: serverName, worldId: serverWorldId, maxPlayers: 12 }),
    });
    notify(`Private Server Created! Invite Code: ${res.code}`);
    loadAll();
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ server: { code: string; worldId: string } }>(
        `/api/private-servers/join/${joinCode.trim().toUpperCase()}`
      );
      const w = worlds.find((x) => x.id === res.server.worldId) || worlds[0];
      onJoinWorld(w, `vip_${res.server.code}`, true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Code not found');
    }
  };

  const handleSaveBio = async () => {
    const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ bio: bioDraft }),
    });
    onUserUpdate(res.user);
    notify('Profile updated!');
  };

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div className="rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-400/40 px-4 py-2.5 text-xs font-semibold text-emerald-200">
          {statusMsg}
        </div>
      )}

      {/* Profile Stats & Private Server Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-6 rounded-xl surface-2027-hero border border-cyan-400/20 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold bg-gradient-to-r from-white via-cyan-100 to-emerald-300 bg-clip-text text-transparent">
                {user.displayName}
              </h2>
              <div className="text-xs text-zinc-400 mt-0.5">
                @{user.username} · {user.role === 'moderator' ? 'Moderator' : 'Creator & Player'}
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-lg font-extrabold text-emerald-400">{user.elo} Elo</div>
              <div className="text-xs text-zinc-400">Level {user.level}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 py-3 border-y border-white/10 tabular-nums">
            <div>
              <div className="text-[11px] text-zinc-400">Matches</div>
              <div className="text-base font-bold text-white">{user.matchesPlayed}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-400">Wins</div>
              <div className="text-base font-bold text-emerald-400">{user.wins}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-400">Blocks Built</div>
              <div className="text-base font-bold text-cyan-400">{user.blocksPlaced}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-400">XP</div>
              <div className="text-base font-bold text-amber-400">{user.xp.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              placeholder="Customize your player bio..."
              className="flex-1 rounded-lg bg-black border border-white/12 px-3 py-2 text-xs text-white"
            />
            <button
              onClick={handleSaveBio}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-xs font-extrabold text-black cursor-pointer"
            >
              Save Bio
            </button>
          </div>
        </div>

        {/* Private Servers */}
        <div className="lg:col-span-6 rounded-xl surface-2027 border border-white/12 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              Private Servers & Invite Codes
            </h3>
            <form onSubmit={handleJoinByCode} className="flex items-center gap-1.5">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter Code..."
                className="w-28 rounded-lg bg-black border border-white/12 px-2.5 py-1.5 text-xs text-white uppercase font-mono"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-xs font-extrabold text-black cursor-pointer"
              >
                Join
              </button>
            </form>
          </div>

          <form onSubmit={handleCreatePrivateServer} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="VIP Server Name"
              className="rounded-lg bg-black border border-white/12 px-2.5 py-2 text-white"
            />
            <select
              value={serverWorldId}
              onChange={(e) => setServerWorldId(e.target.value)}
              className="rounded-lg bg-black border border-white/12 px-2.5 py-2 text-white"
            >
              {worlds.map((w) => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-black font-extrabold py-2 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create Private Server
            </button>
          </form>

          <div className="max-h-28 overflow-y-auto space-y-1.5">
            {privateServers.map((ps) => {
              const targetWorld = worlds.find((w) => w.id === ps.worldId) || worlds[0];
              return (
                <div
                  key={ps.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/80 border border-white/10 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white">{ps.name}</span>
                    <span className="text-zinc-400 ml-2">
                      {ps.worldTitle} · Code <span className="font-mono text-cyan-400">{ps.code}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => onJoinWorld(targetWorld, `vip_${ps.code}`, true)}
                    className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold cursor-pointer shrink-0"
                  >
                    Enter
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main 3-Column Social Grid: Friends | Feed | Global Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Friends & Party */}
        <div className="lg:col-span-4 rounded-xl surface-2027 border border-white/12 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            Friends & Community ({friends.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-black/80 border border-white/10 text-xs">
                <div>
                  <div className="font-bold text-white">{f.displayName}</div>
                  <div className="text-zinc-400">
                    {f.online ? 'Online' : 'Offline'} · {f.elo} Elo
                  </div>
                </div>
                {f.status === 'pending_in' ? (
                  <button
                    onClick={() => handleAcceptFriend(f.id)}
                    className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-extrabold cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                ) : f.status === 'accepted' ? (
                  <button
                    onClick={() => onJoinWorld(worlds[0])}
                    className="px-2.5 py-1 rounded bg-white/10 border border-white/15 text-white font-semibold cursor-pointer flex items-center gap-1 hover:bg-white/15"
                  >
                    <Play className="w-3 h-3" /> Join Hub
                  </button>
                ) : (
                  <span className="text-zinc-500">Pending</span>
                )}
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-white/10">
            <div className="text-xs font-bold text-zinc-400 mb-2">Discover Builders</div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {suggested.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-black/80 border border-white/10 text-xs">
                  <div>
                    <span className="font-semibold text-white">{s.displayName}</span>
                    <span className="text-zinc-500 ml-2 tabular-nums">Lv.{s.level}</span>
                  </div>
                  <button
                    onClick={() => handleAddFriend(s.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-emerald-400 font-semibold cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3" /> Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Social Highlights Feed */}
        <div className="lg:col-span-4 rounded-xl surface-2027 border border-white/12 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">Highlights Social Feed</h3>
          <form onSubmit={handlePostFeed} className="space-y-2">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              rows={2}
              placeholder="Share a highlight, obby time, or new world..."
              className="w-full rounded-lg bg-black border border-white/12 p-2.5 text-xs text-white resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <select
                value={postWorldId}
                onChange={(e) => setPostWorldId(e.target.value)}
                className="flex-1 rounded-lg bg-black border border-white/12 px-2 py-1.5 text-xs text-zinc-300"
              >
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </select>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-xs font-extrabold cursor-pointer"
              >
                <Send className="w-3 h-3" /> Share
              </button>
            </div>
          </form>

          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {feed.map((post) => (
              <div key={post.id} className="rounded-lg bg-black/80 border border-white/10 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{post.displayName}</span>
                  <span className="text-zinc-500">{post.worldTitle}</span>
                </div>
                <p className="text-zinc-300 leading-relaxed">{post.content}</p>
                <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
                  <span>{post.statHighlight}</span>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/feed/${post.id}/like`, { method: 'POST' });
                      loadAll();
                    }}
                    className="flex items-center gap-1 text-rose-400 hover:text-rose-300 cursor-pointer tabular-nums"
                  >
                    <Heart className="w-3 h-3" /> {post.likes}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Competitive Leaderboards */}
        <div className="lg:col-span-4 rounded-xl surface-2027 border border-amber-400/20 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Global Competitive Leaderboards
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="py-2">#</th>
                  <th className="py-2">Player</th>
                  <th className="py-2 text-right">Elo</th>
                  <th className="py-2 text-right">Wins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 tabular-nums">
                {leaderboard.map((row, idx) => (
                  <tr key={row.id} className={row.id === user.id ? 'bg-emerald-500/10' : ''}>
                    <td className="py-2 font-bold text-zinc-400">{idx + 1}</td>
                    <td className="py-2 font-semibold text-white">
                      {row.displayName}
                      <span className="text-zinc-500 font-normal ml-1.5">Lv.{row.level}</span>
                    </td>
                    <td className="py-2 text-right font-bold text-emerald-400">{row.elo}</td>
                    <td className="py-2 text-right text-zinc-300">{row.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
