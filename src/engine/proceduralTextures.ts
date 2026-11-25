import * as THREE from 'three';
import type { BlockMaterial, FaceStyle } from '../types/aniblox';

const textureCache = new Map<string, THREE.CanvasTexture>();

export function getProceduralMaterialTexture(
  material: BlockMaterial,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const key = `${material}_${maxAnisotropy}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (material === 'plastic' || material === 'grass') {
    // Classic Roblox-style subtle stud grid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const cells = 4;
    const step = size / cells;
    for (let gx = 0; gx < cells; gx++) {
      for (let gy = 0; gy < cells; gy++) {
        const cx = gx * step + step / 2;
        const cy = gy * step + step / 2;
        const r = step * 0.28;

        ctx.beginPath();
        ctx.arc(cx + 2, cy + 2, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else if (material === 'stone') {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 420; i++) {
      const x = (i * 73) % size;
      const y = (i * 137) % size;
      const w = 6 + (i % 14);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, w, w);
    }
  } else if (material === 'wood') {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, y, size, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + 30, size, 2);
    }
  } else if (material === 'metal') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 3;
    for (let x = 0; x < size; x += 32) {
      for (let y = 0; y < size; y += 32) {
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + 24, y + 24);
        ctx.stroke();
      }
    }
  } else if (material === 'neon') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, size - 16, size - 16);
  } else {
    // Glass
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(20, size - 20);
    ctx.lineTo(size - 20, 20);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

export function drawFaceCanvas(
  canvas: HTMLCanvasElement,
  style: FaceStyle,
  mouthOpen = 0
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#09090B';
  ctx.strokeStyle = '#09090B';
  ctx.lineCap = 'round';

  if (style === 'cool') {
    // Stylized shades
    ctx.fillStyle = '#09090B';
    ctx.fillRect(w * 0.14, h * 0.3, w * 0.31, h * 0.17);
    ctx.fillRect(w * 0.55, h * 0.3, w * 0.31, h * 0.17);
    ctx.fillRect(w * 0.43, h * 0.34, w * 0.14, h * 0.06);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.fillRect(w * 0.18, h * 0.33, w * 0.1, h * 0.05);
    ctx.fillRect(w * 0.59, h * 0.33, w * 0.1, h * 0.05);
  } else if (style === 'ninja') {
    // Sharp eyes
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.35);
    ctx.lineTo(w * 0.42, h * 0.4);
    ctx.lineTo(w * 0.22, h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.8, h * 0.35);
    ctx.lineTo(w * 0.58, h * 0.4);
    ctx.lineTo(w * 0.78, h * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'hyper') {
    // Wide star-sparkle eyes
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.ellipse(w * 0.33, h * 0.38, w * 0.075, h * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.67, h * 0.38, w * 0.075, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.31, h * 0.35, w * 0.028, 0, Math.PI * 2);
    ctx.arc(w * 0.65, h * 0.35, w * 0.028, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Classic happy eyes
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.ellipse(w * 0.34, h * 0.38, w * 0.06, h * 0.085, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.66, h * 0.38, w * 0.06, h * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.325, h * 0.355, w * 0.02, 0, Math.PI * 2);
    ctx.arc(w * 0.645, h * 0.355, w * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth with real-time lip-sync support
  if (mouthOpen > 0.08) {
    ctx.fillStyle = '#1E1B18';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.67, w * 0.14, h * (0.04 + mouthOpen * 0.09), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.7, w * 0.08, h * (0.02 + mouthOpen * 0.03), 0, 0, Math.PI);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = w * 0.045;
    ctx.beginPath();
    if (style === 'cool' || style === 'ninja') {
      ctx.moveTo(w * 0.36, h * 0.68);
      ctx.quadraticCurveTo(w * 0.52, h * 0.72, w * 0.65, h * 0.63);
    } else {
      ctx.arc(w * 0.5, h * 0.56, w * 0.17, 0.25 * Math.PI, 0.75 * Math.PI);
    }
    ctx.stroke();
  }
}

let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSfx(type: 'jump' | 'coin' | 'checkpoint' | 'hazard' | 'bounce' | 'click') {
  const ctx = getAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'jump') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'coin') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1318, now + 0.06);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.22);
  } else if (type === 'checkpoint') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.setValueAtTime(659, now + 0.07);
    osc.frequency.setValueAtTime(784, now + 0.14);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.32);
  } else if (type === 'hazard') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.start(now);
    osc.stop(now + 0.25);
  } else if (type === 'bounce') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.18);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.22);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}
