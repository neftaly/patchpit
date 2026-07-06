import { createSchemaManifestResolver, type RelationRef } from '@tarstate/core/schema';
import {
  defineRelationSchema,
  relationSchemaRef,
  relationSchemaRegistry,
  type PatchpitJson,
  type PatchpitRelationSchemaDescriptor,
  type PatchpitSchemaHash,
  type PatchpitSchemaId,
  type PatchpitSchemaRef,
} from '../schema';
import {
  appLaunchIntent,
  appLaunchIntentSchemaId,
  appLaunchRequestsRelation,
  filePickerIntentSchemaId,
  filePickerRequestsRelation,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  filesystemTreeNodesRelation,
  filesystemTreeSchemaId,
  installedAppsProjection,
  installedAppsRelation,
  installedAppsSchemaId,
  routeIntentSchemaId,
  routeOpenIntent,
  routePreviewIntent,
  routeRequestsRelation,
  runtimeProjectionsRelation,
  runtimeProjectionsSchemaId,
  windowCloseContextIntent,
  windowFocusIntent,
  windowIntentSchemaId,
  windowMoveTabIntent,
  windowPinPreviewIntent,
  windowRequestsRelation,
  windowResizeSplitIntent,
  type RuntimeIntentRelationBoundary,
} from '../runtime/protocol';
import { PatchpitType, SurfaceRole, type PatchpitDocMetadata } from './types';

export const patchpitSystemSchemaCatalogUrl = 'package:@patchpit/system/src/filesystem/schemas.ts' as const;

type PatchpitSchemaMetadata = Readonly<Record<string, PatchpitJson>>;

const schemaMetadata = (
  docType: PatchpitType | string,
  metadata: PatchpitSchemaMetadata = {},
): PatchpitSchemaMetadata => ({
  patchpit: {
    docType,
    owner: '@patchpit/system',
    source: patchpitSystemSchemaCatalogUrl,
    ...metadata,
  },
});

const relationMetadata = (metadata: PatchpitSchemaMetadata): PatchpitSchemaMetadata => ({
  patchpit: metadata,
});

const enumMetadata = (values: readonly string[]): PatchpitSchemaMetadata => ({
  values: [...values],
});

const idField = (domain: string) => ({ type: 'id', domain } as const);

const refField = (relation: string, field = 'id') => ({
  type: 'ref',
  target: { relation, field },
} as const);

export const appManifestSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.system.appManifest@1',
  description: 'Patchpit app manifest documents seeded under /apps.',
  metadata: schemaMetadata(PatchpitType.AppManifest),
  relations: {
    manifests: {
      key: 'id',
      fields: {
        entry: { type: 'string' },
        entryKind: {
          type: 'string',
          description: 'How the current host interprets entry: JavaScript module or HTML document.',
          metadata: enumMetadata(['module', 'html']),
        },
        extension: { type: 'string' },
        id: idField('app'),
        manifestVersion: { type: 'number' },
        mimeType: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
    handlers: {
      key: ['appId', 'position'],
      fields: {
        accepts: {
          type: 'json',
          description: 'MIME-like accept patterns in manifest order.',
        },
        appId: refField('manifests'),
        intent: {
          type: 'string',
          metadata: enumMetadata(['preview', 'open', 'reveal', 'activate']),
        },
        port: { type: 'string' },
        position: { type: 'number' },
      },
    },
    surfaces: {
      key: ['appId', 'position'],
      fields: {
        appId: refField('manifests'),
        position: { type: 'number' },
        role: {
          type: 'string',
          metadata: enumMetadata(['document-set', 'workspace-view']),
        },
        stateSchemaId: { type: 'string', optional: true },
        stateType: { type: 'string', optional: true },
      },
    },
  },
});

export const folderSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.filesystem.folder@1',
  description: 'Patchpit folder documents plus their ordered entries.',
  metadata: schemaMetadata(PatchpitType.Folder, {
    projectionIdentity: 'document-url',
  }),
  relations: {
    folders: {
      key: 'id',
      fields: {
        id: idField('automergeDocUrl'),
        name: { type: 'string', optional: true },
        title: { type: 'string' },
      },
    },
    entries: {
      key: ['folderId', 'position'],
      fields: {
        folderId: refField('folders'),
        name: { type: 'string' },
        position: { type: 'number' },
        type: { type: 'string' },
        url: { type: 'string' },
      },
    },
  },
});

export const fileResourceSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.filesystem.fileResource@1',
  description: 'Patchpit file/resource metadata. Payload bodies are intentionally app-specific.',
  metadata: schemaMetadata(PatchpitType.File, {
    projectionIdentity: 'document-url',
  }),
  relations: {
    files: {
      key: 'id',
      fields: {
        extension: { type: 'string' },
        id: idField('automergeDocUrl'),
        mimeType: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
});

export const filesystemIndexSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.filesystem.index@1',
  description: 'Internal runtime-maintained materialized filesystem index over linked Automerge docs.',
  metadata: schemaMetadata(PatchpitType.FilesystemIndex, {
    canonicalState: 'linked-automerge-documents',
    lifecycle: 'runtime-maintained-materialized-index',
    maintainer: '@patchpit/system/filesystem',
    publicProjection: false,
  }),
  relations: {
    documents: {
      key: 'url',
      metadata: relationMetadata({
        lifecycle: 'runtime-maintained-materialized-index',
      }),
      fields: {
        content: { type: 'string', optional: true },
        entries: { type: 'json', optional: true },
        mimeType: { type: 'string', optional: true },
        title: { type: 'string', optional: true },
        type: { type: 'string' },
        url: idField('automergeDocUrl'),
      },
    },
  },
});

export const filesystemTreeSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: filesystemTreeSchemaId,
  description: 'Public filesystem tree projection served as Tarstate relation rows.',
  metadata: schemaMetadata('filesystem.tree', {
    lifecycle: 'derived-projection',
    projectionOwner: '@patchpit/system/filesystem',
  }),
  relations: {
    [filesystemTreeNodesRelation]: {
      key: 'url',
      metadata: relationMetadata({
        lifecycle: 'derived-projection',
      }),
      fields: {
        isRoot: { type: 'boolean' },
        kind: {
          type: 'string',
          metadata: enumMetadata(['folder', 'file']),
        },
        mediaType: { type: 'string', nullable: true },
        name: { type: 'string' },
        parentUrl: { ...refField(filesystemTreeNodesRelation, 'url'), nullable: true },
        position: { type: 'number' },
        sourceUrl: { type: 'string', nullable: true },
        text: { type: 'string' },
        title: { type: 'string', nullable: true },
        type: { type: 'string' },
        url: idField('filesystemNodeUrl'),
      },
    },
  },
});

export const fileTypesSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.filesystem.fileTypes@1',
  description: 'Patchpit file icon and MIME match table.',
  metadata: schemaMetadata(PatchpitType.FileTypes),
  relations: {
    fileTypesDocs: {
      key: 'id',
      fields: {
        extension: { type: 'string' },
        id: idField('fileTypesDoc'),
        mimeType: { type: 'string' },
        name: { type: 'string' },
      },
    },
    fileTypes: {
      key: ['docId', 'position'],
      fields: {
        docId: refField('fileTypesDocs'),
        emoji: { type: 'string' },
        match: { type: 'string' },
        position: { type: 'number' },
      },
    },
  },
});

export const filePickerStateSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.app.filePicker.state@1',
  description: 'Durable file picker state projected from the app-owned Automerge doc.',
  metadata: schemaMetadata(PatchpitType.FilePickerState),
  relations: {
    state: {
      key: 'id',
      fields: {
        activeUrl: { type: 'string', optional: true },
        fileTypesUrl: { type: 'string' },
        id: idField('filePickerState'),
        rootUrl: { type: 'string' },
      },
    },
    openFolders: {
      key: ['stateId', 'url'],
      fields: {
        open: { type: 'boolean' },
        stateId: refField('state'),
        url: { type: 'string' },
      },
    },
    selections: {
      key: ['stateId', 'position'],
      fields: {
        position: { type: 'number' },
        stateId: refField('state'),
        url: { type: 'string' },
      },
    },
  },
});

export const windowManagerStateSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.system.windowManager.state@1',
  description: 'Shared Patchpit window-manager state.',
  metadata: schemaMetadata(PatchpitType.WindowManagerState),
  relations: {
    state: {
      key: 'id',
      fields: {
        focus: { type: 'string' },
        id: idField('windowManagerState'),
        layout: { type: 'json' },
      },
    },
    contexts: {
      key: 'id',
      fields: {
        app: { type: 'string' },
        container: { type: 'json' },
        delegation: { type: 'string', optional: true },
        id: idField('windowContext'),
        title: { type: 'string', optional: true },
        url: { type: 'string' },
      },
    },
    surfaces: {
      key: 'id',
      fields: {
        activeContext: { ...refField('contexts'), optional: true },
        contexts: {
          type: 'json',
          description: 'Ordered pinned context ids.',
        },
        id: idField('windowSurface'),
        previewContext: { ...refField('contexts'), optional: true },
        role: {
          type: 'string',
          metadata: enumMetadata(['document-set', 'workspace-view']),
        },
      },
    },
  },
});

export const runtimeStateSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.runtime.state@1',
  description: 'Inspectable Patchpit runtime ownership and worker boot-gate state.',
  metadata: schemaMetadata(PatchpitType.RuntimeState),
  relations: {
    state: {
      key: 'id',
      fields: {
        bootStatus: {
          type: 'string',
          metadata: enumMetadata(['waiting-for-boot-gate-helloAck', 'ready']),
        },
        buildId: { type: 'string' },
        canonicalState: {
          type: 'string',
          metadata: enumMetadata(['automerge']),
        },
        clientId: { type: 'string', optional: true },
        currentAutomergeHandleOwner: { type: 'string' },
        id: idField('runtimeState'),
        ownershipNote: { type: 'string' },
        protocolId: { type: 'string' },
        runtimeInstanceId: { type: 'string', optional: true },
        title: { type: 'string' },
        workspaceId: { type: 'string', optional: true },
      },
    },
    features: {
      key: ['stateId', 'group', 'position'],
      fields: {
        available: { type: 'boolean', optional: true },
        group: {
          type: 'string',
          metadata: enumMetadata(['requiredCurrentBoot', 'plannedRuntime']),
        },
        name: { type: 'string' },
        note: { type: 'string', optional: true },
        position: { type: 'number' },
        stateId: refField('state'),
      },
    },
    workers: {
      key: ['stateId', 'id'],
      description: 'Runtime-side components. The SharedWorker row is currently a boot gate, not the runtime owner.',
      fields: {
        buildId: { type: 'string', optional: true },
        clientId: { type: 'string', optional: true },
        id: idField('runtimeComponent'),
        kind: {
          type: 'string',
          metadata: enumMetadata(['shared-worker-boot-gate', 'in-process-bootstrap-runtime']),
        },
        note: { type: 'string' },
        ownsAutomergeHandles: { type: 'boolean' },
        runtimeInstanceId: { type: 'string', optional: true },
        stateId: refField('state'),
        status: {
          type: 'string',
          metadata: enumMetadata(['waiting-for-boot-gate-helloAck', 'ready', 'active']),
        },
        workspaceId: { type: 'string', optional: true },
      },
    },
  },
});

export const runtimeProjectionsSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: runtimeProjectionsSchemaId,
  description: 'Runtime projection catalog advertised by the active Patchpit runtime.',
  metadata: schemaMetadata('runtime.projections', {
    lifecycle: 'derived-projection',
    projectionOwner: '@patchpit/system/runtime',
  }),
  relations: {
    [runtimeProjectionsRelation]: {
      key: 'name',
      metadata: relationMetadata({
        lifecycle: 'derived-projection',
      }),
      fields: {
        basisKinds: {
          type: 'json',
          description: 'Projection basis kinds accepted by this runtime for the projection.',
        },
        description: { type: 'string', optional: true },
        name: idField('runtimeProjection'),
        owner: { type: 'string', optional: true },
        readOnly: {
          type: 'boolean',
          description: 'Whether the projection export is read-only; V0 projections do not accept writes.',
        },
        schemaHash: { type: 'string' },
        schemaId: { type: 'string' },
        schemaUrl: { type: 'string', optional: true },
      },
    },
  },
});

export const installedAppsSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: installedAppsSchemaId,
  description: 'Read-only runtime projection of installed app packages discovered under /apps.',
  metadata: schemaMetadata(installedAppsProjection, {
    lifecycle: 'derived-projection',
    projectionOwner: '@patchpit/system/runtime',
  }),
  relations: {
    [installedAppsRelation]: {
      key: 'appId',
      metadata: relationMetadata({
        lifecycle: 'derived-projection',
      }),
      fields: {
        appId: idField('app'),
        entryKind: {
          type: 'string',
          metadata: enumMetadata(['module', 'html']),
        },
        entryPath: { type: 'string' },
        entryStatus: {
          type: 'string',
          metadata: enumMetadata(['resolved', 'missing']),
        },
        entryUrl: { type: 'string', optional: true },
        handles: {
          type: 'json',
          description: 'Manifest handlers in manifest order.',
        },
        hasStatefulLaunch: { type: 'boolean' },
        icon: { type: 'string' },
        launchRole: {
          type: 'string',
          metadata: enumMetadata(['document-set', 'workspace-view']),
        },
        manifestUrl: { type: 'string' },
        name: { type: 'string' },
        packagePath: { type: 'string' },
        packageUrl: { type: 'string' },
        surfaces: {
          type: 'json',
          description: 'Manifest surfaces in manifest order.',
        },
        version: { type: 'string' },
      },
    },
  },
});

export const appLaunchIntentSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: appLaunchIntentSchemaId,
  description: 'Patchpit runtime app.launch intent request rows.',
  metadata: schemaMetadata('runtime.intent.appLaunch', {
    intent: appLaunchIntent,
    lifecycle: 'runtime-intent',
  }),
  relations: {
    [appLaunchRequestsRelation]: {
      key: 'id',
      metadata: relationMetadata({
        lifecycle: 'runtime-intent',
      }),
      fields: {
        app: { type: 'string' },
        behavior: {
          type: 'string',
          metadata: enumMetadata(['open-context', 'toggle-surface']),
        },
        context: {
          type: 'json',
          optional: true,
          description: 'Optional shell WindowContext for already-created app state.',
        },
        delegation: {
          type: 'string',
          optional: true,
          description: 'Opaque launch delegation metadata; not authority.',
        },
        id: idField('appLaunchIntentRequest'),
        role: {
          type: 'string',
          metadata: enumMetadata([SurfaceRole.DocumentSet, SurfaceRole.WorkspaceView]),
        },
      },
    },
  },
});

export const appLaunchIntentBoundary = {
  label: 'App launch',
  relation: appLaunchRequestsRelation,
  schema: appLaunchIntentSchema,
} as const satisfies RuntimeIntentRelationBoundary;

export const routeIntentSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: routeIntentSchemaId,
  description: 'Patchpit runtime route intent request rows.',
  metadata: schemaMetadata('runtime.intent.route', {
    intents: [routeOpenIntent, routePreviewIntent],
    lifecycle: 'runtime-intent',
  }),
  relations: {
    [routeRequestsRelation]: {
      key: 'id',
      metadata: relationMetadata({
        lifecycle: 'runtime-intent',
      }),
      fields: {
        id: idField('routeIntentRequest'),
        rootUrl: { type: 'string', optional: true },
        sourceSurfaceId: { type: 'string', optional: true },
        target: {
          type: 'json',
          optional: true,
          description: 'Window-manager drop target payload validated by the runtime.',
        },
        title: { type: 'string', optional: true },
        url: { type: 'string' },
      },
    },
  },
});

export const routeIntentBoundary = {
  label: 'Route',
  relation: routeRequestsRelation,
  schema: routeIntentSchema,
} as const satisfies RuntimeIntentRelationBoundary;

export const filePickerIntentSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: filePickerIntentSchemaId,
  description: 'Patchpit runtime file-picker intent request rows.',
  metadata: schemaMetadata('runtime.intent.filePicker', {
    intents: [filePickerSelectUrlIntent, filePickerToggleFolderIntent],
    lifecycle: 'runtime-intent',
  }),
  relations: {
    [filePickerRequestsRelation]: {
      key: 'id',
      metadata: relationMetadata({
        lifecycle: 'runtime-intent',
      }),
      fields: {
        id: idField('filePickerIntentRequest'),
        selectedUrls: {
          type: 'json',
          optional: true,
          description: 'Optional final selected URL list validated by the file-picker intent handler.',
        },
        toggle: { type: 'boolean', optional: true },
        url: { type: 'string' },
      },
    },
  },
});

export const filePickerIntentBoundary = {
  label: 'File picker',
  relation: filePickerRequestsRelation,
  schema: filePickerIntentSchema,
} as const satisfies RuntimeIntentRelationBoundary;

export const windowIntentSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: windowIntentSchemaId,
  description: 'Patchpit runtime window-manager intent request rows.',
  metadata: schemaMetadata('runtime.intent.window', {
    intents: [
      windowCloseContextIntent,
      windowFocusIntent,
      windowMoveTabIntent,
      windowPinPreviewIntent,
      windowResizeSplitIntent,
    ],
    lifecycle: 'runtime-intent',
  }),
  relations: {
    [windowRequestsRelation]: {
      key: 'id',
      metadata: relationMetadata({
        lifecycle: 'runtime-intent',
      }),
      fields: {
        contextId: { type: 'string', optional: true },
        id: idField('windowIntentRequest'),
        path: {
          type: 'json',
          optional: true,
          description: 'Window split path validated by the runtime.',
        },
        ratio: { type: 'number', optional: true },
        sourceSurfaceId: { type: 'string', optional: true },
        surfaceId: { type: 'string', optional: true },
        target: {
          type: 'json',
          optional: true,
          description: 'Window-manager drop target payload validated by the runtime.',
        },
      },
    },
  },
});

export const windowIntentBoundary = {
  label: 'Window',
  relation: windowRequestsRelation,
  schema: windowIntentSchema,
} as const satisfies RuntimeIntentRelationBoundary;

export const themeSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.system.theme@1',
  description: 'Patchpit theme document.',
  metadata: schemaMetadata(PatchpitType.Theme),
  relations: {
    themes: {
      key: 'name',
      fields: {
        extension: { type: 'string' },
        metrics: { type: 'json' },
        mimeType: { type: 'string' },
        name: idField('theme'),
        palette: { type: 'json' },
        title: { type: 'string' },
        typography: { type: 'json' },
      },
    },
  },
});

export const appearanceSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.system.appearance@1',
  description: 'Patchpit appearance configuration document.',
  metadata: schemaMetadata(PatchpitType.Appearance),
  relations: {
    appearance: {
      key: 'name',
      fields: {
        darkThemeUrl: { type: 'string' },
        extension: { type: 'string' },
        lightThemeUrl: { type: 'string' },
        mimeType: { type: 'string' },
        mode: {
          type: 'string',
          metadata: enumMetadata(['dark', 'light', 'system']),
        },
        name: idField('appearance'),
      },
    },
  },
});

export const patchpitSystemSchemas = [
  appManifestSchema,
  folderSchema,
  fileResourceSchema,
  filesystemIndexSchema,
  fileTypesSchema,
  filePickerStateSchema,
  filesystemTreeSchema,
  installedAppsSchema,
  windowManagerStateSchema,
  runtimeStateSchema,
  runtimeProjectionsSchema,
  appLaunchIntentSchema,
  routeIntentSchema,
  filePickerIntentSchema,
  windowIntentSchema,
  themeSchema,
  appearanceSchema,
] as const;

export type PatchpitSystemSchemaId = typeof patchpitSystemSchemas[number]['schemaId'];

export const patchpitSystemSchemaCatalog = relationSchemaRegistry(...patchpitSystemSchemas);

const patchpitSystemSchemaHashes = {
  'patchpit.app.filePicker.state@1': 'sha256:fd50dd18069cfe00eed87763f036b7afaeb97a15a82bd5ab8ce49d83b809de96',
  'patchpit.filesystem.fileResource@1': 'sha256:4bf45026d8d267a3b11ff4eabad62920e9dea3c9ffd377b4b0f9954a3f1dca45',
  'patchpit.filesystem.fileTypes@1': 'sha256:0815c5b29b35282153e5a1db2e97c1c6d0f07772c286076d940a0c03a464cf97',
  'patchpit.filesystem.folder@1': 'sha256:b66316f285cdf8772105be4f6ef9de97eba1f4faf9795c07d8915f5c6f84907d',
  'patchpit.filesystem.index@1': 'sha256:9a4c2b0e876f84c540ab95aa5faddfcd86860754b76fe605338feb04508744a0',
  'patchpit.filesystem.tree@1': 'sha256:ee3cf0878502927b4b7f90839f8f10cfa8f7d8a4ad740142c6d3d0c5ce9aa168',
  'patchpit.intent.appLaunch@1': 'sha256:80a59ccf64319d9f64b6411523ea5097da1fa1f59a017487b4928a32d7b6b19a',
  'patchpit.intent.filePicker@1': 'sha256:9d22ea794acb16f21159f3a41ee2f7b5085579d4d91b168cbd20af465dffc970',
  'patchpit.intent.route@1': 'sha256:b788b4f922f50dc25d36141190ec1872e8d1ec24cc0cbc205235c6a88f2bbf85',
  'patchpit.intent.window@1': 'sha256:f6fc795ee96f61af948e486b88765757967171387ac641bbfb9ad25b69f205e0',
  'patchpit.runtime.installedApps@1': 'sha256:d131e2e4cece3598f7f6f0aa27955694fc2cdce58238920ea949589c6893addc',
  'patchpit.runtime.projections@1': 'sha256:eec2da731e157cdfe2f02b9c3a3adb273e3454c9e73ab5fad015dd1cd6fa7903',
  'patchpit.runtime.state@1': 'sha256:af7929434c05cc236c47e6284362b775362ae198e8a7b2068251a5c015f636cf',
  'patchpit.system.appManifest@1': 'sha256:d669fe4c41059f3897dc736a6c5265af06992ee80be805b980acfd75a91344ad',
  'patchpit.system.appearance@1': 'sha256:a3a297b433293a35d1380c666821e6883016adbaab760ed3b8e898f77dad46d4',
  'patchpit.system.theme@1': 'sha256:b7ccfb5659debca60a397102a96c5ae722434f14ffc4d19af085e39c8806ec4f',
  'patchpit.system.windowManager.state@1': 'sha256:190de691672cd1ed04f23d654bbca0819301f44785ef37427d709cb5208f3586',
} as const satisfies Readonly<Record<PatchpitSystemSchemaId, PatchpitSchemaHash>>;

export const patchpitSystemSchemaByDocType = {
  [PatchpitType.Appearance]: appearanceSchema,
  [PatchpitType.AppManifest]: appManifestSchema,
  [PatchpitType.File]: fileResourceSchema,
  [PatchpitType.FilePickerState]: filePickerStateSchema,
  [PatchpitType.FileTypes]: fileTypesSchema,
  [PatchpitType.FilesystemIndex]: filesystemIndexSchema,
  [PatchpitType.Folder]: folderSchema,
  [PatchpitType.RuntimeState]: runtimeStateSchema,
  [PatchpitType.Theme]: themeSchema,
  [PatchpitType.WindowManagerState]: windowManagerStateSchema,
} as const satisfies Readonly<Record<PatchpitType, PatchpitRelationSchemaDescriptor>>;

export function patchpitSystemSchemaLocation(schemaId: PatchpitSchemaId): string {
  return `${patchpitSystemSchemaCatalogUrl}#${schemaId}`;
}

export function patchpitSystemSchemaRef(
  schema: PatchpitSystemSchemaId | PatchpitRelationSchemaDescriptor,
): PatchpitSchemaRef {
  const schemaId = typeof schema === 'string' ? schema : schema.schemaId;
  const descriptor = typeof schema === 'string' ? patchpitSystemSchemaCatalog[schema] : schema;
  if (descriptor === undefined) throw new Error(`Unknown Patchpit system schema: ${schemaId}`);
  if (!isPatchpitSystemSchemaId(descriptor.schemaId)) {
    throw new Error(`Missing Patchpit system schema hash: ${descriptor.schemaId}`);
  }
  const hash = patchpitSystemSchemaHashes[descriptor.schemaId];
  return relationSchemaRef(descriptor, {
    hash,
    url: patchpitSystemSchemaLocation(descriptor.schemaId),
  });
}

function isPatchpitSystemSchemaId(schemaId: PatchpitSchemaId): schemaId is PatchpitSystemSchemaId {
  return Object.hasOwn(patchpitSystemSchemaHashes, schemaId);
}

const patchpitSystemSchemaResolver = createSchemaManifestResolver({
  catalog: patchpitSystemSchemaCatalog,
});

export function patchpitSystemRelationRef<Row extends object>(
  schema: PatchpitSystemSchemaId | PatchpitRelationSchemaDescriptor,
  relationName: string,
): RelationRef<Row> {
  const schemaId = typeof schema === 'string' ? schema : schema.schemaId;
  try {
    return patchpitSystemSchemaResolver.relation<Row>(schema, relationName);
  } catch (error) {
    if (typeof schema === 'string' && patchpitSystemSchemaCatalog[schema] === undefined) {
      throw new Error(`Unknown Patchpit system schema: ${schemaId}`, { cause: error });
    }
    throw new Error(`Unknown relation ${relationName} for Patchpit system schema: ${schemaId}`, {
      cause: error,
    });
  }
}

export function patchpitDocSchemaRef(type: PatchpitType): PatchpitSchemaRef {
  return patchpitSystemSchemaRef(patchpitSystemSchemaByDocType[type]);
}

export function patchpitDocMetadata<T extends PatchpitType>(type: T): PatchpitDocMetadata<T> {
  return {
    schema: patchpitDocSchemaRef(type),
    type,
  };
}
