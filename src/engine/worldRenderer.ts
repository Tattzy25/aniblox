import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BlockPart } from '../types/aniblox';
import { getProceduralMaterialTexture } from './proceduralTextures';

export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createStudioRenderer(container: HTMLElement) {
  const isSoftwareGl = detectSoftwareGl();
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // Balanced 3-point + sky hemisphere lighting rig
  const hemi = new THREE.HemisphereLight(0xf4f4f5, 0x18181b, 0.72);
  hemi.position.set(0, 60, 0);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.45);
  keyLight.position.set(28, 46, 26);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  const d = 48;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 140;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  rimLight.position.set(-28, 18, -32);
  scene.add(rimLight);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  return { renderer, scene, isSoftwareGl, maxAniso };
}

export function captureViewportDataUrl(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  maxWidth = 960,
  maxHeight = 540
): string | null {
  try {
    renderer.render(scene, camera);
    const srcCanvas = renderer.domElement;
    if (!srcCanvas.width || !srcCanvas.height) return null;

    const scale = Math.min(1, maxWidth / srcCanvas.width, maxHeight / srcCanvas.height);
    const outW = Math.max(320, Math.round(srcCanvas.width * scale));
    const outH = Math.max(180, Math.round(srcCanvas.height * scale));

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(srcCanvas, 0, 0, outW, outH);
    const webp = offscreen.toDataURL('image/webp', 0.85);
    if (webp.startsWith('data:image/webp')) return webp;
    return offscreen.toDataURL('image/jpeg', 0.86);
  } catch {
    return null;
  }
}

function createWedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, -h / 2);
  shape.lineTo(d / 2, -h / 2);
  shape.lineTo(d / 2, h / 2);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w,
    bevelEnabled: false,
  });
  geo.center();
  geo.rotateY(Math.PI / 2);
  return geo;
}

function buildCompositeProp(part: BlockPart): THREE.Group {
  const group = new THREE.Group();
  const [w, h, d] = part.size;

  if (part.compositeType === 'blimp') {
    const hullMat = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.32, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.35, metalness: 0.5 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: '#09090B', roughness: 0.45, metalness: 0.6 });
    const propMat = new THREE.MeshStandardMaterial({ color: '#E4E4E7', roughness: 0.2, metalness: 0.85 });

    // Primary hull
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.38, d * 0.65, 8, 20), hullMat);
    hull.rotation.x = Math.PI / 2;
    hull.castShadow = true;
    group.add(hull);

    // Accent racing stripe
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.39, w * 0.39, d * 0.25, 20), trimMat);
    stripe.rotation.x = Math.PI / 2;
    group.add(stripe);

    // Gondola cabin
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, h * 0.35, d * 0.42), cabinMat);
    gondola.position.set(0, -w * 0.44, 0);
    group.add(gondola);

    // Tail fins
    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.25, w * 0.55, d * 0.22), trimMat);
    vFin.position.set(0, w * 0.28, d * 0.42);
    const hFin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.22, d * 0.2), trimMat);
    hFin.position.set(0, 0, d * 0.42);
    group.add(vFin, hFin);

    // Twin side propellers
    const propellers: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 10), cabinMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * (w * 0.34), -w * 0.38, 0.2);
      const rotor = new THREE.Group();
      rotor.position.set(side * (w * 0.34), -w * 0.38, 0.95);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08), propMat);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.08), propMat);
      rotor.add(b1, b2);
      propellers.push(rotor);
      group.add(pod, rotor);
    }
    group.userData.propellers = propellers;
  } else if (part.compositeType === 'tree') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#78350F', roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: part.color || '#16A34A', roughness: 0.55 });
    const nutMat = new THREE.MeshStandardMaterial({ color: '#451A03', roughness: 0.7 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h * 0.75, 8), trunkMat);
    trunk.position.y = -h * 0.12;
    trunk.castShadow = true;
    group.add(trunk);

    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 3.2), leafMat);
      const ang = (i * Math.PI * 2) / 5;
      frond.position.set(Math.sin(ang) * 1.2, h * 0.28, Math.cos(ang) * 1.2);
      frond.rotation.y = ang;
      frond.rotation.x = 0.32;
      frond.castShadow = true;
      group.add(frond);
    }

    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), nutMat);
    nut.position.set(0.35, h * 0.18, 0.25);
    group.add(nut);
  } else if (part.compositeType === 'lollipop') {
    const stickMat = new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.35 });
    const candyMat = new THREE.MeshStandardMaterial({ color: part.color || '#F472B6', roughness: 0.25, metalness: 0.05 });
    const ringMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.3 });

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h * 0.72, 10), stickMat);
    stick.position.y = -h * 0.14;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.55, 20), candyMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = h * 0.28;
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 8, 24), ringMat);
    swirl.position.set(0, h * 0.28, 0.26);
    const swirlBack = swirl.clone();
    swirlBack.position.z = -0.26;
    group.add(stick, disc, swirl, swirlBack);
  } else if (part.compositeType === 'volcano') {
    const rockMat = new THREE.MeshStandardMaterial({ color: '#27272A', roughness: 0.9 });
    const lavaMat = new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: '#F97316', emissiveIntensity: 1.2, roughness: 0.2 });
    const steamMat = new THREE.MeshStandardMaterial({ color: '#E4E4E7', transparent: true, opacity: 0.45, roughness: 0.9 });

    const cone = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.28, w * 0.85, h, 12), rockMat);
    cone.castShadow = true;
    const lavaPool = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.24, w * 0.24, 0.6, 12), lavaMat);
    lavaPool.position.y = h * 0.48;
    group.add(cone, lavaPool);

    const steamPuffs: THREE.Object3D[] = [];
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.1 + i * 0.25, 10, 10), steamMat);
      puff.position.set((i % 2 === 0 ? 0.6 : -0.6), h * 0.55 + i * 2.1, 0);
      steamPuffs.push(puff);
      group.add(puff);
    }
    group.userData.steamPuffs = steamPuffs;
    group.userData.baseH = h;
  }

  group.name = part.name;
  group.position.set(part.position[0], part.position[1], part.position[2]);
  group.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  group.userData.partId = part.id;
  group.userData.part = part;
  return group;
}

export function buildBlockMesh(part: BlockPart, maxAnisotropy = 4): THREE.Object3D {
  if (part.compositeType) {
    return buildCompositeProp(part);
  }

  const [w, h, d] = part.size;
  let geo: THREE.BufferGeometry;

  if (part.shape === 'cylinder') {
    const radius = Math.max(w, d) / 2;
    geo = new THREE.CylinderGeometry(radius, radius, h, 20);
  } else if (part.shape === 'sphere') {
    const radius = Math.max(w, h, d) / 2;
    geo = new THREE.SphereGeometry(radius, 20, 16);
  } else if (part.shape === 'wedge') {
    geo = createWedgeGeometry(w, h, d);
  } else {
    geo = new THREE.BoxGeometry(w, h, d);
  }

  const baseTex = getProceduralMaterialTexture(part.material, maxAnisotropy);
  const tex = baseTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(d / 4)));

  let mat: THREE.Material;
  if (part.material === 'glass') {
    mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(part.color),
      map: tex,
      roughness: 0.12,
      metalness: 0.08,
      transparent: true,
      opacity: 0.55,
      clearcoat: 0.9,
    });
  } else if (part.material === 'neon') {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color),
      emissive: new THREE.Color(part.color),
      emissiveIntensity: 0.65,
      map: tex,
      roughness: 0.25,
      metalness: 0.1,
    });
  } else if (part.material === 'metal') {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color),
      map: tex,
      roughness: 0.26,
      metalness: 0.85,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color),
      map: tex,
      roughness: part.material === 'stone' || part.material === 'wood' ? 0.78 : 0.46,
      metalness: 0.04,
    });
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = part.name;
  mesh.position.set(part.position[0], part.position[1], part.position[2]);
  mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  mesh.castShadow = part.material !== 'glass';
  mesh.receiveShadow = true;
  mesh.userData.partId = part.id;
  mesh.userData.part = part;
  return mesh;
}

export function createNameplateSprite(name: string, speaking = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = speaking ? 'rgba(16, 185, 129, 0.92)' : 'rgba(5, 5, 7, 0.85)';
  ctx.beginPath();
  ctx.roundRect(16, 10, 224, 44, 12);
  ctx.fill();
  ctx.strokeStyle = speaking ? '#34D399' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((speaking ? 'MIC · ' : '') + name.slice(0, 16), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.8, 1);
  return sprite;
}

export function schedulePacedLoop(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  onFrame: () => void
): () => void {
  let active = true;
  let frameId = 0;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!active) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick() {
    if (!active) return;
    onFrame();
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  frameId = requestAnimationFrame(tick);

  return () => {
    active = false;
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  };
}
