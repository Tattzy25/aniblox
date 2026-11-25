import React, { useState } from 'react';
import { Award, Calendar, Check, Crown, Gift, Lock } from 'lucide-react';
import type { UserProfile } from '../types/aniblox';
import { BATTLE_PASS_REWARDS, DAILY_REWARDS } from '../data/presets';
import { apiFetch } from '../lib/api';

interface BattlePassViewProps {
  user: UserProfile;
  onUserUpdate: (u: UserProfile) => void;
  onRefreshMarketplace: () => void;
}

export const BattlePassView: React.FC<BattlePassViewProps> = ({
  user,
  onUserUpdate,
  onRefreshMarketplace,
}) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = Boolean(user.lastDailyClaim && user.lastDailyClaim.slice(0, 10) === today);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((p) => (p === msg ? null : p)), 3200);
  };

  const handleClaimDaily = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ reward: { anibux: number; xp: number; label: string }; user: UserProfile }>(
        '/api/rewards/daily',
        { method: 'POST' }
      );
      onUserUpdate(res.user);
      showNotice(`Claimed ${res.reward.label}: +${res.reward.anibux} Anibux & +${res.reward.xp} XP!`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to claim daily reward');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockPremium = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/battlepass/unlock-premium', {
        method: 'POST',
      });
      onUserUpdate(res.user);
      showNotice('Unlocked Season 1 Premium Battle Pass!');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to unlock pass');
    } finally {
      setBusy(false);
    }
  };

  const handleClaimTier = async (tier: number) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/battlepass/claim', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
      onUserUpdate(res.user);
      onRefreshMarketplace();
      showNotice(`Claimed Tier ${tier} rewards!`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to claim tier');
    } finally {
      setBusy(false);
    }
  };

  const maxPassXp = 2000;
  const pct = Math.min(100, Math.round((user.xp / maxPassXp) * 100));

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold text-emerald-300">
          {notice}
        </div>
      )}

      {/* Daily Login Streak Rewards */}
      <section className="rounded-xl surface-2027 border border-emerald-400/20 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              7-Day Daily Retention Rewards
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Current Streak: <span className="text-white font-bold tabular-nums">{user.dailyStreak} days</span> · Log in daily to earn Anibux and Battle Pass XP.
            </p>
          </div>
          <button
            onClick={handleClaimDaily}
            disabled={busy || claimedToday}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 disabled:opacity-50 text-black text-xs font-extrabold cursor-pointer"
          >
            <Gift className="w-4 h-4" />
            {claimedToday ? 'Claimed Today' : 'Claim Daily Reward'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {DAILY_REWARDS.map((d) => {
            const done = user.dailyStreak >= d.day;
            const isNext = (user.dailyStreak % 7) + 1 === d.day && !claimedToday;
            return (
              <div
                key={d.day}
                className={`rounded-lg border p-3 text-center ${
                  done
                    ? 'bg-gradient-to-b from-emerald-500/15 to-black border-emerald-500/40'
                    : isNext
                      ? 'bg-gradient-to-b from-cyan-500/15 to-black border-cyan-400/50'
                      : 'bg-black/80 border-white/10'
                }`}
              >
                <div className="text-[11px] font-bold text-zinc-400">{d.label}</div>
                <div className="text-base font-extrabold text-amber-400 mt-1 tabular-nums">+{d.anibux}</div>
                <div className="text-[11px] text-cyan-400 tabular-nums">+{d.xp} XP</div>
                {done && (
                  <div className="mt-1.5 text-[11px] text-emerald-400 font-semibold flex items-center justify-center gap-1">
                    <Check className="w-3 h-3" /> Claimed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Seasonal Battle Pass */}
      <section className="rounded-xl surface-2027-hero border border-amber-400/20 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold bg-gradient-to-r from-white via-amber-100 to-amber-300 bg-clip-text text-transparent flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              Season 1: Builders & Champions Battle Pass
            </h2>
            <p className="text-xs text-zinc-400 mt-1 tabular-nums">
              Level {user.level} · {user.xp.toLocaleString()} / {maxPassXp.toLocaleString()} XP ({pct}%)
            </p>
          </div>
          {!user.battlePassPremium ? (
            <button
              onClick={handleUnlockPremium}
              disabled={busy || user.anibux < 350}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 text-black text-xs font-extrabold cursor-pointer"
            >
              <Crown className="w-4 h-4" /> Unlock Premium Pass (350 Anibux)
            </button>
          ) : (
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Crown className="w-4 h-4" /> Premium Pass Active
            </span>
          )}
        </div>

        {/* XP Bar */}
        <div className="w-full h-2.5 rounded-full bg-black overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-amber-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {BATTLE_PASS_REWARDS.map((t) => {
            const unlocked = user.xp >= t.xpRequired;
            const claimed = user.claimedPassTiers.includes(t.tier);
            return (
              <div
                key={t.tier}
                className={`rounded-xl border p-4 space-y-3 ${
                  unlocked ? 'surface-2027 border-cyan-400/30' : 'bg-black/80 border-white/10 opacity-85'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-white">Tier {t.tier}</span>
                  <span className="text-xs text-zinc-400 tabular-nums">{t.xpRequired.toLocaleString()} XP</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-zinc-400">Free Track</span>
                    <span className="font-bold text-amber-400">{t.freeReward}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                    <span className="text-amber-200 flex items-center gap-1">
                      {!user.battlePassPremium && <Lock className="w-3 h-3" />} Premium
                    </span>
                    <span className="font-bold text-white">{t.premiumReward}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleClaimTier(t.tier)}
                  disabled={busy || !unlocked || claimed}
                  className={`w-full py-2 rounded-lg text-xs font-extrabold cursor-pointer ${
                    claimed
                      ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                      : unlocked
                        ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black'
                        : 'bg-white/5 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {claimed ? 'Claimed' : unlocked ? 'Claim Tier Reward' : `Locked (${t.xpRequired} XP)`}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
