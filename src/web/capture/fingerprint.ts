import type { Fingerprint } from '../../shared/types';

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function canvasData(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 5, 80, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Biometrie demo 1.0', 4, 15);
    ctx.strokeStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.arc(150, 25, 15, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL() || 'no-canvas';
  } catch {
    return 'no-canvas';
  }
}

async function sha256Hex(s: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return simpleHash(s);
  try {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return simpleHash(s);
  }
}

const orUnknown = (v: string | undefined | null): string => (v ? v : 'unknown');

export async function collectFingerprint(): Promise<Fingerprint> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const scr = typeof screen !== 'undefined' ? screen : undefined;
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  return {
    userAgent: orUnknown(nav?.userAgent),
    platform: orUnknown(nav?.platform),
    language: orUnknown(nav?.language),
    screen: scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : 'unknown',
    timezone: orUnknown(timezone),
    canvasHash: await sha256Hex(canvasData()),
  };
}
