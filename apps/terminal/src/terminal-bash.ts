import {
  Bash,
  InMemoryFs,
  MountableFs,
  defineCommand,
  getCommandNames,
  getNetworkCommandNames,
  type BashOptions,
  type NetworkConfig,
} from 'just-bash/browser';
import {
  containerOverlayMounts,
  containerRootUrl,
  ContainerMountKind,
  RuntimeMountProvider,
  type AppContainer,
  type TerminalNetworkPolicy,
  type TerminalStateDoc,
} from '@patchpit/system';
import { PatchpitFs, type PatchpitFsOptions } from './patchpit-fs';

export type TerminalRuntimeOptions = PatchpitFsOptions;

export type TerminalRuntime = {
  readonly bash: Bash;
  readonly key: string;
};

export type TerminalResult = {
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stderr: string;
  readonly stdout: string;
};

export function createTerminalRuntime(
  options: TerminalRuntimeOptions,
  container: AppContainer,
  state: TerminalStateDoc,
): TerminalRuntime {
  const bashOptions: BashOptions = {
    customCommands: [mountCommand(container)],
    env: terminalEnv(state),
    fs: terminalFs(options, container, state.capabilities.network),
    ...networkOptions(state.capabilities.network),
  };
  return { bash: new Bash(bashOptions), key: terminalRuntimeKey(container, state) };
}

export function terminalRuntimeKey(container: AppContainer, state: TerminalStateDoc): string {
  return JSON.stringify({
    container,
    network: state.capabilities.network,
  });
}

export async function runTerminalCommand(
  runtime: TerminalRuntime,
  state: TerminalStateDoc,
  command: string,
): Promise<TerminalResult> {
  try {
    const result = await runtime.bash.exec(command, {
      cwd: state.cwd,
      env: terminalEnv(state),
    });
    return {
      cwd: result.env.PWD ?? state.cwd,
      env: terminalEnv({ ...state, env: result.env }),
      stderr: result.stderr,
      stdout: result.stdout,
    };
  } catch (error) {
    return {
      cwd: state.cwd,
      env: terminalEnv(state),
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      stdout: '',
    };
  }
}

function terminalFs(
  options: TerminalRuntimeOptions,
  container: AppContainer,
  network: TerminalNetworkPolicy,
): MountableFs {
  const rootUrl = containerRootUrl(container) ?? options.rootUrl;
  const fs = new MountableFs({ base: new PatchpitFs({ ...options, rootUrl }) });
  for (const mount of containerOverlayMounts(container)) {
    if (mount.kind === ContainerMountKind.Automerge) {
      fs.mount(mount.path, new PatchpitFs({ ...options, rootUrl: mount.url }));
    } else {
      fs.mount(mount.path, runtimeFs(mount.provider, network));
    }
  }
  return fs;
}

function mountCommand(container: AppContainer) {
  return defineCommand('mount', async () => ({
    exitCode: 0,
    stderr: '',
    stdout: `${container.mounts.map(mountLine).join('\n')}\n`,
  }));
}

function mountLine(mount: AppContainer['mounts'][number]): string {
  if (mount.kind === ContainerMountKind.Automerge) return `${mount.path} automerge:${mount.url}`;
  return `${mount.path} runtime:${mount.provider}${mount.writable ? ' rw' : ''}`;
}

function runtimeFs(provider: RuntimeMountProvider, network: TerminalNetworkPolicy): InMemoryFs {
  if (provider === RuntimeMountProvider.ShellCommands) return commandFs(network);
  if (provider === RuntimeMountProvider.Device) return deviceFs();
  if (provider === RuntimeMountProvider.Proc) return procFs();
  return new InMemoryFs();
}

function commandFs(policy: TerminalNetworkPolicy): InMemoryFs {
  const fs = new InMemoryFs();
  for (const command of runtimeCommandNames(policy)) {
    fs.writeFileSync(`/${command}`, commandStub(command));
  }
  return fs;
}

function deviceFs(): InMemoryFs {
  const fs = new InMemoryFs();
  for (const name of ['full', 'null', 'stderr', 'stdin', 'stdout', 'zero']) {
    fs.writeFileSync(`/${name}`, '');
  }
  return fs;
}

function procFs(): InMemoryFs {
  const fs = new InMemoryFs();
  fs.mkdirSync('/self/fd', { recursive: true });
  fs.writeFileSync('/version', 'Linux version 6.0.0 (just-bash)\n');
  return fs;
}

function runtimeCommandNames(policy: TerminalNetworkPolicy): string[] {
  return [
    ...getCommandNames(),
    ...(policy.enabled ? getNetworkCommandNames() : []),
  ];
}

function commandStub(command: string): string {
  return `#!/bin/bash\n# just-bash command stub: ${command}\n`;
}

function terminalEnv(state: TerminalStateDoc): Record<string, string> {
  return {
    HOME: '/home',
    ...state.env,
  };
}

function networkOptions(policy: TerminalNetworkPolicy): Partial<BashOptions> {
  if (!policy.enabled) return {};
  return {
    network: policy.allowAll
      ? { dangerouslyAllowFullInternetAccess: true }
      : { allowedUrlPrefixes: policy.allowedUrlPrefixes } satisfies NetworkConfig,
  };
}
