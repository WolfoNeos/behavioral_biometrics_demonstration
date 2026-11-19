import type { OrientationReading } from '../../shared/types';

type OrientationCtor = { requestPermission?: () => Promise<string> };

export async function requestOrientation(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unavailable';
  const ctor = DeviceOrientationEvent as unknown as OrientationCtor;
  if (typeof ctor.requestPermission === 'function') {
    try {
      return (await ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

export function collectOrientation(durationMs: number): Promise<OrientationReading[]> {
  return new Promise((resolve) => {
    const readings: OrientationReading[] = [];
    const onEvent = (e: Event): void => {
      const { alpha, beta, gamma } = e as DeviceOrientationEvent;
      if (beta === null || beta === undefined || !Number.isFinite(beta)) return;
      readings.push({ alpha: alpha ?? 0, beta, gamma: gamma ?? 0 });
    };
    window.addEventListener('deviceorientation', onEvent);
    setTimeout(() => {
      window.removeEventListener('deviceorientation', onEvent);
      resolve(readings);
    }, durationMs);
  });
}
