export type SeedAppPackageFile = {
  readonly content: string;
  readonly name: string;
};

export type SeedAppPackageEntryKind = 'html' | 'module';

export type SeedAppPackageHandler = {
  readonly accepts: readonly string[];
  readonly intent: 'activate' | 'open' | 'preview' | 'reveal';
  readonly port: string;
};

export type SeedAppPackageSurface = {
  readonly role: 'document-set' | 'workspace-view';
  readonly state?: {
    readonly schemaId?: string;
    readonly type: string;
  };
};

export type SeedAppPackageManifest = {
  readonly entry: string;
  readonly entryKind: SeedAppPackageEntryKind;
  readonly handles: readonly SeedAppPackageHandler[];
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly schemaIds?: readonly string[];
  readonly surfaces: readonly SeedAppPackageSurface[];
  readonly version: string;
};

export type SeedAppPackageDefinition = {
  readonly files: readonly SeedAppPackageFile[];
  readonly manifest: SeedAppPackageManifest;
};

export const seedAppPackages = [
  {
    "files": [
      {
        "content": "true              &&(function polyfill() {\n\tconst relList = document.createElement(\"link\").relList;\n\tif (relList && relList.supports && relList.supports(\"modulepreload\")) return;\n\tfor (const link of document.querySelectorAll(\"link[rel=\\\"modulepreload\\\"]\")) processPreload(link);\n\tnew MutationObserver((mutations) => {\n\t\tfor (const mutation of mutations) {\n\t\t\tif (mutation.type !== \"childList\") continue;\n\t\t\tfor (const node of mutation.addedNodes) if (node.tagName === \"LINK\" && node.rel === \"modulepreload\") processPreload(node);\n\t\t}\n\t}).observe(document, {\n\t\tchildList: true,\n\t\tsubtree: true\n\t});\n\tfunction getFetchOpts(link) {\n\t\tconst fetchOpts = {};\n\t\tif (link.integrity) fetchOpts.integrity = link.integrity;\n\t\tif (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;\n\t\tif (link.crossOrigin === \"use-credentials\") fetchOpts.credentials = \"include\";\n\t\telse if (link.crossOrigin === \"anonymous\") fetchOpts.credentials = \"omit\";\n\t\telse fetchOpts.credentials = \"same-origin\";\n\t\treturn fetchOpts;\n\t}\n\tfunction processPreload(link) {\n\t\tif (link.ep) return;\n\t\tlink.ep = true;\n\t\tconst fetchOpts = getFetchOpts(link);\n\t\tfetch(link.href, fetchOpts);\n\t}\n}());\n\nconst filePickerDragType = 'application/x.patchpit-file';\nconst selectAction = 'filePicker.selectUrl';\nconst toggleFolderAction = 'filePicker.toggleFolder';\nconst previewAction = 'route.preview';\nconst openAction = 'route.open';\n\nlet currentView;\nlet hostEnv;\n\nasync function activate(env) {\n  hostEnv = env;\n  const root = document.getElementById('patchpit-root') ?? document.body;\n  root.innerHTML = '';\n\n  const style = document.createElement('style');\n  style.textContent = css();\n  document.head.append(style);\n\n  const main = document.createElement('main');\n  main.className = 'file-picker-app';\n  root.append(main);\n\n  await refresh(main);\n}\n\nasync function refresh(main) {\n  try {\n    currentView = await hostEnv.services.view({ name: 'file-picker' });\n    render(main, currentView);\n  } catch (error) {\n    main.replaceChildren(notice('File picker unavailable', error instanceof Error ? error.message : String(error)));\n  }\n}\n\nfunction render(main, view) {\n  const tree = document.createElement('nav');\n  tree.className = 'tree-pane';\n  tree.setAttribute('aria-label', 'project explorer');\n\n  const list = document.createElement('ul');\n  list.className = 'tree';\n  list.setAttribute('role', 'tree');\n  list.setAttribute('aria-label', 'project files');\n  list.append(treeItem(view.root, view, 0));\n  tree.append(list);\n  main.replaceChildren(tree);\n}\n\nfunction treeItem(node, view, depth) {\n  const state = view.state;\n  const isFolder = node.kind === 'folder';\n  const isOpen = isFolderOpen(state, node.url);\n  const isSelected = state.selectedUrls.includes(node.url);\n  const isActive = state.activeUrl === node.url;\n  const displayName = node.name || '/';\n\n  const item = document.createElement('li');\n  item.setAttribute('role', 'treeitem');\n  item.setAttribute('aria-selected', String(isSelected));\n  if (isFolder) item.setAttribute('aria-expanded', String(isOpen));\n  if (isActive) item.dataset.active = '';\n\n  const button = document.createElement('button');\n  button.className = 'tree-item';\n  button.draggable = true;\n  button.type = 'button';\n  button.style.setProperty('--tree-depth-size', depth + 'rem');\n  button.setAttribute('aria-pressed', String(isSelected));\n\n  const icon = document.createElement('span');\n  icon.className = 'emoji-icon tree-icon';\n  icon.setAttribute('aria-hidden', 'true');\n  icon.textContent = isFolder ? (isOpen ? '📂' : '📁') : fileIcon(view.fileTypes, node.mediaType);\n  button.append(icon);\n\n  const name = document.createElement('span');\n  name.className = 'tree-name';\n  name.textContent = displayName;\n  button.append(name);\n\n  button.addEventListener('click', (event) => {\n    void selectFromPointer(event, node, view, displayName);\n  });\n  button.addEventListener('dblclick', () => {\n    void act({ name: openAction, title: displayName, url: node.url });\n  });\n  button.addEventListener('dragstart', (event) => {\n    event.dataTransfer.effectAllowed = 'copyMove';\n    event.dataTransfer.setData(filePickerDragType, JSON.stringify({ title: displayName, url: node.url }));\n  });\n\n  item.append(button);\n\n  if (isFolder && isOpen) {\n    const group = document.createElement('ul');\n    group.setAttribute('role', 'group');\n    group.style.setProperty('--tree-depth-size', (depth + 1) + 'rem');\n    for (const child of node.children ?? []) group.append(treeItem(child, view, depth + 1));\n    item.append(group);\n  }\n\n  return item;\n}\n\nasync function selectFromPointer(event, node, view, title) {\n  const visibleUrls = visibleFilePickerUrls(view.root, view.state);\n  const options = event.shiftKey\n    ? { selectedUrls: selectionRange(view.state.activeUrl, node.url, visibleUrls) }\n    : event.metaKey || event.ctrlKey\n      ? { toggle: true }\n      : undefined;\n\n  optimisticSelect(node.url, options);\n  await act(options === undefined ? { name: selectAction, url: node.url } : { name: selectAction, options, url: node.url });\n\n  if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {\n    if (node.kind === 'folder') {\n      optimisticToggleFolder(node.url);\n      await act({ name: toggleFolderAction, url: node.url });\n    }\n    await act({ name: previewAction, title, url: node.url });\n  }\n\n  const main = document.querySelector('.file-picker-app');\n  if (main !== null) await refresh(main);\n}\n\nasync function act(request) {\n  try {\n    await hostEnv.services.act(request);\n  } catch (error) {\n    const main = document.querySelector('.file-picker-app');\n    if (main !== null) main.append(notice('Action failed', error instanceof Error ? error.message : String(error)));\n  }\n}\n\nfunction optimisticSelect(url, options) {\n  if (currentView === undefined) return;\n  const selectedUrls = options?.selectedUrls ?? (\n    options?.toggle === true\n      ? toggleSelection(currentView.state.selectedUrls, url)\n      : [url]\n  );\n  currentView = {\n    ...currentView,\n    state: {\n      ...currentView.state,\n      activeUrl: url,\n      selectedUrls,\n    },\n  };\n  const main = document.querySelector('.file-picker-app');\n  if (main !== null) render(main, currentView);\n}\n\nfunction optimisticToggleFolder(url) {\n  if (currentView === undefined) return;\n  currentView = {\n    ...currentView,\n    state: {\n      ...currentView.state,\n      openFolders: {\n        ...currentView.state.openFolders,\n        [url]: !isFolderOpen(currentView.state, url),\n      },\n    },\n  };\n  const main = document.querySelector('.file-picker-app');\n  if (main !== null) render(main, currentView);\n}\n\nfunction toggleSelection(selectedUrls, url) {\n  return selectedUrls.includes(url)\n    ? selectedUrls.filter((selectedUrl) => selectedUrl !== url)\n    : [...selectedUrls, url];\n}\n\nfunction isFolderOpen(state, url) {\n  return state.openFolders[url] ?? url === state.rootUrl;\n}\n\nfunction visibleFilePickerUrls(node, state) {\n  if (node.kind !== 'folder' || !isFolderOpen(state, node.url)) return [node.url];\n  return [node.url, ...(node.children ?? []).flatMap((child) => visibleFilePickerUrls(child, state))];\n}\n\nfunction selectionRange(anchorUrl, url, visibleUrls) {\n  if (anchorUrl === undefined) return [url];\n  const anchorIndex = visibleUrls.indexOf(anchorUrl);\n  const selectedIndex = visibleUrls.indexOf(url);\n  return anchorIndex === -1 || selectedIndex === -1\n    ? [url]\n    : visibleUrls.slice(Math.min(anchorIndex, selectedIndex), Math.max(anchorIndex, selectedIndex) + 1);\n}\n\nfunction fileIcon(fileTypes, mediaType) {\n  const mimeType = String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase();\n  return fileTypes.find((fileType) => matchesMime(fileType.match, mimeType))?.emoji ?? '📄';\n}\n\nfunction matchesMime(pattern, mimeType) {\n  const normalizedPattern = String(pattern).trim().toLowerCase();\n  if (normalizedPattern === mimeType) return true;\n  const parts = normalizedPattern.split('*');\n  if (parts.length === 1 || !mimeType.startsWith(parts[0] ?? '')) return false;\n\n  let index = parts[0]?.length ?? 0;\n  for (const part of parts.slice(1)) {\n    if (part === '') continue;\n    const nextIndex = mimeType.indexOf(part, index);\n    if (nextIndex === -1) return false;\n    index = nextIndex + part.length;\n  }\n  const last = parts.at(-1) ?? '';\n  return last === '' || mimeType.endsWith(last);\n}\n\nfunction notice(title, message) {\n  const section = document.createElement('section');\n  section.className = 'notice';\n  section.setAttribute('role', 'status');\n  const heading = document.createElement('strong');\n  heading.textContent = title;\n  const detail = document.createElement('span');\n  detail.textContent = message;\n  section.append(heading, detail);\n  return section;\n}\n\nfunction css() {\n  return 'html,body,#patchpit-root{height:100%;margin:0;}' +\n    'body{overflow:hidden;background:transparent;color:#242529;font:13px system-ui,sans-serif;}' +\n    '.file-picker-app{box-sizing:border-box;height:100%;overflow:auto;background:transparent;color:#242529;}' +\n    '.tree-pane{height:100%;overflow:auto;padding:0.375rem 0;}' +\n    '.tree,.tree ul{list-style:none;margin:0;padding:0;}' +\n    '.tree-item{box-sizing:border-box;display:grid;grid-template-columns:1.25rem minmax(0,1fr);align-items:center;gap:0.25rem;width:100%;min-height:1.75rem;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:0.25rem 0.5rem 0.25rem calc(0.5rem + var(--tree-depth-size));}' +\n    '.tree-item:hover{background:#dfdfe0;}' +\n    '[aria-selected=true]>.tree-item{background:#cacaca;color:#242529;}' +\n    '[data-active]>.tree-item{font-weight:600;}' +\n    '.tree-icon{width:1.25rem;text-align:center;}' +\n    '.tree-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +\n    '.notice{display:grid;gap:0.35rem;margin:0.5rem;padding:0.75rem;border:1px solid #c9c9ca;background:#fafafa;color:#58585a;}' +\n    '.notice strong{color:#242529;}';\n}\n\nawait activate(window.patchpit);\n",
        "name": "assets/index.js"
      },
      {
        "content": "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>File Picker</title>\n    <script type=\"module\" crossorigin src=\"./assets/index.js\"></script>\n  </head>\n  <body>\n    <div id=\"patchpit-root\"></div>\n  </body>\n</html>\n",
        "name": "index.html"
      }
    ],
    "manifest": {
      "handles": [],
      "icon": "📁",
      "id": "file-picker",
      "name": "File Picker",
      "schemaIds": [
        "patchpit.app.filePicker.state@1"
      ],
      "surfaces": [
        {
          "role": "workspace-view",
          "state": {
            "schemaId": "patchpit.app.filePicker.state@1",
            "type": "file-picker-state"
          }
        }
      ],
      "version": "0.0.0",
      "entry": "index.html",
      "entryKind": "html"
    }
  },
  {
    "files": [
      {
        "content": "true              &&(function polyfill() {\n\tconst relList = document.createElement(\"link\").relList;\n\tif (relList && relList.supports && relList.supports(\"modulepreload\")) return;\n\tfor (const link of document.querySelectorAll(\"link[rel=\\\"modulepreload\\\"]\")) processPreload(link);\n\tnew MutationObserver((mutations) => {\n\t\tfor (const mutation of mutations) {\n\t\t\tif (mutation.type !== \"childList\") continue;\n\t\t\tfor (const node of mutation.addedNodes) if (node.tagName === \"LINK\" && node.rel === \"modulepreload\") processPreload(node);\n\t\t}\n\t}).observe(document, {\n\t\tchildList: true,\n\t\tsubtree: true\n\t});\n\tfunction getFetchOpts(link) {\n\t\tconst fetchOpts = {};\n\t\tif (link.integrity) fetchOpts.integrity = link.integrity;\n\t\tif (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;\n\t\tif (link.crossOrigin === \"use-credentials\") fetchOpts.credentials = \"include\";\n\t\telse if (link.crossOrigin === \"anonymous\") fetchOpts.credentials = \"omit\";\n\t\telse fetchOpts.credentials = \"same-origin\";\n\t\treturn fetchOpts;\n\t}\n\tfunction processPreload(link) {\n\t\tif (link.ep) return;\n\t\tlink.ep = true;\n\t\tconst fetchOpts = getFetchOpts(link);\n\t\tfetch(link.href, fetchOpts);\n\t}\n}());\n\nasync function activate(env) {\n  const root = document.getElementById('patchpit-root') ?? document.body;\n  root.innerHTML = '';\n  const main = document.createElement('main');\n  main.style.cssText = 'display:grid;place-content:center;min-height:100%;gap:0.5rem;font:16px system-ui,sans-serif;text-align:center;';\n  const heading = document.createElement('h1');\n  heading.textContent = 'Hello from /apps/hello-world';\n  const detail = document.createElement('p');\n  detail.textContent = 'Requesting host launch view...';\n  main.append(heading, detail);\n  root.append(main);\n\n  try {\n    if (typeof env.services?.view !== 'function') {\n      throw new Error('view service unavailable');\n    }\n    const launch = await env.services.view({ name: 'launch' });\n    const session = launch?.session ?? env.session;\n    detail.textContent = 'Launch view: ' + (launch?.appId ?? env.appId) + ' / ' + session.id;\n    const url = document.createElement('p');\n    url.textContent = 'Session URL: ' + session.url;\n    main.append(url);\n  } catch (error) {\n    detail.textContent = 'Launch view unavailable: ' + (error instanceof Error ? error.message : String(error));\n  }\n}\n\nawait activate(window.patchpit);\n",
        "name": "assets/index.js"
      },
      {
        "content": "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Hello World</title>\n    <script type=\"module\" crossorigin src=\"./assets/index.js\"></script>\n  </head>\n  <body>\n    <div id=\"patchpit-root\"></div>\n  </body>\n</html>\n",
        "name": "index.html"
      }
    ],
    "manifest": {
      "handles": [],
      "icon": "👋",
      "id": "hello-world",
      "name": "Hello World",
      "surfaces": [
        {
          "role": "document-set"
        }
      ],
      "version": "0.0.0",
      "entry": "index.html",
      "entryKind": "html"
    }
  },
  {
    "files": [
      {
        "content": "true              &&(function polyfill() {\n\tconst relList = document.createElement(\"link\").relList;\n\tif (relList && relList.supports && relList.supports(\"modulepreload\")) return;\n\tfor (const link of document.querySelectorAll(\"link[rel=\\\"modulepreload\\\"]\")) processPreload(link);\n\tnew MutationObserver((mutations) => {\n\t\tfor (const mutation of mutations) {\n\t\t\tif (mutation.type !== \"childList\") continue;\n\t\t\tfor (const node of mutation.addedNodes) if (node.tagName === \"LINK\" && node.rel === \"modulepreload\") processPreload(node);\n\t\t}\n\t}).observe(document, {\n\t\tchildList: true,\n\t\tsubtree: true\n\t});\n\tfunction getFetchOpts(link) {\n\t\tconst fetchOpts = {};\n\t\tif (link.integrity) fetchOpts.integrity = link.integrity;\n\t\tif (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;\n\t\tif (link.crossOrigin === \"use-credentials\") fetchOpts.credentials = \"include\";\n\t\telse if (link.crossOrigin === \"anonymous\") fetchOpts.credentials = \"omit\";\n\t\telse fetchOpts.credentials = \"same-origin\";\n\t\treturn fetchOpts;\n\t}\n\tfunction processPreload(link) {\n\t\tif (link.ep) return;\n\t\tlink.ep = true;\n\t\tconst fetchOpts = getFetchOpts(link);\n\t\tfetch(link.href, fetchOpts);\n\t}\n}());\n\nasync function activate(env) {\n  const root = document.getElementById('patchpit-root') ?? document.body;\n  root.innerHTML = '';\n  root.style.cssText = 'height:100%;';\n\n  const main = document.createElement('main');\n  main.style.cssText = 'box-sizing:border-box;height:100%;overflow:auto;padding:1rem;font:14px/1.45 system-ui,sans-serif;color:#242529;background:transparent;';\n  root.append(main);\n\n  const showNotice = (title, message) => {\n    main.innerHTML = '';\n    const section = document.createElement('section');\n    section.style.cssText = 'display:grid;align-content:center;min-height:100%;gap:0.35rem;text-align:center;color:#58585a;';\n    const heading = document.createElement('h1');\n    heading.textContent = title;\n    heading.style.cssText = 'margin:0;font-size:1rem;color:#242529;';\n    const detail = document.createElement('p');\n    detail.textContent = message;\n    detail.style.cssText = 'margin:0;';\n    section.append(heading, detail);\n    main.append(section);\n  };\n\n  try {\n    if (typeof env.services?.view !== 'function') {\n      throw new Error('view service unavailable');\n    }\n    const response = await env.services.view({ name: 'resource' });\n    const resource = response?.resource;\n    if (resource === undefined) {\n      showNotice('Resource unavailable', 'The host did not provide a resource view.');\n      return;\n    }\n\n    document.title = resource.title ?? resource.name ?? 'Viewer';\n    main.innerHTML = '';\n\n    if (resource.kind === 'folder') {\n      const list = document.createElement('ul');\n      list.style.cssText = 'display:grid;gap:0.25rem;margin:0;padding:0;list-style:none;';\n      for (const child of resource.children ?? []) {\n        const item = document.createElement('li');\n        item.textContent = (child.kind === 'folder' ? 'Folder: ' : 'File: ') + child.name;\n        item.style.cssText = 'padding:0.4rem 0.5rem;border:1px solid #d7d7d9;background:transparent;';\n        list.append(item);\n      }\n      main.append(list);\n      return;\n    }\n\n    if (typeof resource.sourceUrl === 'string' && resource.mediaType?.startsWith('image/')) {\n      const image = document.createElement('img');\n      image.src = resource.sourceUrl;\n      image.alt = resource.name ?? '';\n      image.style.cssText = 'display:block;max-width:100%;height:auto;margin:auto;';\n      main.append(image);\n      return;\n    }\n\n    if (typeof resource.sourceUrl === 'string' && resource.text === undefined) {\n      const link = document.createElement('a');\n      link.href = resource.sourceUrl;\n      link.textContent = resource.sourceUrl;\n      main.append(link);\n      return;\n    }\n\n    const preview = document.createElement('pre');\n    preview.textContent = resource.text ?? '';\n    preview.style.cssText = 'box-sizing:border-box;min-height:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,Liberation Mono,monospace;';\n    main.append(preview);\n  } catch (error) {\n    showNotice('Resource view unavailable', error instanceof Error ? error.message : String(error));\n  }\n}\n\nawait activate(window.patchpit);\n",
        "name": "assets/index.js"
      },
      {
        "content": "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Viewer</title>\n    <script type=\"module\" crossorigin src=\"./assets/index.js\"></script>\n  </head>\n  <body>\n    <div id=\"patchpit-root\"></div>\n  </body>\n</html>\n",
        "name": "index.html"
      }
    ],
    "manifest": {
      "handles": [
        {
          "accepts": [
            "*/*"
          ],
          "intent": "preview",
          "port": "view"
        },
        {
          "accepts": [
            "*/*"
          ],
          "intent": "open",
          "port": "view"
        },
        {
          "accepts": [
            "*/*"
          ],
          "intent": "reveal",
          "port": "view"
        },
        {
          "accepts": [
            "*/*"
          ],
          "intent": "activate",
          "port": "view"
        }
      ],
      "icon": "📄",
      "id": "viewer",
      "name": "Viewer",
      "surfaces": [
        {
          "role": "document-set"
        }
      ],
      "version": "0.0.0",
      "entry": "index.html",
      "entryKind": "html"
    }
  }
] as const satisfies readonly SeedAppPackageDefinition[];
