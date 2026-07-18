export const observeSameOriginFrameInteractions = (
  frame: HTMLIFrameElement,
  onInteract: () => void,
) => {
  const boundDocuments = new WeakSet<Document>();
  const boundFrames = new WeakSet<HTMLIFrameElement>();
  const cleanups: Array<() => void> = [];
  const bindDocument = (document: Document) => {
    if (boundDocuments.has(document)) return;
    boundDocuments.add(document);
    document.addEventListener('focusin', onInteract, true);
    document.addEventListener('pointerdown', onInteract, true);
    cleanups.push(() => {
      document.removeEventListener('focusin', onInteract, true);
      document.removeEventListener('pointerdown', onInteract, true);
    });
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
      nestedFrame.addEventListener('load', bindLoadedDocument);
      cleanups.push(() => { nestedFrame.removeEventListener('load', bindLoadedDocument); });
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
    cleanups.push(() => { observer.disconnect(); });
  };
  if (frame.contentDocument !== null) bindDocument(frame.contentDocument);
  return () => { cleanups.forEach((cleanup) => { cleanup(); }); };
};
