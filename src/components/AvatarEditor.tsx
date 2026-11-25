import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Check, Mic, Save, Sparkles } from 'lucide-react';
import type { AnimPack, AvatarConfig, FaceStyle, MarketplaceItem, UserProfile } from '../types/aniblox';
import { createStudioRenderer, schedulePacedLoop } from '../engine/worldRenderer';
import { animateAvatarRig, createAvatarRig, type AvatarRig } from '../engine/avatar3d';
import { apiFetch } from '../lib/api';

interface AvatarEditorProps {
  user: UserProfile;
  catalogItems: MarketplaceItem[];
  onUserUpdate: (u: UserProfile) => void;
}

const SKIN_PRESETS = ['#F5CD30', '#FDE68A', '#D97706', '#92400E', '#CBD5E1', '#F87171'];
const CLOTH_PRESETS = ['#0D69AC', '#10B981', '#EF4444', '#06B6D4', '#EA580C', '#09090B', '#EC4899'];

export const AvatarEditor: React.FC<AvatarEditorProps> = ({
  user,
  catalogItems,
  onUserUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<AvatarConfig>(user.avatarConfig);
  const [previewAnim, setPreviewAnim] = useState<'idle' | 'walk' | 'run' | 'jump' | 'dance'>('idle');
  const [testLipSync, setTestLipSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const rigRef = useRef<AvatarRig | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const previewAnimRef = useRef(previewAnim);
  previewAnimRef.current = previewAnim;
  const lipSyncRef = useRef(testLipSync);
  lipSyncRef.current = testLipSync;
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl } = createStudioRenderer(container);
    scene.background = new THREE.Color('#050506');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 600) / (container.clientHeight || 500),
      0.1,
      100
    );
    camera.position.set(3.4, 2.8, 5.2);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1.8, 0);
    orbit.enableDamping = !isSoftwareGl;
    orbit.minDistance = 3;
    orbit.maxDistance = 10;

    // Studio turntable pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.25, 32),
      new THREE.MeshStandardMaterial({ color: '#111114', metalness: 0.65, roughness: 0.28 })
    );
    pedestal.position.y = -0.125;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.04, 8, 48),
      new THREE.MeshStandardMaterial({ color: '#10B981', emissive: '#22D3EE', emissiveIntensity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    const rig = createAvatarRig(configRef.current, catalogItems);
    scene.add(rig.root);
    rigRef.current = rig;

    const timer = new THREE.Timer();
    const onResize = () => {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const stop = schedulePacedLoop(renderer, isSoftwareGl, () => {
      timer.update();
      const dt = Math.min(0.05, timer.getDelta());
      if (!isSoftwareGl) orbit.update();
      if (rigRef.current) {
        animateAvatarRig(
          rigRef.current,
          dt,
          previewAnimRef.current,
          configRef.current.animPack,
          timer.getElapsed(),
          lipSyncRef.current,
          configRef.current.faceStyle
        );
      }
      renderer.render(scene, camera);
    });

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      rigRef.current?.dispose();
      orbit.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild rig whenever avatar colors, accessories, or scale change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (rigRef.current) {
      scene.remove(rigRef.current.root);
      rigRef.current.dispose();
    }
    const nextRig = createAvatarRig(config, catalogItems);
    scene.add(nextRig.root);
    rigRef.current = nextRig;
  }, [config, catalogItems]);

  const ownedItems = catalogItems.filter((i) => i.owned);

  const toggleAccessory = (itemId: string) => {
    setConfig((prev) => {
      const has = prev.accessories.includes(itemId);
      return {
        ...prev,
        accessories: has ? prev.accessories.filter((a) => a !== itemId) : [...prev.accessories, itemId],
      };
    });
  };

  const handleSaveAvatar = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarConfig: config }),
      });
      onUserUpdate(res.user);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* 3D Turntable Viewport */}
      <div className="lg:col-span-5 rounded-xl surface-2027-hero border border-cyan-400/20 overflow-hidden flex flex-col min-h-[480px]">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
              3D Avatar Rig Studio
            </h2>
            <p className="text-xs text-zinc-400">Drag to orbit · Test expressions & lip-sync</p>
          </div>
          <button
            onClick={() => setTestLipSync((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              testLipSync ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-bold' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> {testLipSync ? 'Lip-Sync On' : 'Test Lip-Sync'}
          </button>
        </div>

        <div ref={mountRef} className="flex-1 min-h-[360px] w-full" />

        <div className="p-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 bg-black/80">
          <div className="flex items-center gap-1">
            {(['idle', 'walk', 'run', 'jump', 'dance'] as const).map((anim) => (
              <button
                key={anim}
                onClick={() => setPreviewAnim(anim)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize cursor-pointer ${
                  previewAnim === anim ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {anim}
              </button>
            ))}
          </div>
          <button
            onClick={handleSaveAvatar}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-xs font-extrabold cursor-pointer"
          >
            {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {savedNotice ? 'Saved' : saving ? 'Saving...' : 'Save Look'}
          </button>
        </div>
      </div>

      {/* Rig, Colors, Animations & Accessories Controls */}
      <div className="lg:col-span-7 space-y-5">
        <div className="rounded-xl surface-2027 border border-white/12 p-5 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white mb-2.5">Skin & Body Part Colors</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-zinc-400 mb-1.5">Head & Skin</div>
                <div className="flex flex-wrap gap-1.5">
                  {SKIN_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfig((p) => ({ ...p, skinColor: c, leftArmColor: c, rightArmColor: c }))}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                        config.skinColor === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1.5">Torso Outfit</div>
                <div className="flex flex-wrap gap-1.5">
                  {CLOTH_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfig((p) => ({ ...p, torsoColor: c }))}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                        config.torsoColor === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1.5">Legs</div>
                <div className="flex flex-wrap gap-1.5">
                  {['#4B974B', '#09090B', '#0D69AC', '#06B6D4', '#52525B'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfig((p) => ({ ...p, leftLegColor: c, rightLegColor: c }))}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                        config.leftLegColor === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/10">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Face Expression</label>
              <select
                value={config.faceStyle}
                onChange={(e) => setConfig((p) => ({ ...p, faceStyle: e.target.value as FaceStyle }))}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-xs text-white"
              >
                <option value="happy">Classic Happy</option>
                <option value="cool">Cool Shades</option>
                <option value="hyper">Hyper Sparkle</option>
                <option value="ninja">Stealth Ninja</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Animation Pack</label>
              <select
                value={config.animPack}
                onChange={(e) => setConfig((p) => ({ ...p, animPack: e.target.value as AnimPack }))}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-xs text-white"
              >
                <option value="classic">Classic Blox</option>
                <option value="ninja">Ninja Run</option>
                <option value="hero">Heroic Stride</option>
                <option value="levitate">Levitate Hover</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">
                Rig Scale ({config.scale.toFixed(2)}x)
              </label>
              <input
                type="range"
                min="0.8"
                max="1.25"
                step="0.05"
                value={config.scale}
                onChange={(e) => setConfig((p) => ({ ...p, scale: Number(e.target.value) }))}
                className="w-full accent-emerald-400 mt-2"
              />
            </div>
          </div>
        </div>

        {/* Owned 3D Accessories */}
        <div className="rounded-xl surface-2027 border border-white/12 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Equipped & Owned 3D Accessories ({ownedItems.length})
            </h3>
            <span className="text-xs text-zinc-400">Unlock more in Marketplace or Battle Pass</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ownedItems.map((item) => {
              const equipped = config.accessories.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleAccessory(item.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    equipped
                      ? 'bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border-emerald-400/50 text-white'
                      : 'bg-black/80 border-white/10 text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded shrink-0 border border-white/20"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.name}</div>
                      <div className="text-[11px] text-zinc-400 capitalize">{item.category}</div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ml-2 ${equipped ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {equipped ? 'Equipped' : 'Equip'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
