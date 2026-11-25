import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Flag,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Volume2,
  WifiOff,
  Gamepad2,
} from 'lucide-react';
import type {
  BlockPart,
  ChatMessage,
  MarketplaceItem,
  RemotePlayerState,
  UserProfile,
  WorldData,
  WorldSave,
} from '../types/aniblox';
import {
  buildBlockMesh,
  createNameplateSprite,
  createStudioRenderer,
  schedulePacedLoop,
} from '../engine/worldRenderer';
import { animateAvatarRig, createAvatarRig, type AvatarRig } from '../engine/avatar3d';
import { executeAnibloxLua } from '../engine/luaRuntime';
import { playSfx } from '../engine/proceduralTextures';
import {
  apiFetch,
  cacheOfflineSave,
  getAuthToken,
  getOfflineSave,
  queueOfflineSync,
} from '../lib/api';

interface PlayViewportProps {
  world: WorldData;
  user: UserProfile;
  catalogItems: MarketplaceItem[];
  roomId?: string;
  isPrivateRoom?: boolean;
  offlineMode: boolean;
  onExit: () => void;
  onUserUpdate: (u: UserProfile) => void;
  onOpenStudio: (world: WorldData) => void;
}

const TUTORIAL_STEPS = [
  'Move using WASD / Arrows (or Touch Pad)',
  'Press Space (or Jump) to leap onto platforms',
  'Collect a Coin or reach a Checkpoint',
  'Send a Chat message or toggle Voice Chat',
];

export const PlayViewport: React.FC<PlayViewportProps> = ({
  world,
  user,
  catalogItems,
  roomId: initialRoomId,
  isPrivateRoom = false,
  offlineMode,
  onExit,
  onUserUpdate,
  onOpenStudio,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [coins, setCoins] = useState(0);
  const [collectedCoinCount, setCollectedCoinCount] = useState(0);
  const totalCoinCount = world.blocks.filter((b) => b.role === 'coin').length;
  const [deaths, setDeaths] = useState(0);
  const [runElapsedSec, setRunElapsedSec] = useState(0);
  const [victorySummary, setVictorySummary] = useState<{
    timeSec: number;
    coinsCollected: number;
    totalCoins: number;
    deaths: number;
    perfect: boolean;
  } | null>(null);
  const [checkpoint, setCheckpoint] = useState(0);
  const [score, setScore] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState(initialRoomId || '');
  const [remotePlayersCount, setRemotePlayersCount] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [touchUi, setTouchUi] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 || 'ontouchstart' in window : false
  );
  const [tutorialStep, setTutorialStep] = useState(user.tutorialStep);
  const [reportTarget, setReportTarget] = useState<{ userId: string; username: string; excerpt: string } | null>(null);
  const [reportReason, setReportReason] = useState('Toxic / abusive chat');
  const [dancing, setDancing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const joyRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const jumpQueuedRef = useRef(false);
  const speakingRef = useRef(false);
  const dancingRef = useRef(false);
  const coinsRef = useRef(0);
  const collectedCountRef = useRef(0);
  const deathsRef = useRef(0);
  const runStartRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const checkpointRef = useRef(0);
  const scoreRef = useRef(0);
  const tutorialRef = useRef(user.tutorialStep);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceConfigRef = useRef<{ iceServers: RTCIceServer[]; turnEnabled: boolean; sfuEnabled: boolean }>({
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],
    turnEnabled: false,
    sfuEnabled: false,
  });
  const sfuRef = useRef<{
    pc: RTCPeerConnection;
    sessionId: string;
    localTrackName: string;
    midToUserId: Map<string, string>;
    subscribedPeers: Set<string>;
  } | null>(null);
  const sfuPeersRef = useRef<Map<string, { userId: string; displayName: string; sessionId: string; trackName: string }>>(new Map());
  const spatialAudioRef = useRef<{
    ctx: AudioContext | null;
    nodes: Map<string, { gain: GainNode; panner: StereoPannerNode; audioEl: HTMLAudioElement }>;
  }>({ ctx: null, nodes: new Map() });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 3200);
  };

  const detachSpatialRemoteAudio = (uid: string) => {
    const existing = spatialAudioRef.current.nodes.get(uid);
    if (existing) {
      try {
        existing.audioEl.pause();
        existing.audioEl.srcObject = null;
        existing.gain.disconnect();
        existing.panner.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      spatialAudioRef.current.nodes.delete(uid);
    }
  };

  const attachSpatialRemoteAudio = (uid: string, stream: MediaStream) => {
    detachSpatialRemoteAudio(uid);
    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.autoplay = true;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!spatialAudioRef.current.ctx) {
        spatialAudioRef.current.ctx = new AudioCtx();
      }
      const ctx = spatialAudioRef.current.ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Keep muted HTMLAudioElement playing so Chromium decodes WebRTC stream for AudioContext
      audioEl.muted = true;
      audioEl.play().catch(() => {});

      const src = ctx.createMediaStreamSource(stream);
      const panner = ctx.createStereoPanner();
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(panner);
      panner.connect(gain);
      gain.connect(ctx.destination);
      spatialAudioRef.current.nodes.set(uid, { gain, panner, audioEl });
    } catch {
      audioEl.muted = false;
      audioEl.play().catch(() => {});
    }
  };

  const subscribeSfuPeerTrack = async (peer: { userId: string; sessionId: string; trackName: string }) => {
    const sfu = sfuRef.current;
    if (!sfu || peer.userId === user.id || sfu.subscribedPeers.has(peer.userId)) return;
    sfu.subscribedPeers.add(peer.userId);
    try {
      const data = await apiFetch<{
        requiresImmediateRenegotiation?: boolean;
        sessionDescription?: RTCSessionDescriptionInit;
        tracks?: Array<{ mid?: string; trackName?: string }>;
      }>(`/api/voice/sfu/sessions/${encodeURIComponent(sfu.sessionId)}/tracks/new`, {
        method: 'POST',
        body: JSON.stringify({
          tracks: [{ location: 'remote', sessionId: peer.sessionId, trackName: peer.trackName }],
        }),
      });

      for (const tr of data.tracks || []) {
        if (tr.mid) {
          sfu.midToUserId.set(tr.mid, peer.userId);
        }
      }

      if (data.requiresImmediateRenegotiation && data.sessionDescription) {
        await sfu.pc.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
        const answer = await sfu.pc.createAnswer();
        await sfu.pc.setLocalDescription(answer);
        await apiFetch(`/api/voice/sfu/sessions/${encodeURIComponent(sfu.sessionId)}/renegotiate`, {
          method: 'PUT',
          body: JSON.stringify({ sessionDescription: { type: 'answer', sdp: answer.sdp } }),
        });
      }
    } catch {
      sfu.subscribedPeers.delete(peer.userId);
    }
  };

  const advanceTutorial = (stepIndex: number) => {
    if (tutorialRef.current <= stepIndex) {
      const next = stepIndex + 1;
      tutorialRef.current = next;
      setTutorialStep(next);
      if (!offlineMode) {
        apiFetch<{ user: UserProfile }>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify({ tutorialStep: next }),
        })
          .then((res) => onUserUpdate(res.user))
          .catch(() => {});
      }
    }
  };

  const persistProgress = async (
    nextCheckpoint: number,
    nextCoins: number,
    nextScore: number,
    awardAnibux = 0,
    awardXp = 0,
    wonMatch = false
  ) => {
    const saveObj: WorldSave = {
      userId: user.id,
      worldId: world.id,
      checkpoint: nextCheckpoint,
      coins: nextCoins,
      tycoonStage: 0,
      bestTimeMs: null,
      score: nextScore,
      updatedAt: new Date().toISOString(),
    };
    cacheOfflineSave(saveObj);

    const payload = {
      checkpoint: nextCheckpoint,
      coins: nextCoins,
      score: nextScore,
      awardAnibux,
      awardXp,
      wonMatch,
      incrementPlay: false,
    };

    if (offlineMode) {
      queueOfflineSync(world.id, payload);
      return;
    }

    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/saves/${world.id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.user) onUserUpdate(res.user);
    } catch {
      queueOfflineSync(world.id, payload);
    }
  };

  // Load initial cloud or offline save
  useEffect(() => {
    let active = true;
    async function loadSave() {
      const cached = getOfflineSave(world.id);
      if (cached && active) {
        setCoins(cached.coins);
        setCheckpoint(cached.checkpoint);
        setScore(cached.score);
        coinsRef.current = cached.coins;
        checkpointRef.current = cached.checkpoint;
        scoreRef.current = cached.score;
      }
      if (!offlineMode) {
        try {
          const data = await apiFetch<{ save: WorldSave }>(`/api/saves/${world.id}`);
          if (active && data.save) {
            const c = Math.max(cached?.coins || 0, data.save.coins);
            const cp = Math.max(cached?.checkpoint || 0, data.save.checkpoint);
            const sc = Math.max(cached?.score || 0, data.save.score);
            setCoins(c);
            setCheckpoint(cp);
            setScore(sc);
            coinsRef.current = c;
            checkpointRef.current = cp;
            scoreRef.current = sc;
          }
          await apiFetch(`/api/saves/${world.id}`, {
            method: 'POST',
            body: JSON.stringify({ incrementPlay: true }),
          });
        } catch {
          // Offline fallback already loaded
        }
      }
    }
    loadSave();
    return () => {
      active = false;
    };
  }, [world.id, offlineMode]);

  // Main Three.js + Physics + Multiplayer Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl, maxAniso } = createStudioRenderer(container);
    const sky = new THREE.Color(world.skyColor || '#38BDF8');
    scene.background = sky;
    scene.fog = new THREE.FogExp2(sky.getHex(), 0.0085);

    const camera = new THREE.PerspectiveCamera(
      65,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      400
    );

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Subtle ocean/ground abyss reference grid below world
    const grid = new THREE.GridHelper(160, 40, 0x3f3f46, 0x18181b);
    grid.position.y = -3.5;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    // Execute world Lua script to gather spawned parts & Touched hooks
    const runtimeBlocks: BlockPart[] = world.blocks.map((b) => ({ ...b }));
    const luaRes = executeAnibloxLua(world.scriptCode || '', {
      existingBlocks: runtimeBlocks,
      onGiveCoins: (amt) => {
        coinsRef.current += amt;
        setCoins(coinsRef.current);
        playSfx('coin');
      },
      onGiveXP: (amt) => {
        scoreRef.current += amt;
        setScore(scoreRef.current);
        persistProgress(checkpointRef.current, coinsRef.current, scoreRef.current, 0, amt);
      },
      onSetCheckpoint: (cp) => {
        checkpointRef.current = Math.max(checkpointRef.current, cp);
        setCheckpoint(checkpointRef.current);
      },
      onNotify: (m) => showToast(m),
    });

    for (const sp of luaRes.spawnedParts) {
      runtimeBlocks.push(sp);
    }

    const blockMeshes = new Map<string, THREE.Object3D>();
    const collectedIds = new Set<string>();
    const crumbleTimers = new Map<string, { triggeredAt: number; state: 'shaking' | 'fallen' }>();
    let spawnPos = new THREE.Vector3(0, 3, 0);

    for (const part of runtimeBlocks) {
      const mesh = buildBlockMesh(part, maxAniso);
      worldGroup.add(mesh);
      blockMeshes.set(part.id, mesh);
      if (part.role === 'spawn') {
        spawnPos.set(part.position[0], part.position[1] + part.size[1] / 2 + 0.5, part.position[2]);
      }
    }

    // Local Player Rig
    const localRig = createAvatarRig(user.avatarConfig, catalogItems);
    localRig.root.position.copy(spawnPos);
    scene.add(localRig.root);

    // Remote Players Map
    const remoteRigs = new Map<
      string,
      {
        rig: AvatarRig;
        nameplate: THREE.Sprite;
        targetPos: THREE.Vector3;
        targetYaw: number;
        anim: RemotePlayerState['anim'];
        speaking: boolean;
        faceStyle: UserProfile['avatarConfig']['faceStyle'];
        animPack: UserProfile['avatarConfig']['animPack'];
      }
    >();

    function upsertRemotePlayer(p: RemotePlayerState) {
      if (p.id === user.id) return;
      let entry = remoteRigs.get(p.id);
      if (!entry) {
        const rig = createAvatarRig(p.avatarConfig, catalogItems);
        const nameplate = createNameplateSprite(p.displayName, p.speaking);
        nameplate.position.set(0, 4.1, 0);
        rig.root.add(nameplate);
        rig.root.position.set(p.position[0], p.position[1], p.position[2]);
        scene.add(rig.root);
        entry = {
          rig,
          nameplate,
          targetPos: new THREE.Vector3(p.position[0], p.position[1], p.position[2]),
          targetYaw: p.yaw,
          anim: p.anim,
          speaking: p.speaking,
          faceStyle: p.avatarConfig.faceStyle,
          animPack: p.avatarConfig.animPack,
        };
        remoteRigs.set(p.id, entry);
      } else {
        entry.targetPos.set(p.position[0], p.position[1], p.position[2]);
        entry.targetYaw = p.yaw;
        entry.anim = p.anim;
        entry.speaking = p.speaking;
      }
      setRemotePlayersCount(remoteRigs.size);
    }

    function removeRemotePlayer(uid: string) {
      const entry = remoteRigs.get(uid);
      if (entry) {
        scene.remove(entry.rig.root);
        entry.rig.dispose();
        remoteRigs.delete(uid);
        setRemotePlayersCount(remoteRigs.size);
      }
    }

    // Prefetch Cloudflare TURN / SFU capabilities
    if (!offlineMode) {
      apiFetch<{ iceServers: RTCIceServer[]; turnEnabled: boolean; sfuEnabled: boolean }>('/api/voice/ice')
        .then((cfg) => {
          if (Array.isArray(cfg.iceServers) && cfg.iceServers.length > 0) {
            iceConfigRef.current = cfg;
          }
        })
        .catch(() => {});
    }

    // Connect WebSocket if online
    let ws: WebSocket | null = null;
    if (!offlineMode) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getAuthToken() || '';
      ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: 'room:join',
            worldId: world.id,
            roomId: initialRoomId || undefined,
            isPrivate: isPrivateRoom,
          })
        );
      };

      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'room:state') {
            setActiveRoomId(msg.roomId);
            setChatMessages(msg.chatHistory || []);
            for (const p of msg.players || []) {
              upsertRemotePlayer(p);
            }
            for (const peer of msg.voiceSfuPeers || []) {
              sfuPeersRef.current.set(peer.userId, peer);
            }
          } else if (msg.type === 'player:join') {
            upsertRemotePlayer(msg.player);
          } else if (msg.type === 'player:update') {
            const entry = remoteRigs.get(msg.userId);
            if (entry) {
              entry.targetPos.set(msg.position[0], msg.position[1], msg.position[2]);
              entry.targetYaw = msg.yaw;
              entry.anim = msg.anim;
            }
          } else if (msg.type === 'player:leave') {
            removeRemotePlayer(msg.userId);
            detachSpatialRemoteAudio(msg.userId);
            sfuPeersRef.current.delete(msg.userId);
            peerConnsRef.current.get(msg.userId)?.close();
            peerConnsRef.current.delete(msg.userId);
          } else if (msg.type === 'chat:message') {
            setChatMessages((prev) => [...prev.slice(-60), msg.message]);
          } else if (msg.type === 'anticheat:snap') {
            localRig.root.position.set(msg.position[0], msg.position[1], msg.position[2]);
            showToast(msg.reason || 'Anti-cheat position correction');
          } else if (msg.type === 'voice:speaking') {
            const entry = remoteRigs.get(msg.userId);
            if (entry) entry.speaking = Boolean(msg.speaking);
          } else if (msg.type === 'voice:sfu_peer') {
            const peer = {
              userId: String(msg.userId),
              displayName: String(msg.displayName || 'Player'),
              sessionId: String(msg.sessionId),
              trackName: String(msg.trackName),
            };
            sfuPeersRef.current.set(peer.userId, peer);
            if (sfuRef.current) {
              await subscribeSfuPeerTrack(peer);
            }
          } else if (msg.type === 'voice:sfu_leave' || msg.type === 'voice:peer_left') {
            sfuPeersRef.current.delete(String(msg.userId));
            sfuRef.current?.subscribedPeers.delete(String(msg.userId));
            detachSpatialRemoteAudio(String(msg.userId));
            peerConnsRef.current.get(String(msg.userId))?.close();
            peerConnsRef.current.delete(String(msg.userId));
          } else if (msg.type === 'voice:peer_joined' && localStreamRef.current && !sfuRef.current) {
            // Initiate Cloudflare TURN-backed WebRTC offer to newly joined voice peer
            await initiatePeerOffer(msg.userId);
          } else if (msg.type === 'voice:signal') {
            await handleWebRtcSignal(msg.fromUserId, msg.signal);
          }
        } catch {
          // Ignore malformed ws message
        }
      };
    }

    async function initiatePeerOffer(targetUserId: string) {
      if (!localStreamRef.current || !wsRef.current) return;
      const pc = new RTCPeerConnection({ iceServers: iceConfigRef.current.iceServers });
      peerConnsRef.current.set(targetUserId, pc);
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          wsRef.current?.send(JSON.stringify({ type: 'voice:signal', targetUserId, signal: { candidate: e.candidate } }));
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        attachSpatialRemoteAudio(targetUserId, stream);
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: 'voice:signal', targetUserId, signal: { sdp: pc.localDescription } }));
    }

    async function handleWebRtcSignal(fromUserId: string, signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
      let pc = peerConnsRef.current.get(fromUserId);
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: iceConfigRef.current.iceServers });
        peerConnsRef.current.set(fromUserId, pc);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => pc!.addTrack(t, localStreamRef.current!));
        }
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            wsRef.current?.send(JSON.stringify({ type: 'voice:signal', targetUserId: fromUserId, signal: { candidate: e.candidate } }));
          }
        };
        pc.ontrack = (e) => {
          const stream = e.streams[0] || new MediaStream([e.track]);
          attachSpatialRemoteAudio(fromUserId, stream);
        };
      }
      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsRef.current?.send(JSON.stringify({ type: 'voice:signal', targetUserId: fromUserId, signal: { sdp: pc.localDescription } }));
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }

    // Camera Orbit & Input Listeners
    let camYaw = 0;
    let camPitch = 0.38;
    let camDist = 11;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const canvas = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      camYaw -= dx * 0.0065;
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.005, 0.08, 1.25);
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 5, 24);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      keysRef.current[e.code] = true;
      if (e.code === 'Space') {
        jumpQueuedRef.current = true;
        e.preventDefault();
      }
      if (e.code === 'KeyE') {
        dancingRef.current = !dancingRef.current;
        setDancing(dancingRef.current);
      }
      if (e.code === 'F5') {
        e.preventDefault();
        onOpenStudio(world);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const onResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      showToast('WebGL context paused — restoring...');
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    canvas.addEventListener('webglcontextlost', onContextLost);

    // Physics State
    const timer = new THREE.Timer();
    const vel = new THREE.Vector3(0, 0, 0);
    let grounded = false;
    let lastNetSync = 0;
    let lastTycoonTick = 0;
    let touchedCooldown = new Map<string, number>();

    const _camPos = new THREE.Vector3();
    const _lookAt = new THREE.Vector3();

    const stopLoop = schedulePacedLoop(renderer, isSoftwareGl, () => {
      timer.update();
      const dt = Math.min(0.05, timer.getDelta());
      const elapsed = timer.getElapsed();
      if (!finishedRef.current) {
        setRunElapsedSec((Date.now() - runStartRef.current) / 1000);
      }

      // Update animated blocks (moving bridges, spinning coins/lasers, blimp propellers, volcano steam, crumbling platforms)
      for (const part of runtimeBlocks) {
        const mesh = blockMeshes.get(part.id);
        if (!mesh) continue;
        if (part.patrolAxis && part.patrolRange) {
          const offset = Math.sin(elapsed * 1.4) * part.patrolRange;
          const bob = part.compositeType === 'blimp' ? Math.sin(elapsed * 1.8) * 0.8 : 0;
          mesh.position.set(
            part.position[0] + (part.patrolAxis === 'x' ? offset : 0),
            part.position[1] + bob + (part.patrolAxis === 'y' ? offset : 0),
            part.position[2] + (part.patrolAxis === 'z' ? offset : 0)
          );
        }
        if (part.spinSpeed) {
          mesh.rotation.y += part.spinSpeed * dt;
        }
        // Animate blimp propellers
        const props = mesh.userData.propellers as THREE.Object3D[] | undefined;
        if (props) {
          for (const pr of props) pr.rotation.z += 16 * dt;
        }
        // Animate volcano rising steam puffs
        const puffs = mesh.userData.steamPuffs as THREE.Object3D[] | undefined;
        if (puffs) {
          const baseH = Number(mesh.userData.baseH || 12);
          puffs.forEach((pf, idx) => {
            const cycle = (elapsed * 0.9 + idx * 0.6) % 4;
            pf.position.y = baseH * 0.52 + cycle * 2.4;
            const s = 0.8 + cycle * 0.35;
            pf.scale.set(s, s, s);
          });
        }
        // Handle crumbling platform lifecycle
        const cState = crumbleTimers.get(part.id);
        if (cState) {
          const age = elapsed - cState.triggeredAt;
          if (age < 0.85) {
            mesh.position.x = part.position[0] + Math.sin(elapsed * 55) * 0.22;
            mesh.position.y = part.position[1] - age * 0.25;
          } else if (age < 3.6) {
            mesh.visible = false;
            cState.state = 'fallen';
          } else {
            mesh.visible = true;
            mesh.position.set(part.position[0], part.position[1], part.position[2]);
            crumbleTimers.delete(part.id);
          }
        }
      }

      // Passive Tycoon Dropper income if in Tycoon world
      if (world.genre === 'tycoon' && elapsed - lastTycoonTick > 3.5) {
        lastTycoonTick = elapsed;
        const dropperSum = runtimeBlocks
          .filter((b) => b.role === 'dropper')
          .reduce((acc, b) => acc + (b.value || 10), 0);
        if (dropperSum > 0) {
          coinsRef.current += dropperSum;
          setCoins(coinsRef.current);
        }
      }

      // Movement Input
      const keys = keysRef.current;
      let moveX = joyRef.current.x;
      let moveZ = joyRef.current.y;
      if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

      const moving = Math.hypot(moveX, moveZ) > 0.08;
      if (moving) {
        advanceTutorial(0);
        dancingRef.current = false;
        setDancing(false);
        const len = Math.hypot(moveX, moveZ);
        const nx = moveX / len;
        const nz = moveZ / len;
        // Rotate relative to camera yaw
        const sinY = Math.sin(camYaw);
        const cosY = Math.cos(camYaw);
        const wx = nx * cosY + nz * sinY;
        const wz = -nx * sinY + nz * cosY;
        const speed = keys['ShiftLeft'] ? 16 : 11.5;
        vel.x = THREE.MathUtils.lerp(vel.x, wx * speed, 1 - Math.exp(-12 * dt));
        vel.z = THREE.MathUtils.lerp(vel.z, wz * speed, 1 - Math.exp(-12 * dt));
        const targetYaw = Math.atan2(wx, wz);
        // Smooth yaw interpolation
        let diff = targetYaw - localRig.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        localRig.root.rotation.y += diff * (1 - Math.exp(-14 * dt));
      } else {
        vel.x = THREE.MathUtils.lerp(vel.x, 0, 1 - Math.exp(-12 * dt));
        vel.z = THREE.MathUtils.lerp(vel.z, 0, 1 - Math.exp(-12 * dt));
      }

      if (jumpQueuedRef.current && grounded) {
        vel.y = 14.5;
        grounded = false;
        playSfx('jump');
        advanceTutorial(1);
      }
      jumpQueuedRef.current = false;

      // Gravity
      vel.y -= 34 * dt;

      const pos = localRig.root.position;
      const nextX = pos.x + vel.x * dt;
      const nextZ = pos.z + vel.z * dt;
      const nextY = pos.y + vel.y * dt;

      // AABB Collision & Role Triggers
      const playerHalfW = 0.65;
      const playerH = 3.2 * (user.avatarConfig.scale || 1);
      let resolvedY = nextY;
      let resolvedX = nextX;
      let resolvedZ = nextZ;
      let onGroundNow = false;
      let respawnNeeded = false;

      for (const part of runtimeBlocks) {
        if (collectedIds.has(part.id)) continue;
        const mesh = blockMeshes.get(part.id);
        const cx = mesh ? mesh.position.x : part.position[0];
        const cy = mesh ? mesh.position.y : part.position[1];
        const cz = mesh ? mesh.position.z : part.position[2];
        const hx = part.size[0] / 2;
        const hy = part.size[1] / 2;
        const hz = part.size[2] / 2;

        const rotY = mesh ? mesh.rotation.y : part.rotation[1] || 0;
        let overlapXZ = false;
        if (Math.abs(rotY) > 0.01) {
          const dx = resolvedX - cx;
          const dz = resolvedZ - cz;
          const cosR = Math.cos(rotY);
          const sinR = Math.sin(rotY);
          const lx = dx * cosR - dz * sinR;
          const lz = dx * sinR + dz * cosR;
          overlapXZ =
            Math.abs(lx) < hx + playerHalfW &&
            Math.abs(lz) < hz + playerHalfW;
        } else {
          overlapXZ =
            resolvedX + playerHalfW > cx - hx &&
            resolvedX - playerHalfW < cx + hx &&
            resolvedZ + playerHalfW > cz - hz &&
            resolvedZ - playerHalfW < cz + hz;
        }

        const overlapY = resolvedY < cy + hy + 0.15 && resolvedY + playerH > cy - hy;

        if (overlapXZ && overlapY) {
          // Fire Lua Touched hook if registered
          const hooks = luaRes.touchedCallbacks.get(part.name);
          if (hooks && hooks.length > 0) {
            const lastHit = touchedCooldown.get(part.name) || 0;
            if (elapsed - lastHit > 2.2) {
              touchedCooldown.set(part.name, elapsed);
              hooks.forEach((fn) => fn());
            }
          }

          if (part.role === 'hazard') {
            playSfx('hazard');
            deathsRef.current += 1;
            setDeaths(deathsRef.current);
            showToast('Ouch! Respawned at checkpoint.');
            respawnNeeded = true;
            break;
          }

          if (part.role === 'crumble') {
            const cState = crumbleTimers.get(part.id);
            if (cState?.state === 'fallen') {
              continue; // Fell away, no collision!
            }
            if (!cState) {
              crumbleTimers.set(part.id, { triggeredAt: elapsed, state: 'shaking' });
              showToast('Platform crumbling! Jump!');
            }
          }

          if (part.role === 'coin') {
            collectedIds.add(part.id);
            if (mesh) mesh.visible = false;
            const val = part.value || 25;
            coinsRef.current += val;
            collectedCountRef.current += 1;
            scoreRef.current += val * 2;
            setCoins(coinsRef.current);
            setCollectedCoinCount(collectedCountRef.current);
            setScore(scoreRef.current);
            playSfx('coin');
            showToast(`+${val} Coins! (${collectedCountRef.current}/${totalCoinCount})`);
            advanceTutorial(2);
            persistProgress(checkpointRef.current, coinsRef.current, scoreRef.current, Math.min(25, Math.ceil(val / 2)), 30);
            continue;
          }

          if (part.role === 'bounce') {
            vel.y = part.value || 24;
            onGroundNow = false;
            playSfx('bounce');
            showToast('Super Jump!');
            continue;
          }

          if (part.role === 'checkpoint') {
            const cpVal = part.value || 1;
            if (cpVal > checkpointRef.current) {
              checkpointRef.current = cpVal;
              setCheckpoint(cpVal);
              spawnPos.set(cx, cy + hy + 0.5, cz);
              playSfx('checkpoint');
              showToast(`Checkpoint ${cpVal} reached! Progress saved.`);
              advanceTutorial(2);
              persistProgress(cpVal, coinsRef.current, scoreRef.current + 50, 20, 50);
            }
          }

          if (part.role === 'portal') {
            const lastHit = touchedCooldown.get('portal_' + part.id) || 0;
            if (elapsed - lastHit > 4) {
              touchedCooldown.set('portal_' + part.id, elapsed);
              playSfx('checkpoint');
              scoreRef.current += 150;
              setScore(scoreRef.current);
              if (!finishedRef.current) {
                finishedRef.current = true;
                const clearSec = Number(((Date.now() - runStartRef.current) / 1000).toFixed(1));
                setVictorySummary({
                  timeSec: clearSec,
                  coinsCollected: collectedCountRef.current,
                  totalCoins: totalCoinCount,
                  deaths: deathsRef.current,
                  perfect: deathsRef.current === 0,
                });
              }
              persistProgress(checkpointRef.current, coinsRef.current, scoreRef.current, 40, 150, true);
            }
          }

          if (part.role === 'conveyor') {
            resolvedX += (part.value || 6) * dt;
          }

          if (part.canCollide) {
            // Landing on top of platform
            if (pos.y >= cy + hy - 0.35 && vel.y <= 0) {
              resolvedY = cy + hy;
              vel.y = 0;
              onGroundNow = true;
            } else if (pos.y + playerH <= cy - hy + 0.35 && vel.y > 0) {
              resolvedY = cy - hy - playerH;
              vel.y = 0;
            } else {
              // Side wall pushback
              const dx = resolvedX - cx;
              const dz = resolvedZ - cz;
              if (Math.abs(dx / hx) > Math.abs(dz / hz)) {
                resolvedX = dx > 0 ? cx + hx + playerHalfW : cx - hx - playerHalfW;
              } else {
                resolvedZ = dz > 0 ? cz + hz + playerHalfW : cz - hz - playerHalfW;
              }
            }
          }
        }
      }

      if (respawnNeeded || resolvedY < -18) {
        if (!respawnNeeded && resolvedY < -18) {
          deathsRef.current += 1;
          setDeaths(deathsRef.current);
        }
        pos.copy(spawnPos);
        vel.set(0, 0, 0);
        grounded = false;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'player:move',
            position: [pos.x, pos.y, pos.z],
            yaw: localRig.root.rotation.y,
            anim: 'idle',
            respawn: true,
          }));
        }
      } else {
        pos.set(resolvedX, resolvedY, resolvedZ);
        grounded = onGroundNow;
      }

      const animState: RemotePlayerState['anim'] = !grounded
        ? 'jump'
        : dancingRef.current
          ? 'dance'
          : moving
            ? keys['ShiftLeft']
              ? 'run'
              : 'walk'
            : 'idle';

      animateAvatarRig(
        localRig,
        dt,
        animState,
        user.avatarConfig.animPack,
        elapsed,
        speakingRef.current,
        user.avatarConfig.faceStyle
      );

      // Update Remote Players smoothly + 3D Spatial Proximity Audio Attenuation
      const audioCtx = spatialAudioRef.current.ctx;
      const camRightX = Math.cos(camYaw);
      const camRightZ = -Math.sin(camYaw);

      for (const [uid, r] of remoteRigs.entries()) {
        r.rig.root.position.lerp(r.targetPos, 1 - Math.exp(-12 * dt));
        r.rig.root.rotation.y = THREE.MathUtils.lerp(r.rig.root.rotation.y, r.targetYaw, 1 - Math.exp(-12 * dt));
        animateAvatarRig(r.rig, dt, r.anim, r.animPack, elapsed, r.speaking, r.faceStyle);

        const audioNode = spatialAudioRef.current.nodes.get(uid);
        if (audioNode && audioCtx) {
          const dist = r.rig.root.position.distanceTo(pos);
          const gainVal = dist <= 8 ? 1 : dist >= 44 ? 0 : Math.pow(1 - (dist - 8) / 36, 1.5);
          const dx = r.rig.root.position.x - pos.x;
          const dz = r.rig.root.position.z - pos.z;
          const panVal = THREE.MathUtils.clamp((dx * camRightX + dz * camRightZ) / Math.max(2.5, dist), -0.85, 0.85);
          audioNode.gain.gain.setTargetAtTime(gainVal, audioCtx.currentTime, 0.05);
          audioNode.panner.pan.setTargetAtTime(panVal, audioCtx.currentTime, 0.05);
        }
      }

      // Sync local position over WebSocket at ~20Hz
      if (ws?.readyState === WebSocket.OPEN && elapsed - lastNetSync > 0.05) {
        lastNetSync = elapsed;
        ws.send(
          JSON.stringify({
            type: 'player:move',
            position: [pos.x, pos.y, pos.z],
            yaw: localRig.root.rotation.y,
            anim: animState,
            score: scoreRef.current,
          })
        );
      }

      // Smooth 3rd-Person Chase Camera
      const targetCamX = pos.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
      const targetCamY = pos.y + 2.4 + Math.sin(camPitch) * camDist;
      const targetCamZ = pos.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
      _camPos.set(targetCamX, targetCamY, targetCamZ);
      camera.position.lerp(_camPos, 1 - Math.exp(-14 * dt));
      _lookAt.set(pos.x, pos.y + 2.1, pos.z);
      camera.lookAt(_lookAt);

      renderer.render(scene, camera);
    });

    return () => {
      stopLoop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);

      ws?.close();
      wsRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerConnsRef.current.forEach((pc) => pc.close());
      peerConnsRef.current.clear();
      sfuRef.current?.pc.close();
      sfuRef.current = null;
      Array.from(spatialAudioRef.current.nodes.keys()).forEach(detachSpatialRemoteAudio);
      spatialAudioRef.current.ctx?.close().catch(() => {});
      spatialAudioRef.current.ctx = null;

      localRig.dispose();
      remoteRigs.forEach((r) => r.rig.dispose());
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [world.id, offlineMode]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    advanceTutorial(3);

    if (offlineMode || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `local_${Date.now()}`,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          text,
          filtered: false,
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'chat:send', text }));
  };

  const toggleVoiceChat = async () => {
    if (voiceActive) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      peerConnsRef.current.forEach((pc) => pc.close());
      peerConnsRef.current.clear();
      sfuRef.current?.pc.close();
      sfuRef.current = null;
      Array.from(spatialAudioRef.current.nodes.keys()).forEach(detachSpatialRemoteAudio);
      setVoiceActive(false);
      setIsSpeaking(false);
      speakingRef.current = false;
      wsRef.current?.send(JSON.stringify({ type: 'voice:speaking', speaking: false }));
      wsRef.current?.send(JSON.stringify({ type: 'voice:leave' }));
      return;
    }

    try {
      const iceCfg = await apiFetch<{ iceServers: RTCIceServer[]; turnEnabled: boolean; sfuEnabled: boolean }>('/api/voice/ice').catch(
        () => iceConfigRef.current
      );
      if (Array.isArray(iceCfg.iceServers) && iceCfg.iceServers.length > 0) {
        iceConfigRef.current = iceCfg;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setVoiceActive(true);
      advanceTutorial(3);

      // Ensure AudioContext is unlocked on user click for 3D Spatial Audio
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!spatialAudioRef.current.ctx) {
        spatialAudioRef.current.ctx = new AudioCtx();
      }
      spatialAudioRef.current.ctx.resume().catch(() => {});

      let sfuStarted = false;
      if (iceConfigRef.current.sfuEnabled) {
        try {
          const sess = await apiFetch<{ sessionId: string }>('/api/voice/sfu/sessions/new', { method: 'POST' });
          const pc = new RTCPeerConnection({
            iceServers: iceConfigRef.current.iceServers,
            bundlePolicy: 'max-bundle',
          });
          const midToUserId = new Map<string, string>();
          const localTrackName = `mic_${user.id}_${Date.now().toString(36)}`;
          const sfuState = {
            pc,
            sessionId: sess.sessionId,
            localTrackName,
            midToUserId,
            subscribedPeers: new Set<string>(),
          };
          sfuRef.current = sfuState;

          pc.ontrack = (ev) => {
            const mid = ev.transceiver?.mid || '';
            const ownerUserId = midToUserId.get(mid);
            if (ownerUserId) {
              const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
              attachSpatialRemoteAudio(ownerUserId, remoteStream);
            }
          };

          const audioTrack = stream.getAudioTracks()[0];
          const transceiver = pc.addTransceiver(audioTrack, { direction: 'sendonly' });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const pubRes = await apiFetch<{ sessionDescription?: RTCSessionDescriptionInit }>(
            `/api/voice/sfu/sessions/${encodeURIComponent(sess.sessionId)}/tracks/new`,
            {
              method: 'POST',
              body: JSON.stringify({
                sessionDescription: { type: 'offer', sdp: offer.sdp },
                tracks: [{ location: 'local', mid: transceiver.mid, trackName: localTrackName }],
              }),
            }
          );

          if (pubRes.sessionDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(pubRes.sessionDescription));
          }

          wsRef.current?.send(
            JSON.stringify({
              type: 'voice:sfu_publish',
              sessionId: sess.sessionId,
              trackName: localTrackName,
            })
          );

          for (const peer of sfuPeersRef.current.values()) {
            await subscribeSfuPeerTrack(peer);
          }

          sfuStarted = true;
          showToast(
            iceConfigRef.current.turnEnabled
              ? 'Spatial Voice Live (Cloudflare SFU + TURN)'
              : 'Spatial Voice Live (Cloudflare SFU)'
          );
        } catch {
          sfuRef.current?.pc.close();
          sfuRef.current = null;
        }
      }

      if (!sfuStarted) {
        showToast(
          iceConfigRef.current.turnEnabled
            ? 'Spatial Voice Live (Cloudflare TURN)'
            : 'Spatial Voice Live (Cloudflare STUN)'
        );
        wsRef.current?.send(JSON.stringify({ type: 'voice:join' }));
      }

      // Voice activity detection for real-time lip-sync & nameplate indicator
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const pollMic = () => {
        if (!localStreamRef.current) {
          ctx.close().catch(() => {});
          return;
        }
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const active = avg > 14;
        if (active !== speakingRef.current) {
          speakingRef.current = active;
          setIsSpeaking(active);
          wsRef.current?.send(JSON.stringify({ type: 'voice:speaking', speaking: active }));
        }
        requestAnimationFrame(pollMic);
      };
      pollMic();
    } catch {
      // Allow mic test fallback in headless/denied environments
      setVoiceActive(true);
      setIsSpeaking(true);
      speakingRef.current = true;
      showToast('Simulated Voice Lip-Sync Active (Mic unavailable)');
    }
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: reportTarget.userId,
          targetUsername: reportTarget.username,
          reason: reportReason,
          chatExcerpt: reportTarget.excerpt,
          worldId: world.id,
        }),
      });
      showToast(`Reported ${reportTarget.username} to Safety Team.`);
    } catch {
      showToast('Unable to submit report while offline.');
    }
    setReportTarget(null);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Top Left Navigation & World Info */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg surface-2027-hud border border-white/15 text-zinc-100 hover:border-cyan-400/40 text-sm font-semibold transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Leave
        </button>
        <div className="px-3.5 py-2 rounded-lg surface-2027-hud border border-white/15 flex items-center gap-3">
          <div>
            <div className="text-sm font-bold text-white leading-tight">{world.title}</div>
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <span>{world.creatorName}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {remotePlayersCount + 1} in room
              </span>
              {activeRoomId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-zinc-300">{activeRoomId}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {offlineMode && (
          <div className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" /> Offline Mode
          </div>
        )}
      </div>

      {/* Top Right Stats & Voice/Studio Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <div className="px-3.5 py-2 rounded-lg surface-2027-hud border border-white/15 flex items-center gap-4 text-xs font-semibold tabular-nums">
          <span className="text-white font-mono">
            {runElapsedSec.toFixed(1)}s
          </span>
          <span className="text-amber-400 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" /> {totalCoinCount > 0 ? `${collectedCoinCount}/${totalCoinCount}` : coins}
          </span>
          <span className="text-emerald-400 flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" /> CP {checkpoint}
          </span>
          <span className="text-rose-400">Deaths {deaths}</span>
        </div>

        <button
          onClick={toggleVoiceChat}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
            voiceActive
              ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 border-emerald-300 text-black font-bold'
              : 'bg-black/80 backdrop-blur-md border-white/12 text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          {voiceActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {voiceActive ? (isSpeaking ? 'Speaking' : 'Mic On') : 'Voice'}
        </button>

        <button
          onClick={() => setTouchUi((v) => !v)}
          className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            touchUi
              ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 border-cyan-300 text-black font-bold'
              : 'bg-black/80 backdrop-blur-md border-white/12 text-zinc-200 hover:bg-zinc-900'
          }`}
          title="Toggle Mobile Touch Controls"
        >
          <Gamepad2 className="w-4 h-4" />
          Touch
        </button>

        <button
          onClick={() => onOpenStudio(world)}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 hover:from-amber-300 hover:to-rose-300 text-black text-xs font-extrabold transition-all cursor-pointer"
        >
          Edit in Studio
        </button>
      </div>

      {/* Dynamic Interactive Tutorial Overlay */}
      {tutorialStep < TUTORIAL_STEPS.length && (
        <div className="absolute top-20 right-4 z-20 w-72 rounded-xl bg-black/85 backdrop-blur-md border border-emerald-500/35 p-3.5 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Interactive Tutorial
            </span>
            <span className="text-[11px] text-zinc-400 tabular-nums">
              {tutorialStep}/{TUTORIAL_STEPS.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {TUTORIAL_STEPS.map((label, idx) => {
              const done = idx < tutorialStep;
              const current = idx === tutorialStep;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-2 text-xs ${
                    done ? 'text-zinc-500 line-through' : current ? 'text-white font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${done ? 'text-emerald-400' : current ? 'text-cyan-400' : 'text-zinc-600'}`} />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Center Toast Notification */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-black/90 backdrop-blur-md border border-emerald-400/50 text-white text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}

      {/* Left Chat Drawer */}
      <div className="absolute bottom-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => setChatOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/12 text-xs font-semibold text-zinc-200 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {chatOpen ? 'Hide Chat' : 'Show Chat'}
          </button>
          <button
            onClick={() => {
              dancingRef.current = !dancingRef.current;
              setDancing(dancingRef.current);
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
              dancing
                ? 'bg-gradient-to-r from-fuchsia-500 to-rose-500 border-rose-400 text-white font-bold'
                : 'bg-black/80 backdrop-blur-md border-white/12 text-zinc-200'
            }`}
          >
            Emote (E)
          </button>
        </div>

        {chatOpen && (
          <div className="rounded-xl bg-black/80 backdrop-blur-md border border-white/12 overflow-hidden">
            <div className="h-40 overflow-y-auto p-2.5 space-y-1.5 text-xs">
              {chatMessages.length === 0 && (
                <div className="text-zinc-500 text-center py-8">
                  Say hello to players in {world.title}. Chat is moderated in real time.
                </div>
              )}
              {chatMessages.map((m) => (
                <div key={m.id} className="group flex items-start justify-between gap-2 leading-relaxed">
                  <div>
                    <span className={m.system ? 'font-bold text-amber-400' : 'font-bold text-cyan-400'}>
                      {m.displayName}:{' '}
                    </span>
                    <span className="text-zinc-100">{m.text}</span>
                    {m.filtered && <span className="ml-1 text-[10px] text-amber-400">(filtered)</span>}
                  </div>
                  {m.userId !== user.id && !m.system && (
                    <button
                      onClick={() =>
                        setReportTarget({
                          userId: m.userId,
                          username: m.displayName,
                          excerpt: m.text,
                        })
                      }
                      className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 shrink-0 cursor-pointer"
                      title="Report toxic message"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex border-t border-white/10">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Chat with room..."
                className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-2 text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Center Controls Hint */}
      {!touchUi && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-zinc-300 hidden md:flex items-center gap-3">
          <span>WASD Move</span>
          <span>·</span>
          <span>Space Jump</span>
          <span>·</span>
          <span>Drag Look</span>
          <span>·</span>
          <span>Scroll Zoom</span>
          <span>·</span>
          <span>E Emote</span>
        </div>
      )}

      {/* Mobile / Cross-Platform Touch Controls */}
      {touchUi && (
        <>
          <div className="absolute bottom-24 right-6 z-30 grid grid-cols-3 gap-1.5 w-32 h-32 md:hidden" />
          <div className="fixed bottom-6 right-6 z-30 flex items-center gap-3">
            <div className="grid grid-cols-3 gap-1 bg-black/85 backdrop-blur-md p-2 rounded-2xl border border-white/15">
              <div />
              <button
                onPointerDown={() => (joyRef.current.y = -1)}
                onPointerUp={() => (joyRef.current.y = 0)}
                onPointerLeave={() => (joyRef.current.y = 0)}
                className="w-11 h-11 rounded-lg bg-white/10 active:bg-cyan-400 active:text-black text-white font-bold text-sm"
              >
                ▲
              </button>
              <div />
              <button
                onPointerDown={() => (joyRef.current.x = -1)}
                onPointerUp={() => (joyRef.current.x = 0)}
                onPointerLeave={() => (joyRef.current.x = 0)}
                className="w-11 h-11 rounded-lg bg-white/10 active:bg-cyan-400 active:text-black text-white font-bold text-sm"
              >
                ◀
              </button>
              <button
                onPointerDown={() => (joyRef.current.y = 1)}
                onPointerUp={() => (joyRef.current.y = 0)}
                onPointerLeave={() => (joyRef.current.y = 0)}
                className="w-11 h-11 rounded-lg bg-white/10 active:bg-cyan-400 active:text-black text-white font-bold text-sm"
              >
                ▼
              </button>
              <button
                onPointerDown={() => (joyRef.current.x = 1)}
                onPointerUp={() => (joyRef.current.x = 0)}
                onPointerLeave={() => (joyRef.current.x = 0)}
                className="w-11 h-11 rounded-lg bg-white/10 active:bg-cyan-400 active:text-black text-white font-bold text-sm"
              >
                ▶
              </button>
            </div>
            <button
              onPointerDown={() => (jumpQueuedRef.current = true)}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 active:scale-95 border-2 border-white/40 text-black font-extrabold text-sm shadow-lg"
            >
              JUMP
            </button>
          </div>
        </>
      )}

      {/* Voice Active Audio Indicator */}
      {voiceActive && (
        <div className="fixed bottom-4 right-4 z-20 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 text-black text-xs font-extrabold">
          <Volume2 className="w-3.5 h-3.5" />
          Voice Channel Active
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl surface-2027-hero border border-rose-500/30 p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <ShieldAlert className="w-5 h-5" />
              Report Player: {reportTarget.username}
            </div>
            <p className="text-xs text-zinc-300 bg-black/50 p-2.5 rounded-lg border border-white/10">
              "{reportTarget.excerpt}"
            </p>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Violation Category</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-lg bg-black border border-white/12 px-3 py-2 text-sm text-white"
              >
                <option>Toxic / abusive chat</option>
                <option>Speed / fly exploit</option>
                <option>Scam or phishing link</option>
                <option>Harassment</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-xs font-bold text-white cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course Complete Victory Summary Modal */}
      {victorySummary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl surface-2027-hero border border-emerald-400/40 p-6 space-y-4 text-center">
            <div className="text-xs font-bold text-emerald-400">
              {victorySummary.perfect ? 'Perfect Run! Zero Deaths' : 'Course Complete'}
            </div>
            <h2 className="text-2xl font-extrabold text-white">{world.title} Cleared</h2>
            <div className="grid grid-cols-3 gap-3 py-3 border-y border-white/10 tabular-nums">
              <div>
                <div className="text-xs text-zinc-400">Clear Time</div>
                <div className="text-lg font-bold text-white">{victorySummary.timeSec}s</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Coins</div>
                <div className="text-lg font-bold text-amber-400">
                  {victorySummary.coinsCollected}/{victorySummary.totalCoins}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Deaths</div>
                <div className={`text-lg font-bold ${victorySummary.deaths === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {victorySummary.deaths}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setVictorySummary(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-200 cursor-pointer"
              >
                Keep Exploring
              </button>
              <button
                onClick={() => onOpenStudio(world)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-xs font-extrabold text-black cursor-pointer"
              >
                Edit in Studio (F5)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
