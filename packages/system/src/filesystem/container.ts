import {
  ContainerMountKind,
  type AppContainer,
  type AutomergeContainerMount,
  type ContainerMount,
} from './types';

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

export function containerOverlayMounts(container: AppContainer): readonly ContainerMount[] {
  return container.mounts.filter((mount) => mount.path !== '/');
}

export function containerRootUrl(container: AppContainer): string | undefined {
  return container.mounts.find((mount): mount is AutomergeContainerMount => (
    mount.kind === ContainerMountKind.Automerge && mount.path === '/'
  ))?.url;
}
