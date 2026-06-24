import type { AutomergeUrl } from '@automerge/automerge-repo'
import { useState } from 'react'
import { addEntry, createFilesystemDemoState } from './model.js'
import type { EntryType, SelectedDoc } from './model.js'
import { SelectedDocPane } from './selected-doc-pane.js'
import { FolderTreeItem } from './tree.js'

const demoState = createFilesystemDemoState()

export function FilesystemDemo() {
  const { repo, rootHandle, rootEntryName } = demoState
  const [closedUrls, setClosedUrls] = useState<Set<AutomergeUrl>>(
    () => new Set(),
  )
  const [selected, setSelected] = useState<SelectedDoc>({
    type: 'folder',
    url: rootHandle.url,
    parentUrl: null,
  })

  function toggleFolder(url: AutomergeUrl) {
    setClosedUrls((current) => {
      const next = new Set(current)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function select(next: SelectedDoc) {
    setSelected(next)
  }

  function promptAndAddEntry(folderUrl: AutomergeUrl, type: EntryType) {
    const name = window.prompt(`new ${type} name`)?.trim()
    if (!name) return

    void addEntry(repo, folderUrl, type, name)
  }

  return (
    <main className="app">
      <div className="workspace">
        <nav className="tree-pane" aria-label="project explorer">
          <ul className="tree" role="tree" aria-label="project files">
            <FolderTreeItem
              repo={repo}
              handle={rootHandle}
              entryName={rootEntryName}
              parentUrl={null}
              selectedUrl={selected.url}
              closedUrls={closedUrls}
              onToggle={toggleFolder}
              onSelect={select}
              onAddEntry={promptAndAddEntry}
            />
          </ul>
        </nav>

        <SelectedDocPane repo={repo} selected={selected} />
      </div>
    </main>
  )
}
