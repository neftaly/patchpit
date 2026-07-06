const selectAction = 'filePicker.selectUrl';
const toggleFolderAction = 'filePicker.toggleFolder';
const previewAction = 'route.preview';
const openAction = 'route.open';
const doublePointerActivationMs = 500;
const defaultFolderOpen = true;

export const patchpitApp = {
  handles: [],
  icon: '📁',
  id: 'file-picker',
  name: 'File Picker',
  schemaIds: ['patchpit.app.filePicker.state@1'],
  surfaces: [
    {
      role: 'workspace-view',
      state: {
        schemaId: 'patchpit.app.filePicker.state@1',
        type: 'file-picker-state',
      },
    },
  ],
  version: '0.0.0',
};

let currentView;
let hostEnv;
let lastPrimaryPointerActivation;

export default async function activate(env) {
  hostEnv = env;
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = css();
  document.head.append(style);

  const main = document.createElement('main');
  main.className = 'file-picker-app';
  root.append(main);

  await refresh(main);
}

async function refresh(main) {
  try {
    currentView = await hostEnv.services.view({ name: 'file-picker' });
    render(main, currentView);
  } catch (error) {
    main.replaceChildren(notice('File picker unavailable', error instanceof Error ? error.message : String(error)));
  }
}

function render(main, view) {
  const previousTreeScrollTop = main.querySelector('.tree-pane')?.scrollTop ?? 0;
  const previousListScrollTop = main.querySelector('.tree')?.scrollTop ?? 0;
  const tree = document.createElement('nav');
  tree.className = 'tree-pane';
  tree.setAttribute('aria-label', 'project explorer');

  const list = document.createElement('ul');
  list.className = 'tree';
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', 'project files');
  list.append(treeItem(view.root, view, 0));
  tree.append(list);
  main.replaceChildren(tree);
  tree.scrollTop = previousTreeScrollTop;
  list.scrollTop = previousListScrollTop;
}

function treeItem(node, view, depth) {
  const state = view.state;
  const isFolder = node.kind === 'folder';
  const isOpen = isFolderOpen(state, node.url);
  const isSelected = state.selectedUrls.includes(node.url);
  const isActive = state.activeUrl === node.url;
  const displayName = node.name || '/';

  const item = document.createElement('li');
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-selected', String(isSelected));
  if (isFolder) item.setAttribute('aria-expanded', String(isOpen));
  if (isActive) item.dataset.active = '';

  const button = document.createElement('button');
  button.className = 'tree-item';
  button.type = 'button';
  button.style.setProperty('--tree-depth-size', depth + 'rem');
  button.setAttribute('aria-pressed', String(isSelected));

  const icon = document.createElement('span');
  icon.className = 'emoji-icon tree-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = isFolder ? (isOpen ? '📂' : '📁') : fileIcon(view.fileTypes, node.mediaType);
  button.append(icon);

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = displayName;
  button.append(name);

  button.addEventListener('pointerup', (event) => {
    void selectFromPointer(event, node, view, displayName, primaryPointerActivationCount(event, node.url));
  });

  item.append(button);

  if (isFolder && isOpen) {
    const group = document.createElement('ul');
    group.setAttribute('role', 'group');
    group.style.setProperty('--tree-depth-size', (depth + 1) + 'rem');
    for (const child of node.children ?? []) group.append(treeItem(child, view, depth + 1));
    item.append(group);
  }

  return item;
}

async function selectFromPointer(event, node, view, title, activationCount) {
  if (activationCount === 0) return;
  const visibleUrls = visibleFilePickerUrls(view.root, view.state);
  const options = event.shiftKey
    ? { selectedUrls: selectionRange(view.state.activeUrl, node.url, visibleUrls) }
    : event.metaKey || event.ctrlKey
      ? { toggle: true }
      : undefined;

  optimisticSelect(node.url, options);
  await act(options === undefined ? { name: selectAction, url: node.url } : { name: selectAction, options, url: node.url });

  if (activationCount >= 2 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    await act({ name: openAction, title, url: node.url });
    const main = document.querySelector('.file-picker-app');
    if (main !== null) await refresh(main);
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (node.kind === 'folder') {
      optimisticToggleFolder(node.url);
      await act({ name: toggleFolderAction, url: node.url });
    }
    await act({ name: previewAction, title, url: node.url });
  }

  const main = document.querySelector('.file-picker-app');
  if (main !== null) await refresh(main);
}

function primaryPointerActivationCount(event, url) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return 0;
  const now = event.timeStamp;
  const previous = lastPrimaryPointerActivation;
  const count = previous?.url === url
    && previous.pointerType === event.pointerType
    && now - previous.at <= doublePointerActivationMs
      ? previous.count + 1
      : 1;
  lastPrimaryPointerActivation = { at: now, count, pointerType: event.pointerType, url };
  return count;
}

async function act(request) {
  try {
    await hostEnv.services.act(request);
  } catch (error) {
    const main = document.querySelector('.file-picker-app');
    if (main !== null) main.append(notice('Action failed', error instanceof Error ? error.message : String(error)));
  }
}

function optimisticSelect(url, options) {
  if (currentView === undefined) return;
  const selectedUrls = options?.selectedUrls ?? (
    options?.toggle === true
      ? toggleSelection(currentView.state.selectedUrls, url)
      : [url]
  );
  currentView = {
    ...currentView,
    state: {
      ...currentView.state,
      activeUrl: url,
      selectedUrls,
    },
  };
  const main = document.querySelector('.file-picker-app');
  if (main !== null) render(main, currentView);
}

function optimisticToggleFolder(url) {
  if (currentView === undefined) return;
  currentView = {
    ...currentView,
    state: {
      ...currentView.state,
      openFolders: {
        ...currentView.state.openFolders,
        [url]: !isFolderOpen(currentView.state, url),
      },
    },
  };
  const main = document.querySelector('.file-picker-app');
  if (main !== null) render(main, currentView);
}

function toggleSelection(selectedUrls, url) {
  return selectedUrls.includes(url)
    ? selectedUrls.filter((selectedUrl) => selectedUrl !== url)
    : [...selectedUrls, url];
}

function isFolderOpen(state, url) {
  return state.openFolders[url] ?? defaultFolderOpen;
}

function visibleFilePickerUrls(node, state) {
  if (node.kind !== 'folder' || !isFolderOpen(state, node.url)) return [node.url];
  return [node.url, ...(node.children ?? []).flatMap((child) => visibleFilePickerUrls(child, state))];
}

function selectionRange(anchorUrl, url, visibleUrls) {
  if (anchorUrl === undefined) return [url];
  const anchorIndex = visibleUrls.indexOf(anchorUrl);
  const selectedIndex = visibleUrls.indexOf(url);
  return anchorIndex === -1 || selectedIndex === -1
    ? [url]
    : visibleUrls.slice(Math.min(anchorIndex, selectedIndex), Math.max(anchorIndex, selectedIndex) + 1);
}

function fileIcon(fileTypes, mediaType) {
  const mimeType = String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  return fileTypes.find((fileType) => matchesMime(fileType.match, mimeType))?.emoji ?? '📄';
}

function matchesMime(pattern, mimeType) {
  const normalizedPattern = String(pattern).trim().toLowerCase();
  if (normalizedPattern === mimeType) return true;
  const parts = normalizedPattern.split('*');
  if (parts.length === 1 || !mimeType.startsWith(parts[0] ?? '')) return false;

  let index = parts[0]?.length ?? 0;
  for (const part of parts.slice(1)) {
    if (part === '') continue;
    const nextIndex = mimeType.indexOf(part, index);
    if (nextIndex === -1) return false;
    index = nextIndex + part.length;
  }
  const last = parts.at(-1) ?? '';
  return last === '' || mimeType.endsWith(last);
}

function notice(title, message) {
  const section = document.createElement('section');
  section.className = 'notice';
  section.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = message;
  section.append(heading, detail);
  return section;
}

function css() {
  return 'html,body,#patchpit-root{height:100%;margin:0;}' +
    'body{overflow:hidden;background:transparent;color:#242529;font:13px system-ui,sans-serif;}' +
    '.file-picker-app{box-sizing:border-box;height:100%;overflow:auto;background:transparent;color:#242529;scrollbar-width:thin;}' +
    '.tree-pane{height:100%;overflow:auto;padding:0.375rem 0;scrollbar-width:thin;}' +
    '.tree,.tree ul{list-style:none;margin:0;padding:0;}' +
    '.tree-item{box-sizing:border-box;display:grid;grid-template-columns:1.25rem minmax(0,1fr);align-items:center;gap:0.25rem;width:100%;min-height:1.75rem;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:0.25rem 0.5rem 0.25rem calc(0.5rem + var(--tree-depth-size));}' +
    '.tree-item:hover{background:#dfdfe0;}' +
    '[aria-selected=true]>.tree-item{background:#cacaca;color:#242529;}' +
    '[data-active]>.tree-item{font-weight:600;}' +
    '.tree-icon{width:1.25rem;text-align:center;}' +
    '.tree-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.notice{display:grid;gap:0.35rem;margin:0.5rem;padding:0.75rem;border:1px solid #c9c9ca;background:#fafafa;color:#58585a;}' +
    '.notice strong{color:#242529;}';
}
