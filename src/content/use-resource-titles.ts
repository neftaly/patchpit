import { useEffect, useState } from 'react';
import { parseContentInvocation } from './invocation.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';

type ResourceTitleRuntime = Pick<PatchpitRuntime, 'openResourceTitles'>;

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
    const resourceRefs = JSON.parse(resourceRefsKey) as string[];
    setTitles(new Map());
    const observerLifecycle = runtime.openResourceTitles(resourceRefs, controller.signal).then((observer) => {
      if (observer === undefined || controller.signal.aborted) {
        observer?.close();
        return undefined;
      }
      const publish = () => {
        const next = observer.getSnapshot();
        setTitles((current) => sameTitles(current, next) ? current : next);
      };
      const unsubscribe = observer.subscribe(publish);
      publish();
      return () => {
        unsubscribe();
        observer.close();
      };
    }, () => undefined);
    return () => {
      controller.abort();
      void observerLifecycle.then((close) => close?.());
    };
  }, [resourceRefsKey, runtime]);

  return titles;
};

const sameTitles = (left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>) =>
  left.size === right.size && [...left].every(([resourceRef, title]) =>
    right.get(resourceRef) === title);
