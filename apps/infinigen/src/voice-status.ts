export type VoiceStatusSnapshot = {
  readonly fps: number;
  readonly instanceCount: number;
  readonly message: string;
  readonly progress: number | undefined;
  readonly scale: number;
  readonly seed: string;
};

export function formatVoiceStatus(snapshot: VoiceStatusSnapshot): string {
  const seed = snapshot.seed.trim() === '' ? '' : ` ${snapshot.seed}`;
  const progress = snapshot.progress === undefined ? '' : `, ${Math.round(snapshot.progress * 100)} percent`;

  return `Infinigen${seed}: ${snapshot.message}${progress}. ${snapshot.instanceCount} objects. ${snapshot.fps} frames per second. Scale ${formatScale(snapshot.scale)}.`;
}

function formatScale(scale: number): string {
  if (scale >= 1) {
    return scale.toFixed(1);
  }

  if (scale >= 0.01) {
    return scale.toFixed(2);
  }

  return scale.toFixed(3);
}
