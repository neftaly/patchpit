import { describe, expect, it } from 'vitest';
import { formatVoiceStatus } from './voice-status';

describe('Infinigen voice status', () => {
  it('formats a concise spoken scene status', () => {
    expect(formatVoiceStatus({
      fps: 72,
      instanceCount: 327,
      message: 'stream complete',
      progress: 1,
      scale: 0.125,
      seed: 'tamaki'
    })).toBe('Infinigen tamaki: stream complete, 100 percent. 327 objects. 72 frames per second. Scale 0.13.');
  });

  it('omits empty seed and progress', () => {
    expect(formatVoiceStatus({
      fps: 0,
      instanceCount: 0,
      message: 'loading',
      progress: undefined,
      scale: 1,
      seed: ''
    })).toBe('Infinigen: loading. 0 objects. 0 frames per second. Scale 1.0.');
  });
});
