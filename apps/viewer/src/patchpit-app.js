export const patchpitApp = {
  handles: [
    { accepts: ['*/*'], intent: 'preview', port: 'view' },
    { accepts: ['*/*'], intent: 'open', port: 'view' },
    { accepts: ['*/*'], intent: 'reveal', port: 'view' },
    { accepts: ['*/*'], intent: 'activate', port: 'view' },
  ],
  icon: '📄',
  id: 'viewer',
  name: 'Viewer',
  surfaces: [
    {
      role: 'document-set',
    },
  ],
  version: '0.0.0',
};

export default async function activate(env) {
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';
  root.style.cssText = 'height:100%;';

  const main = document.createElement('main');
  main.style.cssText = 'box-sizing:border-box;height:100%;overflow:auto;padding:1rem;font:14px/1.45 system-ui,sans-serif;color:#242529;background:transparent;';
  root.append(main);

  const showNotice = (title, message) => {
    main.innerHTML = '';
    const section = document.createElement('section');
    section.style.cssText = 'display:grid;align-content:center;min-height:100%;gap:0.35rem;text-align:center;color:#58585a;';
    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.cssText = 'margin:0;font-size:1rem;color:#242529;';
    const detail = document.createElement('p');
    detail.textContent = message;
    detail.style.cssText = 'margin:0;';
    section.append(heading, detail);
    main.append(section);
  };

  try {
    if (typeof env.services?.view !== 'function') {
      throw new Error('view service unavailable');
    }
    const response = await env.services.view({ name: 'resource' });
    const resource = response?.resource;
    if (resource === undefined) {
      showNotice('Resource unavailable', 'The host did not provide a resource view.');
      return;
    }

    document.title = resource.title ?? resource.name ?? 'Viewer';
    main.innerHTML = '';

    if (resource.kind === 'folder') {
      const list = document.createElement('ul');
      list.style.cssText = 'display:grid;gap:0.25rem;margin:0;padding:0;list-style:none;';
      for (const child of resource.children ?? []) {
        const item = document.createElement('li');
        item.textContent = (child.kind === 'folder' ? 'Folder: ' : 'File: ') + child.name;
        item.style.cssText = 'padding:0.4rem 0.5rem;border:1px solid #d7d7d9;background:transparent;';
        list.append(item);
      }
      main.append(list);
      return;
    }

    if (typeof resource.sourceUrl === 'string' && resource.mediaType?.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = resource.sourceUrl;
      image.alt = resource.name ?? '';
      image.style.cssText = 'display:block;max-width:100%;height:auto;margin:auto;';
      main.append(image);
      return;
    }

    if (typeof resource.sourceUrl === 'string' && resource.text === undefined) {
      const link = document.createElement('a');
      link.href = resource.sourceUrl;
      link.textContent = resource.sourceUrl;
      main.append(link);
      return;
    }

    const preview = document.createElement('pre');
    preview.textContent = resource.text ?? '';
    preview.style.cssText = 'box-sizing:border-box;min-height:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,Liberation Mono,monospace;';
    main.append(preview);
  } catch (error) {
    showNotice('Resource view unavailable', error instanceof Error ? error.message : String(error));
  }
}
