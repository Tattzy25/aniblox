import React, { useEffect, useState } from 'react';
import {
  Award,
  Blocks,
  Compass,
  Coins,
  Hammer,
  Heart,
  LogIn,
  LogOut,
  Play,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  User,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { MarketplaceItem, UserProfile, WorldData, WorldGenre } from './types/aniblox';
import { DEFAULT_AVATAR, STARTER_MARKETPLACE, STARTER_WORLDS } from './data/presets';
import { apiFetch, flushOfflineSyncQueue, setAuthToken } from './lib/api';
import { PlayViewport } from './components/PlayViewport';
import { StudioEditor } from './components/StudioEditor';
import { AvatarEditor } from './components/AvatarEditor';
import { MarketplaceView } from './components/MarketplaceView';
import { BattlePassView } from './components/BattlePassView';
import { SocialHubView } from './components/SocialHubView';
import { SafetyView } from './components/SafetyView';
import { VoiceStateProvider, useVoiceState } from './context/VoiceStateContext';

type TabKey = 'discover' | 'studio' | 'avatar' | 'marketplace' | 'battlepass' | 'social' | 'safety';

const GUEST_FALLBACK_USER: UserProfile = {
  id: 'offline_guest',
  username: 'OfflineBloxer',
  displayName: 'Offline Bloxer',
  bio: 'Playing Aniblox in offline mode.',
  avatarConfig: DEFAULT_AVATAR,
  anibux: 600,
  xp: 0,
  level: 1,
  elo: 1000,
  battlePassTier: 1,
  battlePassPremium: false,
  claimedPassTiers: [],
  dailyStreak: 0,
  lastDailyClaim: null,
  role: 'player',
  tutorialStep: 0,
  matchesPlayed: 0,
  wins: 0,
  blocksPlaced: 0,
  isGuest: true,
};

function AppContent() {
  const { leaveChannel } = useVoiceState();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [worlds, setWorlds] = useState<WorldData[]>(STARTER_WORLDS);
  const [catalog, setCatalog] = useState<MarketplaceItem[]>(STARTER_MARKETPLACE);
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [genreFilter, setGenreFilter] = useState<'all' | WorldGenre>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [offlineMode, setOfflineMode] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Active full-screen Play or Studio session
  const [playingSession, setPlayingSession] = useState<{
    world: WorldData;
    roomId?: string;
    isPrivate?: boolean;
  } | null>(null);
  const [studioWorld, setStudioWorld] = useState<WorldData | null>(null);

  // Auth modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplay, setAuthDisplay] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const loadWorlds = async () => {
    try {
      const res = await apiFetch<{ worlds: WorldData[] }>('/api/worlds');
      if (res.worlds?.length) setWorlds(res.worlds);
    } catch {
      // Keep starter worlds in offline mode
    }
  };

  const loadMarketplace = async () => {
    try {
      const res = await apiFetch<{ items: MarketplaceItem[] }>('/api/marketplace');
      if (res.items?.length) setCatalog(res.items);
    } catch {
      // Keep starter items
    }
  };

  // Bootstrap session & cloud data
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const me = await apiFetch<{ user: UserProfile | null; token?: string }>('/api/auth/me');
        if (me.user && active) {
          if (me.token) setAuthToken(me.token);
          setUser(me.user);
        } else {
          const guest = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/guest', {
            method: 'POST',
          });
          if (active) {
            setAuthToken(guest.token);
            setUser(guest.user);
          }
        }
        await Promise.all([loadWorlds(), loadMarketplace()]);
      } catch {
        if (active) {
          setOfflineMode(true);
          setUser(GUEST_FALLBACK_USER);
        }
      }
    }
    init();

    const onOnline = () => {
      setOfflineMode(false);
      flushOfflineSyncQueue().then((count) => {
        if (count > 0) {
          setMatchNotice(`Synced ${count} offline cloud save(s) to Aniblox.`);
        }
      });
    };
    const onOffline = () => setOfflineMode(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleToggleOffline = async () => {
    if (offlineMode) {
      setOfflineMode(false);
      const synced = await flushOfflineSyncQueue();
      if (synced > 0) {
        setMatchNotice(`Cloud sync complete: ${synced} pending save(s) uploaded.`);
      }
      await Promise.all([loadWorlds(), loadMarketplace()]);
    } else {
      setOfflineMode(true);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await apiFetch<{ user: UserProfile; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username: authUsername,
          password: authPassword,
          displayName: authDisplay || authUsername,
        }),
      });
      setAuthToken(res.token);
      setUser(res.user);
      setAuthModalOpen(false);
      setAuthPassword('');
      await Promise.all([loadWorlds(), loadMarketplace()]);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    const guest = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/guest', {
      method: 'POST',
    });
    setAuthToken(guest.token);
    setUser(guest.user);
  };

  const handleQuickMatchmake = async (world: WorldData) => {
    if (offlineMode) {
      setPlayingSession({ world });
      return;
    }
    try {
      const res = await apiFetch<{ roomId: string; bracket: string }>('/api/matchmake', {
        method: 'POST',
        body: JSON.stringify({ worldId: world.id }),
      });
      setMatchNotice(`Matched into ${res.bracket} server (${res.roomId})`);
      setTimeout(() => setMatchNotice(null), 3500);
      setPlayingSession({ world, roomId: res.roomId, isPrivate: false });
    } catch {
      setPlayingSession({ world });
    }
  };

  const activeUser = user || GUEST_FALLBACK_USER;

  // Full-screen Play Mode
  if (playingSession) {
    return (
      <PlayViewport
        world={playingSession.world}
        user={activeUser}
        catalogItems={catalog}
        roomId={playingSession.roomId}
        isPrivateRoom={playingSession.isPrivate}
        offlineMode={offlineMode}
        onExit={() => {
          leaveChannel();
          setPlayingSession(null);
          loadWorlds();
        }}
        onUserUpdate={(u) => setUser(u)}
        onOpenStudio={(w) => {
          leaveChannel();
          setPlayingSession(null);
          setStudioWorld(w);
        }}
      />
    );
  }

  // Full-screen Aniblox Studio Mode
  if (studioWorld) {
    return (
      <StudioEditor
        initialWorld={studioWorld}
        user={activeUser}
        onExit={() => {
          setStudioWorld(null);
          setActiveTab('discover');
        }}
        onPlayTest={(w) => {
          setStudioWorld(null);
          setPlayingSession({ world: w });
        }}
        onWorldPublished={(published, updatedUser) => {
          setWorlds((prev) => {
            const exists = prev.some((x) => x.id === published.id);
            return exists ? prev.map((x) => (x.id === published.id ? published : x)) : [published, ...prev];
          });
          if (updatedUser) setUser(updatedUser);
        }}
      />
    );
  }

  const filteredWorlds = worlds.filter((w) => {
    const matchesGenre = genreFilter === 'all' || w.genre === genreFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      w.title.toLowerCase().includes(q) ||
      w.creatorName.toLowerCase().includes(q) ||
      w.genre.toLowerCase().includes(q);
    return matchesGenre && matchesSearch;
  });

  const featuredWorld = worlds[0] || STARTER_WORLDS[0];

  const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'discover', label: 'Discover', icon: <Compass className="w-4 h-4" /> },
    { key: 'studio', label: 'Create Studio', icon: <Hammer className="w-4 h-4" /> },
    { key: 'avatar', label: 'Avatar', icon: <User className="w-4 h-4" /> },
    { key: 'marketplace', label: 'Marketplace', icon: <ShoppingBag className="w-4 h-4" /> },
    { key: 'battlepass', label: 'Battle Pass', icon: <Award className="w-4 h-4" /> },
    { key: 'social', label: 'Social & Ranks', icon: <Users className="w-4 h-4" /> },
    { key: 'safety', label: 'Safety', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-2027-canvas text-zinc-100 flex flex-col">
      {/* Clean 3-Zone 2027 Spatial Top Bar */}
      <header className="h-16 border-b border-white/10 bg-black/75 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => setActiveTab('discover')}
          className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-400 via-teal-300 to-cyan-400 flex items-center justify-center shadow-[0_0_16px_rgba(45,212,191,0.45)]">
            <Blocks className="w-4 h-4 text-black" />
          </span>
          <span className="font-display bg-gradient-to-r from-white via-cyan-100 to-emerald-300 bg-clip-text text-transparent">
            ANIBLOX
          </span>
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-zinc-400">
          <button
            onClick={() => setActiveTab('discover')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'discover' ? 'text-white underline underline-offset-8 decoration-cyan-400 decoration-2' : ''
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => setStudioWorld(featuredWorld)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Studio
          </button>
          <button
            onClick={() => setActiveTab('avatar')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'avatar' ? 'text-white underline underline-offset-8 decoration-cyan-400 decoration-2' : ''
            }`}
          >
            Avatar
          </button>
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'marketplace' ? 'text-white underline underline-offset-8 decoration-cyan-400 decoration-2' : ''
            }`}
          >
            Marketplace
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'social' ? 'text-white underline underline-offset-8 decoration-cyan-400 decoration-2' : ''
            }`}
          >
            Community
          </button>
        </nav>

        {/* Zone 3: Wallet & Primary Account Action */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-amber-400 tabular-nums whitespace-nowrap shrink-0">
            <Coins className="w-4 h-4" />
            {activeUser.anibux.toLocaleString()}
          </div>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-xs font-extrabold shadow-[0_0_20px_-4px_rgba(34,211,238,0.5)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {activeUser.isGuest ? 'Sign In / Save' : activeUser.displayName}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 2027 Obsidian Left Navigation Rail */}
        <aside className="hidden lg:flex w-56 border-r border-white/10 bg-black/65 backdrop-blur-xl flex-col justify-between p-3 shrink-0">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    if (item.key === 'studio') {
                      setStudioWorld(featuredWorld);
                    } else {
                      setActiveTab(item.key);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-400/20 via-cyan-400/12 to-transparent text-white border border-cyan-400/35 shadow-[0_0_20px_-8px_rgba(34,211,238,0.4)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={isActive ? 'text-cyan-300' : ''}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Account & Offline Sync Footer */}
          <div className="space-y-2 pt-3 border-t border-white/10">
            <button
              onClick={handleToggleOffline}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                offlineMode
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-300 border border-amber-500/30'
                  : 'bg-gradient-to-r from-emerald-500/12 to-cyan-500/5 border border-emerald-500/20 text-zinc-200 hover:border-emerald-400/40'
              }`}
            >
              <span className="flex items-center gap-2">
                {offlineMode ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
                {offlineMode ? 'Offline Mode' : 'Cloud Synced'}
              </span>
              <span className="text-[11px] text-emerald-300">{offlineMode ? 'Reconnect' : 'On'}</span>
            </button>

            <div className="px-3 py-2 rounded-lg surface-2027 border border-white/10 text-xs">
              <div className="font-bold text-white truncate">{activeUser.displayName}</div>
              <div className="text-cyan-300/90 tabular-nums mt-0.5 font-medium">
                Lv.{activeUser.level} · {activeUser.elo} Elo
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10">
          <div className="max-w-6xl mx-auto space-y-6">
            {matchNotice && (
              <div className="rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold text-emerald-300">
                {matchNotice}
              </div>
            )}

            {activeTab === 'discover' && (
              <div className="space-y-8">
                {/* Hero Featured World */}
                <section className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden surface-2027-hero border border-cyan-400/20 items-stretch">
                  <div className="lg:col-span-7 relative min-h-[240px] lg:min-h-[320px] bg-black">
                    {!brokenThumbs[featuredWorld.id] ? (
                      <img
                        src={featuredWorld.thumbnailUrl}
                        alt={featuredWorld.title}
                        referrerPolicy="no-referrer"
                        onError={() => setBrokenThumbs((p) => ({ ...p, [featuredWorld.id]: true }))}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-emerald-950/60 via-black to-cyan-950/60 flex items-center justify-center">
                        <Blocks className="w-12 h-12 text-cyan-300/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#050507]" />
                  </div>

                  <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-5">
                    <div>
                      <div className="text-xs font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
                        <span>Featured Experience</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{featuredWorld.genre}</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-zinc-100 to-cyan-200 bg-clip-text text-transparent mt-1.5 tracking-tight text-balance">
                        {featuredWorld.title}
                      </h1>
                      <p className="text-sm text-zinc-300 mt-2.5 leading-relaxed">
                        {featuredWorld.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-zinc-400 mt-4 tabular-nums">
                        <span>by {featuredWorld.creatorName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{featuredWorld.plays.toLocaleString()} Plays</span>
                        <span aria-hidden="true">·</span>
                        <span>{featuredWorld.likes.toLocaleString()} Likes</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => handleQuickMatchmake(featuredWorld)}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-sm font-extrabold shadow-[0_0_24px_-4px_rgba(34,211,238,0.55)] transition-all cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" /> Play Now
                      </button>
                      <button
                        onClick={() => setStudioWorld(featuredWorld)}
                        className="px-4 py-3 rounded-xl bg-gradient-to-r from-amber-400/15 to-orange-500/15 hover:from-amber-400/25 hover:to-orange-500/25 border border-amber-400/35 text-amber-200 text-sm font-bold transition-all cursor-pointer"
                      >
                        Open in Studio
                      </button>
                    </div>
                  </div>
                </section>

                {/* Filter, Search & Matchmaking Toolbar */}
                <section className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 p-1 surface-2027 border border-white/10 rounded-xl">
                    {(['all', 'obby', 'tycoon', 'simulator', 'arena', 'social', 'sandbox'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setGenreFilter(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer transition-all ${
                          genreFilter === g
                            ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold shadow-[0_0_16px_-4px_rgba(34,211,238,0.5)]'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search worlds or creators..."
                        className="w-full rounded-xl bg-black/80 border border-white/12 pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const arena = worlds.find((w) => w.genre === 'arena') || featuredWorld;
                        handleQuickMatchmake(arena);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-black text-xs font-extrabold shadow-[0_0_20px_-4px_rgba(251,146,60,0.5)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Swords className="w-4 h-4" /> Skill Matchmaking
                    </button>
                  </div>
                </section>

                {/* Experiences Grid */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                      Experiences & Community Worlds
                    </h2>
                    <button
                      onClick={() =>
                        setStudioWorld({
                          ...featuredWorld,
                          id: `world_new_${Date.now()}`,
                          title: 'My New Aniblox World',
                          creatorId: activeUser.id,
                          creatorName: activeUser.displayName,
                        })
                      }
                      className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent hover:opacity-85 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Create Blank / Template World
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredWorlds.map((w) => (
                      <div
                        key={w.id}
                        className="rounded-xl surface-2027 border border-white/12 hover:border-cyan-400/45 hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.3)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col justify-between group"
                      >
                        <div>
                          <div className="aspect-video bg-black relative overflow-hidden">
                            {!brokenThumbs[w.id] ? (
                              <img
                                src={w.thumbnailUrl}
                                alt={w.title}
                                referrerPolicy="no-referrer"
                                onError={() => setBrokenThumbs((p) => ({ ...p, [w.id]: true }))}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-emerald-950/60 via-black to-cyan-950/60 flex items-center justify-center">
                                <Blocks className="w-8 h-8 text-cyan-300/40" />
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
                          </div>
                          <div className="p-4">
                            <h3 className="text-base font-bold text-white truncate">{w.title}</h3>
                            <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5 tabular-nums">
                              <span>{w.creatorName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize text-cyan-300">{w.genre}</span>
                              <span aria-hidden="true">·</span>
                              <span>{w.plays.toLocaleString()} plays</span>
                              {!w.isPublished && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-400 font-semibold">Private</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{w.description}</p>
                          </div>
                        </div>

                        <div className="px-4 pb-4 flex items-center gap-2">
                          <button
                            onClick={() => handleQuickMatchmake(w)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-xs font-extrabold cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" /> Play
                          </button>
                          <button
                            onClick={() => setStudioWorld(w)}
                            className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-400/15 to-orange-500/15 hover:from-amber-400/25 hover:to-orange-500/25 border border-amber-400/25 text-amber-200 text-xs font-semibold cursor-pointer"
                          >
                            Studio
                          </button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/worlds/${w.id}/like`, { method: 'POST' }).catch(() => {});
                              setWorlds((prev) =>
                                prev.map((x) => (x.id === w.id ? { ...x, likes: x.likes + 1 } : x))
                              );
                            }}
                            className="px-2.5 py-2 rounded-lg bg-gradient-to-r from-rose-500/15 to-orange-500/10 hover:from-rose-500/25 hover:to-orange-500/20 border border-rose-500/25 text-rose-300 text-xs font-semibold cursor-pointer flex items-center gap-1 tabular-nums"
                          >
                            <Heart className="w-3.5 h-3.5" /> {w.likes}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'avatar' && (
              <AvatarEditor
                user={activeUser}
                catalogItems={catalog}
                onUserUpdate={(u) => setUser(u)}
              />
            )}

            {activeTab === 'marketplace' && (
              <MarketplaceView
                items={catalog}
                user={activeUser}
                onUserUpdate={(u) => setUser(u)}
                onRefreshMarketplace={loadMarketplace}
              />
            )}

            {activeTab === 'battlepass' && (
              <BattlePassView
                user={activeUser}
                onUserUpdate={(u) => setUser(u)}
                onRefreshMarketplace={loadMarketplace}
              />
            )}

            {activeTab === 'social' && (
              <SocialHubView
                user={activeUser}
                worlds={worlds}
                onJoinWorld={(w, roomId, isPrivate) =>
                  setPlayingSession({ world: w, roomId, isPrivate })
                }
                onUserUpdate={(u) => setUser(u)}
              />
            )}

            {activeTab === 'safety' && <SafetyView user={activeUser} />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around py-1.5 px-1">
        {navItems.slice(0, 5).map((item) => (
          <button
            key={item.key}
            onClick={() => {
              if (item.key === 'studio') setStudioWorld(featuredWorld);
              else setActiveTab(item.key);
            }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold ${
              activeTab === item.key ? 'text-emerald-400' : 'text-zinc-400'
            }`}
          >
            {item.icon}
            <span>{item.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {/* Account / Cloud Save Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl surface-2027-hero border border-cyan-400/25 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <LogIn className="w-5 h-5 text-cyan-400" />
                {activeUser.isGuest ? 'Save Progress Across Devices' : 'Aniblox Account'}
              </h2>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            {!activeUser.isGuest && (
              <div className="rounded-xl bg-black/80 border border-white/10 p-4 space-y-2 text-xs">
                <div className="text-white font-bold text-sm">{activeUser.displayName}</div>
                <div className="text-zinc-400">
                  @{activeUser.username} · Level {activeUser.level} · {activeUser.elo} Elo
                </div>
                <button
                  onClick={handleLogout}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            )}

            <div className="flex p-1 rounded-lg bg-black border border-white/10 text-xs font-bold">
              <button
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 rounded-md cursor-pointer ${
                  authMode === 'register' ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-extrabold' : 'text-zinc-400'
                }`}
              >
                Create Account
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 rounded-md cursor-pointer ${
                  authMode === 'login' ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-extrabold' : 'text-zinc-400'
                }`}
              >
                Sign In
              </button>
            </div>

            {authError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Username</label>
                <input
                  required
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="e.g. VoxelMaster"
                  className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
                />
              </div>
              {authMode === 'register' && (
                <div>
                  <label className="block text-zinc-400 mb-1">Display Name</label>
                  <input
                    value={authDisplay}
                    onChange={(e) => setAuthDisplay(e.target.value)}
                    placeholder="Voxel Master"
                    className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-zinc-400 mb-1">Password</label>
                <input
                  required
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold cursor-pointer"
              >
                {authMode === 'register' ? 'Register & Enable Cloud Sync' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <VoiceStateProvider>
      <AppContent />
    </VoiceStateProvider>
  );
}
