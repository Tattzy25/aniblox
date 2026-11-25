import React, { useState } from 'react';
import { Coins, PlusCircle, ShoppingBag, TrendingUp } from 'lucide-react';
import type { MarketplaceCategory, MarketplaceItem, UserProfile } from '../types/aniblox';
import { apiFetch } from '../lib/api';

interface MarketplaceViewProps {
  items: MarketplaceItem[];
  user: UserProfile;
  onUserUpdate: (u: UserProfile) => void;
  onRefreshMarketplace: () => void;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  items,
  user,
  onUserUpdate,
  onRefreshMarketplace,
}) => {
  const [filter, setFilter] = useState<'all' | MarketplaceCategory>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState<MarketplaceCategory>('hat');
  const [newAssetKey, setNewAssetKey] = useState('crown');
  const [newPrice, setNewPrice] = useState(150);
  const [newColor, setNewColor] = useState('#38BDF8');
  const [newAccent, setNewAccent] = useState('#F59E0B');

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const myItems = items.filter((i) => i.creatorId === user.id || (user.role === 'moderator' && i.creatorId === 'creator_aniblox'));
  const totalSales = myItems.reduce((acc, i) => acc + i.sales, 0);
  const totalCreatorRevenue = myItems.reduce((acc, i) => acc + Math.floor(i.price * 0.7 * i.sales), 0);

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback((p) => (p === msg ? null : p)), 3200);
  };

  const handleBuy = async (item: MarketplaceItem) => {
    setBusyId(item.id);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/marketplace/buy', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id }),
      });
      onUserUpdate(res.user);
      onRefreshMarketplace();
      notify(`Purchased ${item.name}! Equip it in the Avatar tab.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setBusyId(null);
    }
  };

  const handlePublishUgc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/marketplace/publish', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          category: newCat,
          assetKey: newAssetKey,
          price: newPrice,
          color: newColor,
          accentColor: newAccent,
        }),
      });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      onRefreshMarketplace();
      notify('Published UGC item to Marketplace (70% creator revenue share active)!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to publish item');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Creator Revenue Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 rounded-xl surface-2027-hero border border-cyan-400/20 p-5 flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white via-cyan-100 to-emerald-300 bg-clip-text text-transparent tracking-tight">
              Aniblox Marketplace
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Acquire 3D avatar gear, wings, and crowns—or publish your own user-generated accessories with a 70% creator revenue split.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center gap-1 p-1 bg-black border border-white/10 rounded-lg">
              {(['all', 'hat', 'wings', 'gear', 'aura'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize cursor-pointer transition-all ${
                    filter === cat ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-xs font-extrabold cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Publish UGC Item
            </button>
          </div>
        </div>

        {/* Creator Revenue Dashboard */}
        <div className="lg:col-span-5 rounded-xl surface-2027 border border-amber-400/20 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">Creator Revenue Dashboard</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-3 my-4 tabular-nums">
            <div>
              <div className="text-xs text-zinc-400">Published</div>
              <div className="text-xl font-bold text-white">{myItems.length}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">Total Sales</div>
              <div className="text-xl font-bold text-white">{totalSales.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">70% Share</div>
              <div className="text-xl font-bold text-amber-400">{totalCreatorRevenue.toLocaleString()}</div>
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            Your Wallet: <span className="text-amber-400 font-bold tabular-nums">{user.anibux.toLocaleString()} Anibux</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold text-emerald-300">
          {feedback}
        </div>
      )}

      {/* UGC Creator Item Form */}
      {showCreate && (
        <form onSubmit={handlePublishUgc} className="rounded-xl surface-2027 border border-emerald-400/40 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">Create & Publish 3D Cosmetic</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1">Item Name</label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Obsidian Dragon Wings"
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Category</label>
              <select
                value={newCat}
                onChange={(e) => {
                  const c = e.target.value as MarketplaceCategory;
                  setNewCat(c);
                  setNewAssetKey(c === 'hat' ? 'crown' : c === 'wings' ? 'wings' : c === 'gear' ? 'blade' : 'halo');
                }}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
              >
                <option value="hat">Hat / Headgear</option>
                <option value="wings">Back / Wings</option>
                <option value="gear">Hand Gear</option>
                <option value="aura">Halo / Aura</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">3D Rig Mesh</label>
              <select
                value={newAssetKey}
                onChange={(e) => setNewAssetKey(e.target.value)}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
              >
                <option value="crown">Crown Geometry</option>
                <option value="visor">Cyber Visor</option>
                <option value="valkyrie">Valkyrie Helm</option>
                <option value="wings">Articulated Wings</option>
                <option value="jetpack">Thruster Jetpack</option>
                <option value="cape">Guardian Cape</option>
                <option value="blade">Plasma Blade</option>
                <option value="halo">Solar Halo</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Price (Anibux)</label>
              <input
                type="number"
                min={25}
                max={2500}
                value={newPrice}
                onChange={(e) => setNewPrice(Number(e.target.value) || 100)}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
            <div>
              <label className="block text-zinc-400 mb-1">Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Custom community-crafted 3D accessory"
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-white"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-zinc-400 mb-1">Primary Color</label>
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-full h-9 rounded bg-black border border-white/12" />
              </div>
              <div className="flex-1">
                <label className="block text-zinc-400 mb-1">Accent Color</label>
                <input type="color" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} className="w-full h-9 rounded bg-black border border-white/12" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-white/5 text-zinc-300 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold cursor-pointer"
              >
                Publish to Store
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-xl surface-2027 border border-white/12 hover:border-cyan-400/40 transition-all p-4 flex flex-col justify-between gap-4"
          >
            <div>
              <div
                className="h-28 rounded-lg mb-3 flex items-center justify-center border border-white/10 relative overflow-hidden"
                style={{
                  background: `radial-gradient(circle at 50% 45%, ${item.color}38, #040405 75%)`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl border-2 shadow-lg transform rotate-6"
                  style={{
                    backgroundColor: item.color,
                    borderColor: item.accentColor,
                  }}
                />
              </div>
              <h3 className="text-sm font-bold text-white truncate">{item.name}</h3>
              <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                <span>by {item.creatorName}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{item.category}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{item.sales.toLocaleString()} sold</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{item.description}</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-sm font-bold text-amber-400 tabular-nums">
                <Coins className="w-4 h-4" />
                {item.price === 0 ? 'Free' : item.price.toLocaleString()}
              </div>
              {item.owned ? (
                <span className="text-xs font-bold text-emerald-400">Owned</span>
              ) : (
                <button
                  onClick={() => handleBuy(item)}
                  disabled={busyId === item.id || user.anibux < item.price}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 disabled:opacity-45 text-black text-xs font-extrabold cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  {busyId === item.id ? 'Buying...' : 'Buy'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
