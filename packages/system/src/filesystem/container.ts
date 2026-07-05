import {
  ContainerMountKind,
  RuntimeMountProvider,
  type AppContainer,
  type AutomergeContainerMount,
  type ContainerMount,
  type RuntimeContainerMount,
} from './types';

export const terminalRuntimeMounts = [
  {
    kind: ContainerMountKind.Runtime,
    path: '/bin',
    provider: RuntimeMountProvider.ShellCommands,
  },
  {
    kind: ContainerMountKind.Runtime,
    path: '/usr/bin',
    provider: RuntimeMountProvider.ShellCommands,
  },
  {
    kind: ContainerMountKind.Runtime,
    path: '/dev',
    provider: RuntimeMountProvider.Device,
  },
  {
    kind: ContainerMountKind.Runtime,
    path: '/proc',
    provider: RuntimeMountProvider.Proc,
  },
  {
    kind: ContainerMountKind.Runtime,
    path: '/tmp',
    provider: RuntimeMountProvider.Memory,
    writable: true,
  },
] as const satisfies readonly RuntimeContainerMount[];

export function rootContainer(rootUrl: string): AppContainer {
  return {
    mounts: [
      {
        kind: ContainerMountKind.Automerge,
        path: '/',
        url: rootUrl,
      },
    ],
  };
}

export function terminalContainer(rootUrl: string): AppContainer {
  return {
    mounts: [
      ...rootContainer(rootUrl).mounts,
      ...terminalRuntimeMounts,
    ],
  };
}

export function containerOverlayMounts(container: AppContainer): readonly ContainerMount[] {
  return container.mounts.filter((mount) => mount.path !== '/');
}

export function containerRootUrl(container: AppContainer): string | undefined {
  return container.mounts.find((mount): mount is AutomergeContainerMount => (
    mount.kind === ContainerMountKind.Automerge && mount.path === '/'
  ))?.url;
}
