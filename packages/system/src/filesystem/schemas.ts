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
import { filesystemTreeNodesRelation, filesystemTreeSchemaId } from '../runtime/protocol';
import { PatchpitType, type PatchpitDocMetadata } from './types';

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
        extension: { type: 'string' },
        id: idField('app'),
        manifestVersion: { type: 'number' },
        mimeType: { type: 'string' },
        name: { type: 'string' },
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
  description: 'Internal filesystem index projection over linked Automerge docs.',
  metadata: schemaMetadata(PatchpitType.FilesystemIndex, {
    lifecycle: 'derived-index',
    projectionOwner: '@patchpit/system/filesystem',
  }),
  relations: {
    documents: {
      key: 'url',
      metadata: relationMetadata({
        lifecycle: 'derived-index',
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

export const terminalStateSchema = defineRelationSchema({
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.app.terminal.state@1',
  description: 'Durable terminal state projected from the terminal app Automerge doc.',
  metadata: schemaMetadata(PatchpitType.TerminalState),
  relations: {
    state: {
      key: 'id',
      fields: {
        capabilities: {
          type: 'json',
          description: 'Terminal capability policy object for this state doc.',
        },
        cwd: { type: 'string' },
        id: idField('terminalState'),
      },
    },
    env: {
      key: ['stateId', 'name'],
      fields: {
        name: { type: 'string' },
        stateId: refField('state'),
        value: { type: 'string' },
      },
    },
    history: {
      key: ['stateId', 'position'],
      fields: {
        command: { type: 'string' },
        position: { type: 'number' },
        stateId: refField('state'),
      },
    },
    lines: {
      key: ['stateId', 'position'],
      fields: {
        kind: {
          type: 'string',
          metadata: enumMetadata(['input', 'output', 'error']),
        },
        position: { type: 'number' },
        prompt: { type: 'string', optional: true },
        stateId: refField('state'),
        text: { type: 'string' },
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
  terminalStateSchema,
  windowManagerStateSchema,
  runtimeStateSchema,
  themeSchema,
  appearanceSchema,
] as const;

export type PatchpitSystemSchemaId = typeof patchpitSystemSchemas[number]['schemaId'];

export const patchpitSystemSchemaCatalog = relationSchemaRegistry(...patchpitSystemSchemas);

const patchpitSystemSchemaHashes = {
  'patchpit.app.filePicker.state@1': 'sha256:fd50dd18069cfe00eed87763f036b7afaeb97a15a82bd5ab8ce49d83b809de96',
  'patchpit.app.terminal.state@1': 'sha256:e8fc3fc6cd9c219b3f9f8fff46e38806a2949f199c7d40a747b676fd44780aca',
  'patchpit.filesystem.fileResource@1': 'sha256:4bf45026d8d267a3b11ff4eabad62920e9dea3c9ffd377b4b0f9954a3f1dca45',
  'patchpit.filesystem.fileTypes@1': 'sha256:0815c5b29b35282153e5a1db2e97c1c6d0f07772c286076d940a0c03a464cf97',
  'patchpit.filesystem.folder@1': 'sha256:b66316f285cdf8772105be4f6ef9de97eba1f4faf9795c07d8915f5c6f84907d',
  'patchpit.filesystem.index@1': 'sha256:f3bbfcf1b7704236653b54645b3f59b488e8a03f663daad3f6e5eb67df01be88',
  'patchpit.filesystem.tree@1': 'sha256:ee3cf0878502927b4b7f90839f8f10cfa8f7d8a4ad740142c6d3d0c5ce9aa168',
  'patchpit.runtime.state@1': 'sha256:af7929434c05cc236c47e6284362b775362ae198e8a7b2068251a5c015f636cf',
  'patchpit.system.appManifest@1': 'sha256:ef3ab14a21e0f124dbd262a5984bb3f09a3a6e90c0b27f458976b4a10fac5518',
  'patchpit.system.appearance@1': 'sha256:a3a297b433293a35d1380c666821e6883016adbaab760ed3b8e898f77dad46d4',
  'patchpit.system.theme@1': 'sha256:b7ccfb5659debca60a397102a96c5ae722434f14ffc4d19af085e39c8806ec4f',
  'patchpit.system.windowManager.state@1': 'sha256:ae080f3790d51376f411d32d3f9706193c5ed58ab77c374bb59d2d748b48db6f',
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
  [PatchpitType.TerminalState]: terminalStateSchema,
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
  const hash = patchpitSystemSchemaHashes[descriptor.schemaId as PatchpitSystemSchemaId];
  if (hash === undefined) throw new Error(`Missing Patchpit system schema hash: ${descriptor.schemaId}`);
  return relationSchemaRef(descriptor, {
    hash,
    url: patchpitSystemSchemaLocation(descriptor.schemaId),
  });
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
