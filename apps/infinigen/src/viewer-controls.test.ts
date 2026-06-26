import { describe, expect, it } from 'vitest';
import { readGamepadAxis, readXrControllerAxes } from './viewer-controls';

describe('Infinigen viewer controls', () => {
  it('applies a dead zone to regular gamepad axes', () => {
    expect(readGamepadAxis({ axes: [0.04, -0.2] }, 0)).toBe(0);
    expect(readGamepadAxis({ axes: [0.04, -0.2] }, 1)).toBe(-0.2);
  });

  it('reads Quest-style thumbstick axes from XR input sources', () => {
    expect(readXrControllerAxes([
      { handedness: 'left', gamepad: { axes: [0, 0, 0.5, -0.75] } },
      { handedness: 'right', gamepad: { axes: [0, 0, -0.4, 0.8] } }
    ])).toEqual({
      hasInput: true,
      left: { x: 0.5, y: -0.75 },
      right: { x: -0.4, y: 0.8 }
    });
  });

  it('falls back to low-index axes for browsers that map sticks there', () => {
    expect(readXrControllerAxes([
      { handedness: 'left', gamepad: { axes: [0.3, -0.6, 0, 0] } }
    ])).toEqual({
      hasInput: true,
      left: { x: 0.3, y: -0.6 },
      right: { x: 0, y: 0 }
    });
  });

  it('accepts offset XR axis pairs from browser-specific mappings', () => {
    expect(readXrControllerAxes([
      { handedness: 'right', gamepad: { axes: [0, 0, 0, -0.5, 0.7] } }
    ])).toEqual({
      hasInput: true,
      left: { x: 0, y: 0 },
      right: { x: -0.5, y: 0.7 }
    });
  });
});
