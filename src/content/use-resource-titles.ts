import { useEffect, useState } from 'react';
import { parseContentInvocation } from './invocation.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';

type ResourceTitleRuntime = Pick<PatchpitRuntime, 'openResourceTitle'>;

export const useResourceTitles = (
  runtime: ResourceTitleRuntime,
  contentUrls: readonly string[],
): ReadonlyMap<string, string> => {
  const resourceRefsKey = JSON.stringify([...new Set(contentUrls.flatMap((url) => {
    const invocation = parseContentInvocation(url);
    return invocation?.kind === 'viewer' || invocation?.kind === 'app'
      ? [invocation.resourceRef]
      : [];
  }))].sort());
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    const closeObservers: (() => void)[] = [];
    const resourceRefs = JSON.parse(resourceRefsKey) as string[];
    setTitles(new Map());
    resourceRefs.forEach((resourceRef) => {
      void runtime.openResourceTitle(resourceRef, controller.signal).then((observer) => {
        if (observer === undefined || controller.signal.aborted) {
          observer?.close();
          return;
        }
        const publish = () => {
          const snapshot = observer.getSnapshot();
          setTitles((current) => updateResourceTitle(current, resourceRef,
            snapshot.state === 'ready' ? snapshot.title : undefined));
        };
        const unsubscribe = observer.subscribe(publish);
        closeObservers.push(() => {
          unsubscribe();
          observer.close();
        });
        publish();
      }, () => undefined);
    });
    return () => {
      controller.abort();
      closeObservers.forEach((close) => close());
    };
  }, [resourceRefsKey, runtime]);

  return titles;
};

const updateResourceTitle = (
  current: ReadonlyMap<string, string>,
  resourceRef: string,
  title: string | undefined,
) => {
  if (current.get(resourceRef) === title && (title !== undefined || !current.has(resourceRef))) {
    return current;
  }
  const next = new Map(current);
  if (title === undefined) next.delete(resourceRef);
  else next.set(resourceRef, title);
  return next;
};
