export const observeSameOriginFrameInteractions = (
  frame: HTMLIFrameElement,
  onInteract: () => void,
) => {
  const boundDocuments = new WeakSet<Document>();
  const boundFrames = new WeakSet<HTMLIFrameElement>();
  const listeners = new AbortController();
  const observers = new Set<MutationObserver>();
  const bindDocument = (document: Document) => {
    if (boundDocuments.has(document)) return;
    boundDocuments.add(document);
    document.addEventListener('focusin', onInteract, { capture: true, signal: listeners.signal });
    document.addEventListener('pointerdown', onInteract, { capture: true, signal: listeners.signal });
    const bindFrame = (nestedFrame: HTMLIFrameElement) => {
      if (boundFrames.has(nestedFrame)) return;
      boundFrames.add(nestedFrame);
      const bindLoadedDocument = () => {
        try {
          if (nestedFrame.contentDocument !== null) bindDocument(nestedFrame.contentDocument);
        } catch {
          // Cross-origin frames cannot join this temporary trusted same-origin bridge.
        }
      };
      nestedFrame.addEventListener('load', bindLoadedDocument, { signal: listeners.signal });
      bindLoadedDocument();
    };
    const bindDescendants = (root: ParentNode) => {
      root.querySelectorAll<HTMLIFrameElement>('iframe').forEach(bindFrame);
    };
    bindDescendants(document);
    const observer = new MutationObserver((records) => {
      records.flatMap(({ addedNodes }) => [...addedNodes])
        .filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE)
        .forEach((element) => {
          if (element.localName === 'iframe') bindFrame(element as HTMLIFrameElement);
          bindDescendants(element);
        });
    });
    observer.observe(document, { childList: true, subtree: true });
    observers.add(observer);
  };
  if (frame.contentDocument !== null) bindDocument(frame.contentDocument);
  return () => {
    listeners.abort();
    observers.forEach((observer) => { observer.disconnect(); });
    observers.clear();
  };
};
