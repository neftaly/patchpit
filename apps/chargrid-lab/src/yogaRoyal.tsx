import {
  box,
  checkerImage,
  gltfPreview,
  snapImageToCells,
  type CellGrid,
  type LayoutSpec
} from './royalChargridPrimitives';

export const desktopGrid = { columns: 72, rows: 34 } satisfies CellGrid;
export const mobileGrid = { columns: 36, rows: 58 } satisfies CellGrid;
export const imageRequest = {
  widthPx: 293,
  heightPx: 137,
  chPx: 9,
  linePx: 18
};
export const cellPixelAspect = imageRequest.chPx / imageRequest.linePx;
export const imageSnap = snapImageToCells(imageRequest);

export const helmetBounds = {
  min: [-0.9474585652351379, -0.9009741103874731, -1.187155129805747],
  max: [0.9424954056739807, 0.9009951350576428, 0.8128451260791926]
} as const;

export const helmetSrc = `${import.meta.env.BASE_URL}DamagedHelmet/DamagedHelmet.gltf`;

export function createKitchenSinkSpec(compact: boolean): LayoutSpec {
  return box({
    id: 'root',
    label: 'root',
    tone: 'root',
    direction: 'column',
    gap: 1,
    children: [
      toolbar(),
      box({
        id: 'deck',
        label: 'deck',
        tone: 'root',
        grow: 1,
        direction: compact ? 'column' : 'row',
        gap: 1,
        children: [controlPanel(compact), mediaPanel(), logPanel(compact)]
      })
    ]
  });
}

function toolbar(): LayoutSpec {
  return box({
    id: 'toolbar',
    label: 'tui bar',
    tone: 'accent',
    height: 3,
    direction: 'row',
    gap: 1,
    children: [
      box({
        id: 'tab-run',
        interaction: action('Run tab', 'tab', 'toolbar'),
        label: 'run',
        text: 'run',
        tone: 'panel',
        width: 10
      }),
      box({
        id: 'tab-edit',
        interaction: action('Edit tab', 'tab', 'toolbar'),
        label: 'edit',
        text: 'edit',
        tone: 'panel',
        width: 10
      }),
      box({
        id: 'status',
        label: 'ready',
        text: 'ready',
        tone: 'muted',
        grow: 1
      })
    ]
  });
}

function controlPanel(compact: boolean): LayoutSpec {
  return box({
    id: 'controls',
    label: 'controls',
    tone: 'panel',
    ...(compact ? { height: 15 } : { width: 21 }),
    direction: 'column',
    gap: 1,
    children: [
      box({
        id: 'select-row',
        interaction: action('Palette select', 'select', 'controls'),
        label: 'palette',
        text: 'palette',
        tone: 'root',
        height: 3
      }),
      box({
        id: 'switch-row',
        interaction: action('Snap toggle', 'checkbox', 'controls'),
        label: 'snap',
        text: 'snap',
        tone: 'root',
        height: 3
      }),
      box({
        id: 'button-primary',
        interaction: action('Apply button', 'button', 'controls'),
        label: 'apply',
        text: 'apply',
        tone: 'accent',
        height: 3
      }),
      box({
        id: 'button-secondary',
        interaction: action('Reset button', 'button', 'controls'),
        label: 'reset',
        text: 'reset',
        tone: 'muted',
        height: 3
      })
    ]
  });
}

function mediaPanel(): LayoutSpec {
  return box({
    id: 'media-panel',
    label: 'media',
    tone: 'overlay',
    grow: 1,
    direction: 'column',
    gap: 1,
    children: [
      gltfPreview({
        id: 'helmet',
        interaction: action('Helmet geometry', 'media', 'media'),
        label: 'gltf',
        grow: 1,
        gltf: {
          bounds: helmetBounds,
          cellAspect: cellPixelAspect,
          src: helmetSrc
        }
      }),
      checkerImage({
        id: 'image',
        interaction: action('Pixel tile', 'media', 'media'),
        label: 'px',
        text: 'px',
        width: imageSnap.columns,
        height: imageSnap.rows
      })
    ]
  });
}

function logPanel(compact: boolean): LayoutSpec {
  return box({
    id: 'log',
    label: 'log',
    tone: 'panel',
    ...(compact ? { height: 11 } : { width: 15 }),
    direction: 'column',
    gap: 1,
    children: [
      box({
        id: 'log-a',
        label: 'pick',
        text: 'pick',
        tone: 'muted',
        height: 3
      }),
      box({
        id: 'log-b',
        label: 'focus',
        text: 'focus',
        tone: 'muted',
        height: 3
      }),
      box({
        id: 'log-c',
        label: 'frame',
        text: 'frame',
        tone: 'muted',
        height: 3
      })
    ]
  });
}

function action(label: string, role: 'button' | 'checkbox' | 'media' | 'select' | 'tab', group: string) {
  return { group, label, role };
}
