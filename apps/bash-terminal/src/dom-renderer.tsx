import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { ReactNode } from 'react'
import type { TerminalLine } from './buffer.js'
import type { TerminalRendererProps } from './renderers.js'

export function DomTerminalRenderer({
  input,
  isRunning,
  prompt,
  settings,
  title,
  viewport,
  visibleRows,
}: TerminalRendererProps) {
  return (
    <section
      className="terminal-pane"
      aria-label={title}
      onClick={() => input.inputRef.current?.focus()}
    >
      <div
        className="terminal-output"
        ref={viewport.scrollRef}
        onScroll={viewport.handleScroll}
      >
        <div
          className="terminal-virtual-content"
          style={{
            height: viewport.totalRows * settings.rowHeightPx,
            position: 'relative',
          }}
        >
          {visibleRows.map((row) => (
            <TerminalVirtualRow
              key={row.item.id}
              index={row.index}
              rowHeightPx={settings.rowHeightPx}
            >
              <TerminalLineView
                line={row.item}
                rowHeightPx={settings.rowHeightPx}
              />
            </TerminalVirtualRow>
          ))}
          {viewport.isPromptVisible && (
            <TerminalVirtualRow
              index={viewport.promptRowIndex}
              rowHeightPx={settings.rowHeightPx}
            >
              <form className="terminal-input-row" onSubmit={input.submit}>
                <span className="terminal-prompt">{prompt}</span>
                <input
                  ref={input.inputRef}
                  aria-label="bash command"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={isRunning}
                />
              </form>
            </TerminalVirtualRow>
          )}
        </div>
        {!viewport.isPromptVisible && (
          <button
            className="terminal-follow-button"
            type="button"
            onClick={viewport.followPrompt}
          >
            jump to prompt
          </button>
        )}
      </div>
    </section>
  )
}

function TerminalVirtualRow({
  children,
  index,
  rowHeightPx,
}: {
  children: ReactNode
  index: number
  rowHeightPx: number
}) {
  return (
    <div
      className="terminal-virtual-row"
      style={{
        height: rowHeightPx,
        left: 0,
        minWidth: '100%',
        overflowX: 'visible',
        overflowY: 'hidden',
        position: 'absolute',
        top: index * rowHeightPx,
        width: 'max-content',
      }}
    >
      {children}
    </div>
  )
}

const TerminalLineView = memo(function TerminalLineView({
  line,
  rowHeightPx,
}: {
  line: TerminalLine
  rowHeightPx: number
}) {
  if (line.kind === 'input') {
    return (
      <div className="terminal-line terminal-line-input">
        <span className="terminal-prompt">{line.prompt}</span>
        <span className="terminal-line-text">{line.text}</span>
      </div>
    )
  }

  return (
    <div
      className={`terminal-line terminal-line-${line.kind}`}
      style={terminalOutputLineStyle(rowHeightPx)}
    >
      <span className="terminal-line-text" style={terminalLineTextStyle}>
        {line.text}
      </span>
    </div>
  )
})

function terminalOutputLineStyle(rowHeightPx: number): CSSProperties {
  return {
    display: 'block',
    height: rowHeightPx,
    lineHeight: `${rowHeightPx}px`,
    margin: 0,
    minHeight: 0,
    overflow: 'visible',
    whiteSpace: 'pre',
  }
}

const terminalLineTextStyle: CSSProperties = {
  display: 'inline-block',
  minWidth: 'max-content',
  whiteSpace: 'pre',
}
