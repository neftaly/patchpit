import type { CapabilityGrant } from '@patchpit/system/runtime';

export const terminalFilesystemCapability = 'terminal.filesystem' as const;
export const terminalFilesystemProtocol = 'patchpit.terminal.filesystem@1' as const;
export const terminalFilesystemVerbs = ['read', 'write', 'stat', 'list', 'mount'] as const;
export const terminalFilesystemOperations = [
  'appendFile',
  'chmod',
  'cp',
  'exists',
  'getAllPaths',
  'link',
  'lstat',
  'mkdir',
  'mv',
  'readFile',
  'readFileBuffer',
  'readlink',
  'readdir',
  'realpath',
  'resolvePath',
  'rm',
  'stat',
  'symlink',
  'utimes',
  'writeFile',
] as const;

export type TerminalFilesystemVerb = typeof terminalFilesystemVerbs[number];
export type TerminalFilesystemOperation = typeof terminalFilesystemOperations[number];

export type TerminalFilesystemCapabilityGrant = CapabilityGrant & {
  readonly capability: typeof terminalFilesystemCapability;
  readonly endpoint: {
    readonly protocol: typeof terminalFilesystemProtocol;
    readonly rootUrl: string;
    readonly rootUrls: readonly string[];
    readonly initialPaths: readonly string[];
    readonly initialPathsByRoot?: Readonly<Record<string, readonly string[]>>;
  };
  readonly verbs: readonly TerminalFilesystemVerb[];
};

export type TerminalFilesystemPayload = unknown;

export type TerminalFilesystemRequest = {
  readonly protocol: typeof terminalFilesystemProtocol;
  readonly id: string;
  readonly capabilityId: string;
  readonly rootUrl: string;
  readonly op: TerminalFilesystemOperation;
  readonly args: readonly TerminalFilesystemPayload[];
};

export type TerminalFilesystemError = {
  readonly code?: string;
  readonly message: string;
};

export type TerminalFilesystemResponse =
  | {
      readonly protocol: typeof terminalFilesystemProtocol;
      readonly id: string;
      readonly ok: true;
      readonly result?: TerminalFilesystemPayload;
    }
  | {
      readonly protocol: typeof terminalFilesystemProtocol;
      readonly id: string;
      readonly ok: false;
      readonly error: TerminalFilesystemError;
    }
  | {
      readonly protocol: typeof terminalFilesystemProtocol;
      readonly type: 'closed';
      readonly error: TerminalFilesystemError;
    };
