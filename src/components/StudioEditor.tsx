import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  ArrowLeft,
  Camera,
  Code2,
  Copy,
  Download,
  Move,
  Play,
  Plus,
  RotateCw,
  Save,
  Maximize2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import type {
  BlockMaterial,
  BlockPart,
  BlockRole,
  BlockShape,
  UserProfile,
  WorldData,
  WorldGenre,
} from '../types/aniblox';
import {
  buildBlockMesh,
  captureViewportDataUrl,
  createStudioRenderer,
  schedulePacedLoop,
} from '../engine/worldRenderer';
import { executeAnibloxLua } from '../engine/luaRuntime';
import { apiFetch } from '../lib/api';
import {
  ARENA_BLOCKS,
  ARENA_LUA,
  BASEPLATE_BLOCKS,
  BASEPLATE_LUA,
  OBBY_BLOCKS,
  OBBY_LUA,
  SIMULATOR_BLOCKS,
  SIMULATOR_LUA,
  THUMBNAILS,
  TYCOON_BLOCKS,
  TYCOON_LUA,
} from '../data/presets';

interface StudioEditorProps {
  initialWorld: WorldData;
  user: UserProfile;
  onExit: () => void;
  onPlayTest: (world: WorldData) => void;
  onWorldPublished: (world: WorldData, updatedUser?: UserProfile) => void;
}

const ASSET_LIBRARY: Array<{
  label: string;
  shape: BlockShape;
  role: BlockRole;
  material: BlockMaterial;
  color: string;
  size: [number, number, number];
}> = [
  { label: 'Stud Part', shape: 'box', role: 'solid', material: 'plastic', color: '#3B82F6', size: [4, 1, 4] },
  { label: 'Wedge Ramp', shape: 'wedge', role: 'solid', material: 'plastic', color: '#64748B', size: [4, 2, 5] },
  { label: 'Crumble Wafer', shape: 'box', role: 'crumble', material: 'plastic', color: '#F9A8D4', size: [4, 0.8, 4] },
  { label: 'Spawn Pad', shape: 'box', role: 'spawn', material: 'grass', color: '#4B974B', size: [8, 1, 8] },
  { label: 'Checkpoint', shape: 'box', role: 'checkpoint', material: 'plastic', color: '#10B981', size: [6, 1, 6] },
  { label: 'Lava Hazard', shape: 'box', role: 'hazard', material: 'neon', color: '#EF4444', size: [5, 0.7, 2] },
  { label: 'Bounce Pad', shape: 'cylinder', role: 'bounce', material: 'neon', color: '#A855F7', size: [3.5, 0.6, 3.5] },
  { label: 'Coin', shape: 'cylinder', role: 'coin', material: 'neon', color: '#FACC15', size: [1.5, 0.4, 1.5] },
  { label: 'Conveyor', shape: 'box', role: 'conveyor', material: 'metal', color: '#18181B', size: [10, 0.5, 3] },
  { label: 'Victory Portal', shape: 'box', role: 'portal', material: 'neon', color: '#38BDF8', size: [4, 4.5, 0.8] },
];

const COMPOSITE_PROPS: Array<{
  label: string;
  compositeType: 'tree' | 'lollipop' | 'volcano' | 'blimp';
  color: string;
  size: [number, number, number];
}> = [
  { label: 'Palm Tree', compositeType: 'tree', color: '#16A34A', size: [2, 6, 2] },
  { label: 'Lollipop', compositeType: 'lollipop', color: '#F472B6', size: [2, 5, 2] },
  { label: 'Volcano', compositeType: 'volcano', color: '#475569', size: [10, 14, 10] },
  { label: 'Sky Blimp', compositeType: 'blimp', color: '#38BDF8', size: [6, 4, 12] },
];

export const StudioEditor: React.FC<StudioEditorProps> = ({
  initialWorld,
  user,
  onExit,
  onPlayTest,
  onWorldPublished,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(initialWorld.title);
  const [genre, setGenre] = useState<WorldGenre>(initialWorld.genre);
  const [skyColor, setSkyColor] = useState(initialWorld.skyColor || '#38BDF8');
  const [blocks, setBlocks] = useState<BlockPart[]>(initialWorld.blocks);
  const [scriptCode, setScriptCode] = useState(initialWorld.scriptCode);
  const [selectedId, setSelectedId] = useState<string | null>(initialWorld.blocks[0]?.id || null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'scale' | 'rotate'>('translate');
  const [rightTab, setRightTab] = useState<'properties' | 'script'>('properties');
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['Aniblox Studio ready. Click a 3D part to inspect or drag.']);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'edit' | 'new'>('edit');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(initialWorld.isPublished);
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState<string>(initialWorld.thumbnailUrl);
  const [qaIssues, setQaIssues] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const gizmoModeRef = useRef(gizmoMode);
  gizmoModeRef.current = gizmoMode;
  const worldDraftRef = useRef<WorldData>(initialWorld);
  worldDraftRef.current = {
    ...initialWorld,
    title: title.trim() || 'Untitled World',
    genre,
    skyColor,
    blocks,
    scriptCode,
    isPublished: isPublic,
    thumbnailUrl: customThumbnailUrl || THUMBNAILS[genre] || initialWorld.thumbnailUrl,
    updatedAt: new Date().toISOString(),
  };

  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    meshMap: Map<string, THREE.Object3D>;
    maxAniso: number;
    rebuildMeshes: (nextBlocks: BlockPart[]) => void;
  } | null>(null);

  const notifyStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg((p) => (p === msg ? null : p)), 3000);
  };

  // Initialize Three.js Studio Viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl, maxAniso } = createStudioRenderer(container);
    scene.background = new THREE.Color(skyColor);

    const camera = new THREE.PerspectiveCamera(
      55,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      500
    );
    camera.position.set(22, 18, 24);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.08;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setTranslationSnap(0.5);
    transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    transform.addEventListener('dragging-changed', (ev) => {
      orbit.enabled = !ev.value;
    });
    transform.addEventListener('objectChange', () => {
      const obj = transform.object as THREE.Mesh | undefined;
      if (!obj || !obj.userData.partId) return;
      const pid = String(obj.userData.partId);
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== pid) return b;
          const sx = Math.max(0.4, Number((b.size[0] * obj.scale.x).toFixed(2)));
          const sy = Math.max(0.3, Number((b.size[1] * obj.scale.y).toFixed(2)));
          const sz = Math.max(0.4, Number((b.size[2] * obj.scale.z).toFixed(2)));
          return {
            ...b,
            position: [
              Number(obj.position.x.toFixed(2)),
              Number(obj.position.y.toFixed(2)),
              Number(obj.position.z.toFixed(2)),
            ],
            rotation: [
              Number(obj.rotation.x.toFixed(2)),
              Number(obj.rotation.y.toFixed(2)),
              Number(obj.rotation.z.toFixed(2)),
            ],
            size: obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1 ? [sx, sy, sz] : b.size,
          };
        })
      );
      if (obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1) {
        obj.scale.set(1, 1, 1);
      }
    });
    scene.add(transform.getHelper());

    const grid = new THREE.GridHelper(120, 60, 0x3f3f46, 0x18181b);
    grid.position.y = -0.02;
    scene.add(grid);

    const partsGroup = new THREE.Group();
    scene.add(partsGroup);
    const meshMap = new Map<string, THREE.Object3D>();

    function rebuildMeshes(nextBlocks: BlockPart[]) {
      transform.detach();
      while (partsGroup.children.length > 0) {
        const child = partsGroup.children[0];
        partsGroup.remove(child);
        child.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
            else m.material?.dispose();
          }
        });
      }
      meshMap.clear();
      for (const b of nextBlocks) {
        const m = buildBlockMesh(b, maxAniso);
        partsGroup.add(m);
        meshMap.set(b.id, m);
      }
      if (selectedIdRef.current && meshMap.has(selectedIdRef.current)) {
        transform.attach(meshMap.get(selectedIdRef.current)!);
      }
    }

    rebuildMeshes(blocksRef.current);
    sceneRefs.current = { renderer, scene, camera, orbit, transform, meshMap, maxAniso, rebuildMeshes };

    // Raycast click-to-select
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(partsGroup.children, true);
      if (hits.length > 0) {
        let target: THREE.Object3D | null = hits[0].object;
        while (target && !target.userData.partId) {
          target = target.parent;
        }
        const pid = String(target?.userData.partId || '');
        if (pid && target) {
          setSelectedId(pid);
          transform.attach(target);
        }
      }
    };

    const onStudioKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F5') {
        e.preventDefault();
        onPlayTest(worldDraftRef.current);
      }
    };

    const onResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onStudioKeyDown);
    window.addEventListener('resize', onResize);

    const stop = schedulePacedLoop(renderer, isSoftwareGl, () => {
      if (orbit.enabled && !isSoftwareGl) orbit.update();
      renderer.render(scene, camera);
    });

    return () => {
      stop();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onStudioKeyDown);
      window.removeEventListener('resize', onResize);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, []);

  // Sync blocks & sky color changes into 3D scene
  useEffect(() => {
    if (!sceneRefs.current) return;
    sceneRefs.current.scene.background = new THREE.Color(skyColor);
    sceneRefs.current.rebuildMeshes(blocks);
  }, [blocks, skyColor]);

  useEffect(() => {
    if (!sceneRefs.current) return;
    sceneRefs.current.transform.setMode(gizmoMode);
  }, [gizmoMode]);

  useEffect(() => {
    if (!sceneRefs.current) return;
    const { transform, meshMap } = sceneRefs.current;
    if (selectedId && meshMap.has(selectedId)) {
      transform.attach(meshMap.get(selectedId)!);
    } else {
      transform.detach();
    }
  }, [selectedId]);

  const selectedBlock = blocks.find((b) => b.id === selectedId) || null;

  const addAssetBlock = (asset: (typeof ASSET_LIBRARY)[number]) => {
    const nb: BlockPart = {
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: `${asset.label.replace(/\s+/g, '')}_${blocks.length + 1}`,
      shape: asset.shape,
      position: [0, 2, -4 - (blocks.length % 5) * 2],
      size: [...asset.size],
      rotation: [0, 0, 0],
      color: asset.color,
      material: asset.material,
      role: asset.role,
      anchored: true,
      canCollide: asset.role !== 'coin' && asset.role !== 'portal',
      value: asset.role === 'coin' ? 25 : asset.role === 'bounce' ? 24 : 1,
    };
    setBlocks((prev) => [...prev, nb]);
    setSelectedId(nb.id);
    setConsoleLogs((prev) => [...prev, `Inserted ${nb.name} (${nb.role})`]);
  };

  const addCompositeProp = (prop: (typeof COMPOSITE_PROPS)[number]) => {
    const nb: BlockPart = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: `${prop.label.replace(/\s+/g, '')}_${blocks.length + 1}`,
      shape: prop.compositeType === 'blimp' ? 'box' : 'cylinder',
      position: prop.compositeType === 'blimp' ? [8, 12, -16] : [4, prop.size[1] / 2, -6],
      size: [...prop.size],
      rotation: [0, 0, 0],
      color: prop.color,
      material: 'plastic',
      role: 'solid',
      anchored: true,
      canCollide: false,
      compositeType: prop.compositeType,
      patrolAxis: prop.compositeType === 'blimp' ? 'x' : undefined,
      patrolRange: prop.compositeType === 'blimp' ? 8 : undefined,
    };
    setBlocks((prev) => [...prev, nb]);
    setSelectedId(nb.id);
    setConsoleLogs((prev) => [...prev, `Inserted 3D Prop: ${nb.name}`]);
  };

  const duplicateSelected = () => {
    if (!selectedBlock) return;
    const copy: BlockPart = {
      ...selectedBlock,
      id: `blk_${Date.now()}_dup`,
      name: `${selectedBlock.name}_Copy`,
      position: [
        selectedBlock.position[0] + 2,
        selectedBlock.position[1],
        selectedBlock.position[2] - 2,
      ],
    };
    setBlocks((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setBlocks((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  };

  const updateSelected = (patch: Partial<BlockPart>) => {
    if (!selectedId) return;
    setBlocks((prev) => prev.map((b) => (b.id === selectedId ? { ...b, ...patch } : b)));
  };

  const loadTemplate = (templateGenre: WorldGenre | 'baseplate') => {
    if (templateGenre === 'baseplate' || templateGenre === 'sandbox') {
      setBlocks(BASEPLATE_BLOCKS);
      setScriptCode(BASEPLATE_LUA);
      setGenre('sandbox');
      setSkyColor('#38BDF8');
    } else if (templateGenre === 'obby') {
      setBlocks(OBBY_BLOCKS);
      setScriptCode(OBBY_LUA);
      setGenre('obby');
      setSkyColor('#38BDF8');
    } else if (templateGenre === 'tycoon') {
      setBlocks(TYCOON_BLOCKS);
      setScriptCode(TYCOON_LUA);
      setGenre('tycoon');
      setSkyColor('#0EA5E9');
    } else if (templateGenre === 'simulator') {
      setBlocks(SIMULATOR_BLOCKS);
      setScriptCode(SIMULATOR_LUA);
      setGenre('simulator');
      setSkyColor('#60A5FA');
    } else {
      setBlocks(ARENA_BLOCKS);
      setScriptCode(ARENA_LUA);
      setGenre('arena');
      setSkyColor('#09090B');
    }
    setConsoleLogs((prev) => [...prev, `Loaded ${templateGenre.toUpperCase()} starter template.`]);
  };

  const runLuaInStudio = () => {
    const res = executeAnibloxLua(scriptCode, {
      existingBlocks: blocks,
      onGiveCoins: (n) => setConsoleLogs((p) => [...p, `[Runtime] GiveCoins(${n})`]),
      onGiveXP: (n) => setConsoleLogs((p) => [...p, `[Runtime] GiveXP(${n})`]),
      onSetCheckpoint: (c) => setConsoleLogs((p) => [...p, `[Runtime] SetCheckpoint(${c})`]),
      onNotify: (m) => setConsoleLogs((p) => [...p, `[Notify] ${m}`]),
    });

    if (res.spawnedParts.length > 0) {
      setBlocks((prev) => [...prev, ...res.spawnedParts]);
    }
    const nextLogs = [
      ...res.logs.map((l) => `[Lua] ${l}`),
      ...res.errors.map((e) => `[Error] ${e}`),
      res.spawnedParts.length > 0
        ? `[Studio] Spawned ${res.spawnedParts.length} scripted part(s) into Workspace.`
        : `[Studio] Executed Lua (${res.touchedCallbacks.size} Touched hooks bound).`,
    ];
    setConsoleLogs((prev) => [...prev.slice(-25), ...nextLogs]);
    setRightTab('script');
  };

  const handleAiBuildWorld = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      if (aiMode === 'edit') {
        const res = await apiFetch<{
          summary: string;
          blocks: BlockPart[];
          scriptCode: string;
        }>('/api/ai/edit-world', {
          method: 'POST',
          body: JSON.stringify({ prompt: aiPrompt, blocks, scriptCode, genre, model: aiModel || undefined }),
        });
        setBlocks(res.blocks);
        setScriptCode(res.scriptCode);
        setConsoleLogs((prev) => [...prev, `[AI Agent] ${res.summary}`]);
        notifyStatus('Scene updated by AI Agent!');
      } else {
        const res = await apiFetch<{
          title: string;
          skyColor: string;
          blocks: BlockPart[];
          scriptCode: string;
        }>('/api/ai/build-world', {
          method: 'POST',
          body: JSON.stringify({ prompt: aiPrompt, genre, model: aiModel || undefined }),
        });
        setTitle(res.title);
        setSkyColor(res.skyColor);
        setBlocks(res.blocks);
        setScriptCode(res.scriptCode);
        setConsoleLogs((prev) => [...prev, `[AI Agent] Built "${res.title}" (${res.blocks.length} parts).`]);
        notifyStatus('AI World Generated!');
      }
      setAiPrompt('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI build failed';
      setConsoleLogs((prev) => [...prev, `[AI Error] ${msg}`]);
      notifyStatus(msg);
    } finally {
      setAiBusy(false);
    }
  };

  const runQaAudit = () => {
    const found: string[] = [];
    if (!blocks.some((b) => b.role === 'spawn')) {
      found.push('Missing SpawnLocation pad (players may fall at origin).');
    }
    if (!blocks.some((b) => b.role === 'coin')) {
      found.push('No collectible coins placed in scene.');
    }
    if (!blocks.some((b) => b.role === 'portal')) {
      found.push('No VictoryPortal finish line placed.');
    }
    const luaCheck = executeAnibloxLua(scriptCode, {
      existingBlocks: blocks,
      onGiveCoins: () => {},
      onGiveXP: () => {},
      onSetCheckpoint: () => {},
      onNotify: () => {},
    });
    if (luaCheck.errors.length > 0) {
      found.push(`Lua syntax/runtime issue: ${luaCheck.errors[0]}`);
    }
    setQaIssues(found);
    setConsoleLogs((prev) => [
      ...prev,
      found.length === 0
        ? `[QA Audit] Passed all checks across ${blocks.length} parts & Lua script.`
        : `[QA Audit] Found ${found.length} issue(s) ready to auto-fix.`,
    ]);
  };

  const applyQaAutoFix = () => {
    let next = [...blocks];
    if (!next.some((b) => b.role === 'spawn')) {
      next.unshift({
        id: `fix_spawn_${Date.now()}`,
        name: 'SpawnLocation',
        shape: 'box',
        position: [0, 0, 0],
        size: [10, 1.2, 10],
        rotation: [0, 0, 0],
        color: '#4B974B',
        material: 'grass',
        role: 'spawn',
        anchored: true,
        canCollide: true,
      });
    }
    if (!next.some((b) => b.role === 'coin')) {
      next.push({
        id: `fix_coin_${Date.now()}`,
        name: 'StarterCoin',
        shape: 'cylinder',
        position: [0, 2.2, -6],
        size: [1.4, 0.4, 1.4],
        rotation: [Math.PI / 2, 0, 0],
        color: '#FBBF24',
        material: 'neon',
        role: 'coin',
        anchored: true,
        canCollide: false,
        value: 25,
        spinSpeed: 2.5,
      });
    }
    if (!next.some((b) => b.role === 'portal')) {
      next.push({
        id: `fix_portal_${Date.now()}`,
        name: 'VictoryPortal',
        shape: 'box',
        position: [0, 3, -18],
        size: [4, 4.5, 0.8],
        rotation: [0, 0, 0],
        color: '#38BDF8',
        material: 'neon',
        role: 'portal',
        anchored: true,
        canCollide: false,
      });
    }
    setBlocks(next);
    setQaIssues([]);
    notifyStatus('Auto-fixed all QA issues!');
  };

  const handleAiWriteScript = async () => {
    setAiBusy(true);
    try {
      const res = await apiFetch<{ scriptCode: string }>('/api/ai/generate-script', {
        method: 'POST',
        body: JSON.stringify({
          prompt: aiPrompt || `Create a rewarding checkpoint and coin trigger script for ${title}`,
          worldTitle: title,
          model: aiModel || undefined,
        }),
      });
      setScriptCode(res.scriptCode);
      setRightTab('script');
      setConsoleLogs((prev) => [...prev, '[AI Script] Generated updated Lua script.']);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI script error';
      setConsoleLogs((prev) => [...prev, `[AI Error] ${msg}`]);
    } finally {
      setAiBusy(false);
    }
  };

  const buildCurrentWorldData = (thumbOverride?: string): WorldData => ({
    ...initialWorld,
    title: title.trim() || 'Untitled World',
    genre,
    skyColor,
    blocks,
    scriptCode,
    isPublished: isPublic,
    thumbnailUrl: thumbOverride || customThumbnailUrl || THUMBNAILS[genre] || initialWorld.thumbnailUrl,
    updatedAt: new Date().toISOString(),
  });

  const captureAndUploadCover = async (): Promise<string | null> => {
    const refs = sceneRefs.current;
    if (!refs) return null;
    const prevSelected = refs.transform.object;
    refs.transform.detach();
    const dataUrl = captureViewportDataUrl(refs.renderer, refs.scene, refs.camera);
    if (prevSelected) refs.transform.attach(prevSelected);
    if (!dataUrl) return null;

    try {
      const up = await apiFetch<{ url: string | null; configured: boolean }>('/api/worlds/thumbnail', {
        method: 'POST',
        body: JSON.stringify({ worldId: initialWorld.id, imageDataUrl: dataUrl }),
      });
      if (up.url) {
        setCustomThumbnailUrl(up.url);
        return up.url;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleSnapCover = async () => {
    setSaving(true);
    const url = await captureAndUploadCover();
    setSaving(false);
    if (url) {
      notifyStatus('3D cover uploaded to Cloudflare R2!');
      setConsoleLogs((prev) => [...prev, `[R2] Cover snapshot uploaded: ${url}`]);
    } else {
      notifyStatus('R2 keys not set in Secrets yet — using starter cover.');
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      const uploadedThumb = await captureAndUploadCover();
      const payload = buildCurrentWorldData(uploadedThumb || undefined);
      const res = await apiFetch<{ id: string; thumbnailUrl?: string; user: UserProfile }>('/api/worlds', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const published: WorldData = {
        ...payload,
        id: res.id,
        thumbnailUrl: res.thumbnailUrl || payload.thumbnailUrl,
        creatorId: user.id,
        creatorName: user.displayName,
      };
      onWorldPublished(published, res.user);
      notifyStatus(uploadedThumb ? 'Published + 3D Cover saved to R2!' : 'Published to Aniblox Cloud!');
      setConsoleLogs((prev) => [
        ...prev,
        `[Cloud] Published "${published.title}" (ID: ${res.id})${uploadedThumb ? ' with R2 cover' : ''}`,
      ]);
    } catch (err) {
      notifyStatus(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const data = JSON.stringify(buildCurrentWorldData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.aniblox.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        if (file.name.endsWith('.lua')) {
          setScriptCode(text);
          setRightTab('script');
          notifyStatus('Synced external .lua script!');
        } else {
          const parsed = JSON.parse(text) as Partial<WorldData>;
          if (Array.isArray(parsed.blocks)) setBlocks(parsed.blocks);
          if (parsed.scriptCode) setScriptCode(parsed.scriptCode);
          if (parsed.title) setTitle(parsed.title);
          if (parsed.skyColor) setSkyColor(parsed.skyColor);
          notifyStatus('Synced external .aniblox.json scene!');
        }
      } catch {
        notifyStatus('Invalid scene or script file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-2027-canvas text-zinc-100 overflow-hidden">
      {/* Studio Top Ribbon */}
      <header className="h-14 border-b border-white/10 bg-black/80 backdrop-blur-xl px-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Exit
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-black border border-white/12 rounded-lg px-2.5 py-1 text-sm font-bold text-white w-44 focus:outline-none focus:border-emerald-400"
          />
          <select
            value={genre}
            onChange={(e) => loadTemplate(e.target.value as WorldGenre | 'baseplate')}
            className="bg-black border border-white/12 rounded-lg px-2 py-1 text-xs text-zinc-200"
            title="Switch Starter Template"
          >
            <option value="sandbox">Template: Baseplate</option>
            <option value="obby">Template: 3-World Obby</option>
            <option value="tycoon">Template: Tycoon</option>
            <option value="simulator">Template: Simulator</option>
            <option value="arena">Template: Arena</option>
          </select>
        </div>

        {/* Transform Tools */}
        <div className="hidden lg:flex items-center gap-1 bg-black/80 p-1 rounded-lg border border-white/12">
          <button
            onClick={() => setGizmoMode('translate')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
              gizmoMode === 'translate' ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Move className="w-3.5 h-3.5" /> Move
          </button>
          <button
            onClick={() => setGizmoMode('scale')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
              gizmoMode === 'scale' ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" /> Scale
          </button>
          <button
            onClick={() => setGizmoMode('rotate')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
              gizmoMode === 'rotate' ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-extrabold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" /> Rotate
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.lua"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold cursor-pointer"
            title="Sync external .json or .lua file"
          >
            <Upload className="w-3.5 h-3.5" /> Sync In
          </button>
          <button
            onClick={handleExportJson}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold cursor-pointer"
            title="Export scene JSON"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            onClick={() => onPlayTest(buildCurrentWorldData())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black text-xs font-extrabold cursor-pointer"
            title="Playtest (F5)"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Play (F5)
          </button>
          <button
            onClick={() => setIsPublic((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
            title="Toggle Public vs Private visibility"
          >
            {isPublic ? 'Public' : 'Private'}
          </button>
          <button
            onClick={handleSnapCover}
            disabled={saving}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-cyan-300 cursor-pointer"
            title="Capture live 3D viewport cover to Cloudflare R2"
          >
            <Camera className="w-3.5 h-3.5" /> Snap Cover
          </button>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 hover:from-amber-300 hover:to-rose-300 disabled:opacity-60 text-black text-xs font-extrabold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </header>

      {/* AI Studio Agent & QA Bar */}
      <div className="border-b border-white/10 bg-[#070709] px-3 py-2 flex flex-wrap items-center gap-2 shrink-0">
        <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
        <div className="flex p-0.5 rounded-lg bg-black border border-white/10 text-[11px] font-semibold">
          <button
            onClick={() => setAiMode('edit')}
            className={`px-2 py-1 rounded cursor-pointer ${aiMode === 'edit' ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-bold' : 'text-zinc-400'}`}
          >
            Edit Scene
          </button>
          <button
            onClick={() => setAiMode('new')}
            className={`px-2 py-1 rounded cursor-pointer ${aiMode === 'new' ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-bold' : 'text-zinc-400'}`}
          >
            New World
          </button>
        </div>
        <select
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          className="bg-black border border-white/12 rounded-lg px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-400"
          title="AI Gateway Provider / Model"
        >
          <option value="">Model: Auto (Gateway/Gemini)</option>
          <option value="google-ai-studio/gemini-4-hydrogen">Gemini 4 Hydrogen</option>
          <option value="workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast">Workers AI Llama 3.3 70B</option>
          <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini (Gateway)</option>
          <option value="anthropic/claude-3-5-sonnet-latest">Claude 3.5 Sonnet (Gateway)</option>
          <option value="groq/llama-3.3-70b-versatile">Groq Llama 3.3 (Gateway)</option>
        </select>
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder={
            aiMode === 'edit'
              ? "AI Agent: e.g. 'Add an animated blimp above Candy World and rotating lava bars'"
              : "AI Agent: e.g. 'Build a 3-stage Tropical, Candy, and Lava Volcano obby'"
          }
          className="flex-1 min-w-[200px] bg-black border border-white/12 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
        />
        <button
          onClick={handleAiBuildWorld}
          disabled={aiBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-50 text-xs font-extrabold text-black cursor-pointer shrink-0"
        >
          <Wand2 className="w-3.5 h-3.5" /> {aiBusy ? 'Working...' : aiMode === 'edit' ? 'Apply AI Edit' : 'Generate World'}
        </button>
        <button
          onClick={runQaAudit}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 cursor-pointer shrink-0"
        >
          AI QA Audit
        </button>
        {statusMsg && (
          <span className="text-xs font-semibold text-emerald-400 px-2 shrink-0">{statusMsg}</span>
        )}
      </div>

      {qaIssues && (
        <div className="border-b border-white/10 bg-[#0D0D10] px-4 py-2 flex items-center justify-between gap-3 text-xs">
          {qaIssues.length === 0 ? (
            <span className="text-emerald-400 font-semibold">
              QA Audit Passed: Spawn, Coins, Finish Portal, and Lua script verified.
            </span>
          ) : (
            <div className="flex items-center gap-3 text-amber-300">
              <span>QA Found {qaIssues.length} issue(s): {qaIssues.join(' ')}</span>
              <button
                onClick={applyQaAutoFix}
                className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold cursor-pointer"
              >
                Auto-Fix All
              </button>
            </div>
          )}
          <button onClick={() => setQaIssues(null)} className="text-zinc-400 hover:text-white cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Studio 3-Column Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Toolbox & Explorer */}
        <aside className="w-60 border-r border-white/10 bg-black/75 backdrop-blur-xl flex flex-col min-h-0 shrink-0">
          <div className="p-2.5 border-b border-white/10">
            <div className="text-xs font-bold text-zinc-300 mb-2">Toolbox Parts</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ASSET_LIBRARY.map((a) => (
                <button
                  key={a.label}
                  onClick={() => addAssetBlock(a)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-black hover:bg-zinc-900 border border-white/10 text-[11px] text-zinc-200 text-left cursor-pointer truncate"
                >
                  <Plus className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="text-xs font-bold text-zinc-300 mt-3 mb-1.5">3D Scenery Props</div>
            <div className="grid grid-cols-2 gap-1.5">
              {COMPOSITE_PROPS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => addCompositeProp(p)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-black hover:bg-zinc-900 border border-white/10 text-[11px] text-emerald-300 text-left cursor-pointer truncate"
                >
                  <Plus className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-300">Workspace ({blocks.length})</span>
            </div>
            <div className="space-y-1">
              {blocks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    b.id === selectedId
                      ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/10 border border-emerald-400/50 text-white'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <span className="truncate">{b.name}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-1">{b.role}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center 3D Viewport */}
        <main className="flex-1 relative bg-black min-w-0">
          <div ref={mountRef} className="w-full h-full" />
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded bg-black/80 backdrop-blur-md border border-white/12 text-[11px] text-zinc-300">
            Click part to select · Drag gizmo to transform · Right-drag to orbit
          </div>
        </main>

        {/* Right Properties & Lua IDE */}
        <aside className="w-80 border-l border-white/10 bg-black/75 backdrop-blur-xl flex flex-col min-h-0 shrink-0">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setRightTab('properties')}
              className={`flex-1 py-2.5 text-xs font-bold cursor-pointer ${
                rightTab === 'properties' ? 'text-white border-b-2 border-emerald-400 bg-white/5' : 'text-zinc-400'
              }`}
            >
              Properties
            </button>
            <button
              onClick={() => setRightTab('script')}
              className={`flex-1 py-2.5 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 ${
                rightTab === 'script' ? 'text-white border-b-2 border-emerald-400 bg-white/5' : 'text-zinc-400'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Lua Script
            </button>
          </div>

          {rightTab === 'properties' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Sky Atmosphere Color</label>
                <input
                  type="color"
                  value={skyColor}
                  onChange={(e) => setSkyColor(e.target.value)}
                  className="w-full h-8 rounded bg-black border border-white/12 cursor-pointer"
                />
              </div>

              {selectedBlock ? (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Selected Part</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={duplicateSelected}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer"
                        title="Duplicate Part"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={deleteSelected}
                        className="p-1.5 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 cursor-pointer"
                        title="Delete Part"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Name (Lua FindFirstChild)</label>
                    <input
                      value={selectedBlock.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="w-full rounded bg-black border border-white/12 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-zinc-400 block mb-1">Shape</label>
                      <select
                        value={selectedBlock.shape}
                        onChange={(e) => updateSelected({ shape: e.target.value as BlockShape })}
                        className="w-full rounded bg-black border border-white/12 px-2 py-1.5 text-white"
                      >
                        <option value="box">Box</option>
                        <option value="wedge">Wedge</option>
                        <option value="cylinder">Cylinder</option>
                        <option value="sphere">Sphere</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Material</label>
                      <select
                        value={selectedBlock.material}
                        onChange={(e) => updateSelected({ material: e.target.value as BlockMaterial })}
                        className="w-full rounded bg-black border border-white/12 px-2 py-1.5 text-white"
                      >
                        <option value="plastic">Stud Plastic</option>
                        <option value="neon">Neon</option>
                        <option value="metal">Metal</option>
                        <option value="glass">Glass</option>
                        <option value="stone">Stone</option>
                        <option value="wood">Wood</option>
                        <option value="grass">Grass</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-zinc-400 block mb-1">Gameplay Role</label>
                      <select
                        value={selectedBlock.role}
                        onChange={(e) => updateSelected({ role: e.target.value as BlockRole })}
                        className="w-full rounded bg-black border border-white/12 px-2 py-1.5 text-white"
                      >
                        <option value="solid">Solid</option>
                        <option value="spawn">Spawn</option>
                        <option value="checkpoint">Checkpoint</option>
                        <option value="crumble">Crumble Platform</option>
                        <option value="hazard">Hazard (Lava)</option>
                        <option value="coin">Coin / Collectible</option>
                        <option value="bounce">Bounce Pad</option>
                        <option value="conveyor">Conveyor</option>
                        <option value="dropper">Tycoon Dropper</option>
                        <option value="portal">Victory Portal</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Color</label>
                      <input
                        type="color"
                        value={selectedBlock.color}
                        onChange={(e) => updateSelected({ color: e.target.value })}
                        className="w-full h-8 rounded bg-black border border-white/12 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Position (X, Y, Z)</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <input
                          key={i}
                          type="number"
                          step="0.5"
                          value={selectedBlock.position[i]}
                          onChange={(e) => {
                            const next: [number, number, number] = [...selectedBlock.position];
                            next[i] = Number(e.target.value) || 0;
                            updateSelected({ position: next });
                          }}
                          className="rounded bg-black border border-white/12 px-2 py-1 text-white tabular-nums"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Size (W, H, D)</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <input
                          key={i}
                          type="number"
                          step="0.5"
                          min="0.4"
                          value={selectedBlock.size[i]}
                          onChange={(e) => {
                            const next: [number, number, number] = [...selectedBlock.size];
                            next[i] = Math.max(0.4, Number(e.target.value) || 1);
                            updateSelected({ size: next });
                          }}
                          className="rounded bg-black border border-white/12 px-2 py-1 text-white tabular-nums"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="text-zinc-300 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBlock.canCollide}
                        onChange={(e) => updateSelected({ canCollide: e.target.checked })}
                      />
                      CanCollide
                    </label>
                    <label className="text-zinc-300 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBlock.patrolAxis === 'x'}
                        onChange={(e) =>
                          updateSelected({
                            patrolAxis: e.target.checked ? 'x' : undefined,
                            patrolRange: e.target.checked ? 4 : undefined,
                          })
                        }
                      />
                      Moving Platform
                    </label>
                  </div>
                </div>
              ) : (
                <div className="text-zinc-500 py-8 text-center">
                  Select a 3D part in the viewport or Workspace list to edit properties.
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-2 border-b border-white/10 flex items-center gap-1.5">
                <button
                  onClick={runLuaInStudio}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-xs font-extrabold text-black cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" /> Run Lua
                </button>
                <button
                  onClick={handleAiWriteScript}
                  disabled={aiBusy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-xs font-extrabold text-black cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> AI Write
                </button>
              </div>
              <textarea
                value={scriptCode}
                onChange={(e) => setScriptCode(e.target.value)}
                spellCheck={false}
                className="flex-1 bg-black text-emerald-200 font-mono text-xs p-3 resize-none focus:outline-none leading-relaxed"
              />
              <div className="h-32 border-t border-white/10 bg-[#050506] p-2 overflow-y-auto font-mono text-[11px] space-y-1">
                <div className="text-zinc-500 font-semibold">Output Console</div>
                {consoleLogs.map((l, idx) => (
                  <div key={idx} className={l.includes('[Error]') ? 'text-rose-400' : 'text-zinc-300'}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
