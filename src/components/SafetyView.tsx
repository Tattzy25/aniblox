import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Shield, ShieldAlert } from 'lucide-react';
import type { AntiCheatLog, ReportTicket, UserProfile } from '../types/aniblox';
import { apiFetch } from '../lib/api';

interface SafetyViewProps {
  user: UserProfile;
}

export const SafetyView: React.FC<SafetyViewProps> = ({ user }) => {
  const [reports, setReports] = useState<ReportTicket[]>([]);
  const [anticheatLogs, setAnticheatLogs] = useState<AntiCheatLog[]>([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [reason, setReason] = useState('Toxic / abusive behavior');
  const [excerpt, setExcerpt] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadModeration = async () => {
    try {
      const data = await apiFetch<{ reports: ReportTicket[]; anticheatLogs: AntiCheatLog[] }>(
        '/api/moderation/overview'
      );
      setReports(data.reports);
      setAnticheatLogs(data.anticheatLogs);
    } catch {
      // Offline mode
    }
  };

  useEffect(() => {
    loadModeration();
  }, []);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;
    await apiFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'manual_lookup',
        targetUsername,
        reason,
        chatExcerpt: excerpt,
      }),
    });
    setTargetUsername('');
    setExcerpt('');
    setNotice('Report logged for Community Safety review.');
    loadModeration();
  };

  const handleResolve = async (id: string, action: 'mute' | 'warn' | 'dismiss') => {
    await apiFetch(`/api/moderation/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    loadModeration();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl surface-2027-hero border border-emerald-400/20 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white via-emerald-100 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-emerald-400" />
            Community Safety, Moderation & Anti-Cheat
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time profanity filtering, player reporting queue, and server-authoritative speed/teleport integrity logs.
          </p>
        </div>
        <div className="text-xs text-zinc-400 tabular-nums">
          Signed in as <span className="text-white font-semibold">{user.displayName}</span>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Submit Report Form */}
        <form onSubmit={handleSubmitReport} className="lg:col-span-4 rounded-xl surface-2027 border border-rose-500/20 p-5 space-y-3.5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Report Player or Exploit
          </h3>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Player Username</label>
            <input
              required
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder="Username to report"
              className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-xs text-white"
            >
              <option>Toxic / abusive behavior</option>
              <option>Speed / teleport exploit</option>
              <option>Scam or phishing attempt</option>
              <option>Inappropriate world content</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Evidence / Chat Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              placeholder="Optional quote or context..."
              className="w-full rounded-lg bg-black border border-white/12 p-2.5 text-xs text-white resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-xs font-extrabold text-white cursor-pointer"
          >
            Submit Safety Report
          </button>
        </form>

        {/* Moderation Queue */}
        <div className="lg:col-span-4 rounded-xl surface-2027 border border-white/12 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Moderation Queue ({reports.length})</h3>
          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {reports.length === 0 && (
              <div className="text-xs text-zinc-500 py-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                No open community reports.
              </div>
            )}
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg bg-black/80 border border-white/10 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{r.targetUsername}</span>
                  <span className={r.status === 'open' ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                    {r.status === 'open' ? 'Open' : r.actionTaken || r.status}
                  </span>
                </div>
                <div className="text-zinc-300">{r.reason}</div>
                {r.chatExcerpt && (
                  <div className="text-zinc-400 bg-black/50 p-2 rounded border border-white/5 italic">
                    "{r.chatExcerpt}"
                  </div>
                )}
                {r.status === 'open' && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => handleResolve(r.id, 'mute')}
                      className="px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 font-semibold cursor-pointer"
                    >
                      Mute
                    </button>
                    <button
                      onClick={() => handleResolve(r.id, 'warn')}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-semibold cursor-pointer"
                    >
                      Warn
                    </button>
                    <button
                      onClick={() => handleResolve(r.id, 'dismiss')}
                      className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 font-semibold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Anti-Cheat Integrity Audit */}
        <div className="lg:col-span-4 rounded-xl surface-2027 border border-amber-400/20 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Server Anti-Cheat Audit ({anticheatLogs.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {anticheatLogs.length === 0 && (
              <div className="text-xs text-zinc-500 py-8 text-center">
                No speed or teleport anomalies detected. Server movement physics verified.
              </div>
            )}
            {anticheatLogs.map((a) => (
              <div key={a.id} className="rounded-lg bg-black/80 border border-white/10 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{a.username}</span>
                  <span className="font-mono text-[11px] text-amber-400">{a.violationType}</span>
                </div>
                <div className="text-zinc-400">{a.details}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
