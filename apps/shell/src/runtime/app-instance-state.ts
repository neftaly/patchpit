import type { DocHandle } from '@automerge/automerge-repo';
import {
  type FilesystemResource,
  type WindowContext,
} from '@patchpit/system';

export type AppInstanceStateContextInput = {
  readonly app: string;
  readonly rootUrl: string;
  readonly stateHandle: DocHandle<FilesystemResource>;
};

export type AppInstanceStateHandler = {
  readonly app: string;
  readonly stateType: string;
  createContext(input: AppInstanceStateContextInput): WindowContext;
  createState(): DocHandle<FilesystemResource>;
};
