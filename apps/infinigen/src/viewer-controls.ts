export type StickAxes = {
  readonly x: number;
  readonly y: number;
};

export type ControllerStickAxes = {
  readonly hasInput: boolean;
  readonly left: StickAxes;
  readonly right: StickAxes;
};

export type GamepadControls = {
  readonly connected: boolean;
  readonly left: StickAxes;
  readonly right: StickAxes;
  readonly zoom: number;
};

export type XrInputSourceLike = {
  readonly gamepad?: {
    readonly axes: ArrayLike<number>;
  } | null | undefined;
  readonly handedness?: 'left' | 'none' | 'right' | undefined;
};

const defaultDeadZone = 0.12;
const zeroStick: StickAxes = { x: 0, y: 0 };

export function readGamepadAxis(gamepad: Pick<Gamepad, 'axes'>, index: number, deadZone = defaultDeadZone): number {
  const value = gamepad.axes[index] ?? 0;

  return Math.abs(value) < deadZone ? 0 : value;
}

export function readGamepadControls(gamepads: readonly (Gamepad | null)[]): GamepadControls {
  const gamepad = gamepads.find((item) => item !== null && item.connected && isRecentlyUsableGamepad(item)) ?? null;

  if (gamepad === null) {
    return {
      connected: false,
      left: zeroStick,
      right: zeroStick,
      zoom: 0
    };
  }

  const left = chooseStick(gamepad.axes, [0, 1], [2, 3]);
  const right = chooseStick(gamepad.axes, [2, 3], [3, 4], [4, 5]);
  const leftTrigger = readButton(gamepad, 6);
  const rightTrigger = readButton(gamepad, 7);
  const axisZoom = readAxis(gamepad.axes, 5);
  const triggerZoom = rightTrigger - leftTrigger;

  return {
    connected: true,
    left,
    right,
    zoom: Math.abs(triggerZoom) >= defaultDeadZone ? triggerZoom : axisZoom
  };
}

export function readXrControllerAxes(inputSources: Iterable<XrInputSourceLike>): ControllerStickAxes {
  let left = zeroStick;
  let right = zeroStick;

  for (const inputSource of inputSources) {
    if (inputSource.gamepad === undefined || inputSource.gamepad === null) {
      continue;
    }

    const stick = readPrimaryStick(inputSource.gamepad.axes);

    if (stick.x === 0 && stick.y === 0) {
      continue;
    }

    if (inputSource.handedness === 'left') {
      left = stick;
    } else if (inputSource.handedness === 'right') {
      right = stick;
    } else if (left.x === 0 && left.y === 0) {
      left = stick;
    } else {
      right = stick;
    }
  }

  return {
    hasInput: left.x !== 0 || left.y !== 0 || right.x !== 0 || right.y !== 0,
    left,
    right
  };
}

function readPrimaryStick(axes: ArrayLike<number>): StickAxes {
  return chooseStick(axes, [2, 3], [0, 1], [3, 4], [4, 5]);
}

function chooseStick(axes: ArrayLike<number>, ...candidates: readonly (readonly [number, number])[]): StickAxes {
  let best = zeroStick;

  for (const [xIndex, yIndex] of candidates) {
    const stick = {
      x: readAxis(axes, xIndex),
      y: readAxis(axes, yIndex)
    };

    if (magnitude(stick) > magnitude(best)) {
      best = stick;
    }
  }

  return best;
}

function readAxis(axes: ArrayLike<number>, index: number): number {
  const value = axes[index] ?? 0;

  return Math.abs(value) < defaultDeadZone ? 0 : value;
}

function readButton(gamepad: Pick<Gamepad, 'buttons'>, index: number): number {
  const value = gamepad.buttons[index]?.value ?? 0;

  return Math.abs(value) < defaultDeadZone ? 0 : value;
}

function isRecentlyUsableGamepad(gamepad: Gamepad): boolean {
  return gamepad.timestamp > 0 || gamepad.axes.some((axis) => Math.abs(axis) >= defaultDeadZone) || gamepad.buttons.some((button) => button.pressed || button.value > 0);
}

function magnitude(stick: StickAxes): number {
  return stick.x * stick.x + stick.y * stick.y;
}
