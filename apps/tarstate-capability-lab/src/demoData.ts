import type { CapabilityLabRows } from './store';

export const demoRows: CapabilityLabRows = {
  resources: [
    {
      resourceId: 'res-viewport-main',
      kind: 'viewport',
      adapter: 'browser.viewport',
      label: 'Window viewport',
      status: 'active'
    },
    {
      resourceId: 'res-fullscreen-shell',
      kind: 'fullscreen-target',
      adapter: 'browser.fullscreen',
      label: 'Shell fullscreen target',
      status: 'idle'
    },
    {
      resourceId: 'res-media-camera',
      kind: 'media-stream',
      adapter: 'runtime.mediaStream',
      label: 'Camera media stream',
      status: 'idle'
    },
    {
      resourceId: 'res-renderer-main',
      kind: 'renderer',
      adapter: 'runtime.webglRenderer',
      label: 'Main renderer',
      status: 'idle'
    },
    {
      resourceId: 'res-socket-feed',
      kind: 'socket',
      adapter: 'runtime.socket',
      label: 'Feed socket',
      status: 'closed'
    },
    {
      resourceId: 'res-worker-index',
      kind: 'worker',
      adapter: 'runtime.worker',
      label: 'Index worker',
      status: 'closed'
    },
    {
      resourceId: 'res-lock-document',
      kind: 'lock',
      adapter: 'runtime.lock',
      label: 'Document lock',
      status: 'idle'
    },
    {
      resourceId: 'res-pointer-stage',
      kind: 'pointer-stream',
      adapter: 'runtime.pointerCoalescer',
      label: 'Stage pointer stream',
      status: 'active'
    }
  ],
  capabilities: [
    {
      capabilityId: 'cap-viewport-read',
      resourceId: 'res-viewport-main',
      kind: 'viewport.read',
      canIssueIntents: false,
      canReadRows: true,
      description: 'Viewport metrics are rows, not a Window handle.'
    },
    {
      capabilityId: 'cap-fullscreen-control',
      resourceId: 'res-fullscreen-shell',
      kind: 'fullscreen.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'Fullscreen is requested via intents and observed via fullscreen rows.'
    },
    {
      capabilityId: 'cap-media-control',
      resourceId: 'res-media-camera',
      kind: 'media.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'MediaStream stays behind an opaque resource id.'
    },
    {
      capabilityId: 'cap-renderer-control',
      resourceId: 'res-renderer-main',
      kind: 'renderer.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'WebGL context and renderer objects are runtime-private.'
    },
    {
      capabilityId: 'cap-socket-control',
      resourceId: 'res-socket-feed',
      kind: 'socket.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'Socket object is replaced by open/send/close intent rows.'
    },
    {
      capabilityId: 'cap-worker-control',
      resourceId: 'res-worker-index',
      kind: 'worker.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'Worker instance is addressable only by resource id.'
    },
    {
      capabilityId: 'cap-lock-control',
      resourceId: 'res-lock-document',
      kind: 'lock.control',
      canIssueIntents: true,
      canReadRows: true,
      description: 'Lock ownership is a row, not a raw release function.'
    },
    {
      capabilityId: 'cap-pointer-read',
      resourceId: 'res-pointer-stage',
      kind: 'pointer.read',
      canIssueIntents: false,
      canReadRows: true,
      description: 'High-rate samples are coalesced into event rows.'
    }
  ],
  effectIntents: [],
  effectResults: [],
  diagnostics: [
    {
      diagnosticId: 'diag-fit-note',
      scope: 'capability-boundary',
      severity: 'info',
      message: 'Bad-fit browser APIs are adapted through opaque ids and effect rows.',
      resourceId: undefined,
      createdAt: 0
    }
  ],
  events: [],
  viewport: [
    {
      viewportId: 'viewport-main',
      width: 1280,
      height: 720,
      devicePixelRatio: 1
    }
  ],
  fullscreen: [
    {
      fullscreenId: 'fullscreen-shell',
      targetResourceId: 'res-fullscreen-shell',
      available: false,
      active: false,
      requested: false
    }
  ]
};
