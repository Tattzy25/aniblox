import * as THREE from 'three';
import type { AnimPack, AvatarConfig, MarketplaceItem } from '../types/aniblox';
import { drawFaceCanvas } from './proceduralTextures';

export interface AvatarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  accessoryGroup: THREE.Group;
  faceCanvas: HTMLCanvasElement;
  faceTexture: THREE.CanvasTexture;
  dispose: () => void;
}

function makePartMat(color: string, roughness = 0.42, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
  });
}

export function createAvatarRig(
  config: AvatarConfig,
  catalogItems: MarketplaceItem[] = []
): AvatarRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const skinMat = makePartMat(config.skinColor, 0.38, 0.04);
  const torsoMat = makePartMat(config.torsoColor, 0.45, 0.08);
  const lArmMat = makePartMat(config.leftArmColor, 0.4, 0.05);
  const rArmMat = makePartMat(config.rightArmColor, 0.4, 0.05);
  const lLegMat = makePartMat(config.leftLegColor, 0.5, 0.04);
  const rLegMat = makePartMat(config.rightLegColor, 0.5, 0.04);

  // Legs (height 1.2, hip pivot at y = 1.2)
  const legGeo = new THREE.BoxGeometry(0.55, 1.2, 0.58);
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.3, 1.2, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, lLegMat);
  leftLegMesh.position.set(0, -0.6, 0);
  leftLegMesh.castShadow = true;
  leftLegPivot.add(leftLegMesh);
  bodyPivot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.3, 1.2, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, rLegMat);
  rightLegMesh.position.set(0, -0.6, 0);
  rightLegMesh.castShadow = true;
  rightLegPivot.add(rightLegMesh);
  bodyPivot.add(rightLegPivot);

  // Torso (height 1.35, centered at y = 1.875)
  const torsoGeo = new THREE.BoxGeometry(1.22, 1.35, 0.65);
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.position.set(0, 1.875, 0);
  torsoMesh.castShadow = true;
  bodyPivot.add(torsoMesh);

  // Subtle torso chest emblem accent
  const emblemGeo = new THREE.BoxGeometry(0.45, 0.45, 0.06);
  const emblemMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.4,
    transparent: true,
    opacity: 0.22,
  });
  const emblem = new THREE.Mesh(emblemGeo, emblemMat);
  emblem.position.set(0, 2.0, 0.34);
  bodyPivot.add(emblem);

  // Arms (height 1.25, shoulder pivot at y = 2.48)
  const armGeo = new THREE.BoxGeometry(0.5, 1.25, 0.54);
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.9, 2.45, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, lArmMat);
  leftArmMesh.position.set(0, -0.52, 0);
  leftArmMesh.castShadow = true;
  leftArmPivot.add(leftArmMesh);
  bodyPivot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.9, 2.45, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, rArmMat);
  rightArmMesh.position.set(0, -0.52, 0);
  rightArmMesh.castShadow = true;
  rightArmPivot.add(rightArmMesh);
  bodyPivot.add(rightArmPivot);

  // Head (rounded cylinder/box hybrid at y = 3.0)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 2.6, 0);
  const headGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.88, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.set(0, 0.48, 0);
  headMesh.castShadow = true;
  headPivot.add(headMesh);

  // Face canvas plane
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 128;
  faceCanvas.height = 128;
  drawFaceCanvas(faceCanvas, config.faceStyle, 0);
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true });
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), faceMat);
  facePlane.position.set(0, 0.48, 0.57);
  headPivot.add(facePlane);

  bodyPivot.add(headPivot);

  // Accessories group
  const accessoryGroup = new THREE.Group();
  bodyPivot.add(accessoryGroup);

  attachAccessories(accessoryGroup, headPivot, torsoMesh, rightArmPivot, config.accessories, catalogItems);

  const s = Math.max(0.75, Math.min(1.3, config.scale || 1));
  root.scale.set(s, s, s);

  return {
    root,
    bodyPivot,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    accessoryGroup,
    faceCanvas,
    faceTexture,
    dispose: () => {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
      faceTexture.dispose();
    },
  };
}

function attachAccessories(
  accessoryGroup: THREE.Group,
  headPivot: THREE.Group,
  _torsoMesh: THREE.Mesh,
  rightArmPivot: THREE.Group,
  accessoryIds: string[],
  catalogItems: MarketplaceItem[]
) {
  const itemLookup = new Map(catalogItems.map((i) => [i.id, i]));

  for (const id of accessoryIds) {
    const meta = itemLookup.get(id);
    const key = meta?.assetKey || id;
    const primaryColor = meta?.color || '#38BDF8';
    const accentColor = meta?.accentColor || '#F59E0B';

    if (key.includes('visor')) {
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(1.16, 0.34, 0.28),
        new THREE.MeshPhysicalMaterial({
          color: primaryColor,
          emissive: primaryColor,
          emissiveIntensity: 0.35,
          roughness: 0.15,
          metalness: 0.7,
          transparent: true,
          opacity: 0.85,
        })
      );
      visor.position.set(0, 0.56, 0.49);
      headPivot.add(visor);
    } else if (key.includes('crown')) {
      const crownGroup = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.56, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.85, roughness: 0.2 })
      );
      crownGroup.add(base);
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.3, 4),
          new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.9, roughness: 0.18 })
        );
        spike.position.set(Math.cos(ang) * 0.44, 0.24, Math.sin(ang) * 0.44);
        crownGroup.add(spike);
      }
      crownGroup.position.set(0, 1.02, 0);
      headPivot.add(crownGroup);
    } else if (key.includes('valkyrie')) {
      const helm = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.45, 1.18),
        new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.75, roughness: 0.25 })
      );
      helm.position.set(0, 0.85, 0);
      headPivot.add(helm);
      const wingGeo = new THREE.BoxGeometry(0.12, 0.7, 0.45);
      const wingMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.3 });
      const wL = new THREE.Mesh(wingGeo, wingMat);
      wL.position.set(-0.66, 0.95, -0.05);
      wL.rotation.z = 0.35;
      const wR = new THREE.Mesh(wingGeo, wingMat);
      wR.position.set(0.66, 0.95, -0.05);
      wR.rotation.z = -0.35;
      headPivot.add(wL, wR);
    } else if (key.includes('jetpack')) {
      const pack = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.95, 0.42),
        new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.75, roughness: 0.28 })
      );
      pack.add(body);
      const thrusterGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.75, 10);
      const coreMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.65, roughness: 0.2 });
      const tL = new THREE.Mesh(thrusterGeo, coreMat);
      tL.position.set(-0.26, -0.1, -0.08);
      const tR = new THREE.Mesh(thrusterGeo, coreMat);
      tR.position.set(0.26, -0.1, -0.08);
      pack.add(tL, tR);
      pack.position.set(0, 1.9, -0.54);
      accessoryGroup.add(pack);
    } else if (key.includes('wings')) {
      const wGroup = new THREE.Group();
      const wMat = new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.3, roughness: 0.35 });
      const tipMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.4, roughness: 0.25 });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 0.1), wMat);
        wing.position.set(side * 0.8, 2.05, -0.45);
        wing.rotation.y = side * -0.45;
        wing.rotation.z = side * 0.22;
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.12), tipMat);
        tip.position.set(side * 1.35, 2.2, -0.68);
        tip.rotation.y = side * -0.45;
        wGroup.add(wing, tip);
      }
      accessoryGroup.add(wGroup);
    } else if (key.includes('cape')) {
      const cape = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 1.5, 0.08),
        new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.78, metalness: 0.05 })
      );
      cape.position.set(0, 1.72, -0.42);
      cape.rotation.x = 0.14;
      accessoryGroup.add(cape);
    } else if (key.includes('blade')) {
      const bladeGroup = new THREE.Group();
      const hilt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.8, roughness: 0.2 })
      );
      hilt.rotation.x = Math.PI / 2;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.18, 1.35),
        new THREE.MeshStandardMaterial({ color: primaryColor, emissive: primaryColor, emissiveIntensity: 0.7, roughness: 0.15 })
      );
      blade.position.set(0, 0, 0.82);
      bladeGroup.add(hilt, blade);
      bladeGroup.position.set(0, -1.05, 0.2);
      rightArmPivot.add(bladeGroup);
    } else if (key.includes('halo')) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.56, 0.07, 10, 24),
        new THREE.MeshStandardMaterial({ color: primaryColor, emissive: primaryColor, emissiveIntensity: 0.85, roughness: 0.15 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 1.24, 0);
      headPivot.add(halo);
    }
  }
}

export function animateAvatarRig(
  rig: AvatarRig,
  dt: number,
  state: 'idle' | 'walk' | 'run' | 'jump' | 'dance',
  animPack: AnimPack,
  time: number,
  speaking: boolean,
  faceStyle: AvatarConfig['faceStyle']
) {
  const k = 1 - Math.exp(-14 * dt);
  let lLegTarget = 0;
  let rLegTarget = 0;
  let lArmTarget = 0;
  let rArmTarget = 0;
  let lArmZ = 0.05;
  let rArmZ = -0.05;
  let bodyY = 0;
  let bodyTilt = 0;

  if (state === 'walk' || state === 'run') {
    const freq = state === 'run' ? 12 : 8;
    const amp = state === 'run' ? 0.85 : 0.55;
    const s = Math.sin(time * freq);
    lLegTarget = s * amp;
    rLegTarget = -s * amp;
    lArmTarget = -s * amp * 0.9;
    rArmTarget = s * amp * 0.9;
    if (animPack === 'ninja') {
      lArmTarget = -0.9;
      rArmTarget = -0.9;
      bodyTilt = 0.24;
    } else if (animPack === 'hero') {
      bodyY = Math.abs(Math.cos(time * freq)) * 0.08;
    }
  } else if (state === 'jump') {
    lArmTarget = -2.4;
    rArmTarget = -2.4;
    lLegTarget = 0.35;
    rLegTarget = -0.25;
  } else if (state === 'dance') {
    lArmTarget = -1.6 + Math.sin(time * 8) * 0.6;
    rArmTarget = -1.6 - Math.sin(time * 8) * 0.6;
    lArmZ = 0.5 + Math.cos(time * 6) * 0.25;
    rArmZ = -0.5 - Math.cos(time * 6) * 0.25;
    lLegTarget = Math.sin(time * 6) * 0.35;
    rLegTarget = -Math.sin(time * 6) * 0.35;
    bodyY = Math.abs(Math.sin(time * 6)) * 0.18;
  } else {
    // Idle
    const breath = Math.sin(time * 2.2) * 0.04;
    lArmTarget = breath;
    rArmTarget = -breath;
    if (animPack === 'levitate') {
      bodyY = 0.25 + Math.sin(time * 2.6) * 0.14;
      lLegTarget = 0.15;
      rLegTarget = -0.1;
    } else if (animPack === 'hero') {
      lArmZ = 0.18;
      rArmZ = -0.18;
    }
  }

  rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, lLegTarget, k);
  rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, rLegTarget, k);
  rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, lArmTarget, k);
  rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, rArmTarget, k);
  rig.leftArmPivot.rotation.z = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.z, lArmZ, k);
  rig.rightArmPivot.rotation.z = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.z, rArmZ, k);
  rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, bodyY, k);
  rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, bodyTilt, k);

  // Real-time lip-sync mouth update when speaking
  const mouthOpen = speaking ? 0.35 + Math.abs(Math.sin(time * 16)) * 0.65 : 0;
  drawFaceCanvas(rig.faceCanvas, faceStyle, mouthOpen);
  rig.faceTexture.needsUpdate = true;
}
