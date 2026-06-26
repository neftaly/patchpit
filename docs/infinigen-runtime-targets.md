# Infinigen Runtime Targets

Patchpit's Infinigen viewer should stay usable on constrained devices while
leaving a path to high-quality local rendering.

## Minimum Targets

- iPad-class A10 or newer device with at least 6 GB RAM.
- Meta Quest 2 through browser/WebXR.
- Desktop browser with WebGL2 or a WebGL1 fallback for the first prototype.

## Recommended Development Target

- HP Omen 15-inch laptop.
- NVIDIA RTX 3060.
- Ubuntu.
- 1080p at 144 Hz as the guaranteed local baseline.
- 4K at 144 Hz as the quality target, not a first-pass guarantee.

## Operator Notes

- Keep controls usable with imperfect keyboards and pointing devices.
- Treat Quest 2 as a draw-call, fill-rate, and memory budget target early:
  prefer instancing, bounded stream events, progressive loading, and simple
  fallback materials before adding expensive material features.
- Use `quality` as the current capability ladder:
  - `balanced`: Quest 2 and iPad-class devices.
  - `high`: default desktop profile.
  - `ultra`: local stress profile for the RTX 3060 machine.
- Quest 2 is visible over USB on this machine, but live browser inspection
  still needs an ADB or browser-remote-debugging path.
