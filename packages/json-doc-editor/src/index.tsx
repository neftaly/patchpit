import { useEffect, useState } from 'react'

export type JsonRecord = Record<string, unknown>
type JsonArray = unknown[]
export type JsonDocValidator = (doc: JsonRecord) => string | null

export function JsonDocEditor<T extends JsonRecord>({
  title,
  url,
  value,
  onApply,
  validate,
}: {
  title: string
  url?: string
  value: T
  onApply: (next: T) => void
  validate?: JsonDocValidator
}) {
  const docText = formatJson(value)
  const fieldName = `${title.toLowerCase().replaceAll(' ', '-')}-json`
  const [text, setText] = useState(() => docText)
  const [error, setError] = useState<string | null>(null)
  const isChanged = text !== docText

  useEffect(() => {
    setText(docText)
    setError(null)
  }, [docText])

  function editDraft(nextText: string) {
    setText(nextText)
    const parsed = parseJsonRecord(nextText)
    setError(parsed.ok ? (validate?.(parsed.value) ?? null) : parsed.error)
  }

  function applyDraft() {
    const parsed = parseJsonRecord(text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    const validationError = validate?.(parsed.value)
    if (validationError) {
      setError(validationError)
      return
    }

    onApply(parsed.value as T)
  }

  function resetDraft() {
    setText(docText)
    setError(null)
  }

  return (
    <section>
      <h3>{title}</h3>
      {url && <p>{url}</p>}
      <textarea
        id={fieldName}
        name={fieldName}
        value={text}
        onChange={(e) => editDraft(e.target.value)}
        rows={Math.max(8, text.split('\n').length + 1)}
        spellCheck={false}
        style={{ boxSizing: 'border-box', width: '100%' }}
      />
      <p>
        <button
          type="button"
          onClick={applyDraft}
          disabled={!isChanged || !!error}
        >
          apply json
        </button>{' '}
        <button type="button" onClick={resetDraft} disabled={!isChanged}>
          reset
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export function patchJsonRecord(target: JsonRecord, next: JsonRecord) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) delete target[key]
  }

  for (const [key, value] of Object.entries(next)) {
    patchValue(target[key], value, (updated) => {
      target[key] = updated
    })
  }
}

function patchArray(target: JsonArray, next: JsonArray) {
  target.splice(next.length)
  for (let index = 0; index < next.length; index += 1) {
    patchValue(target[index], next[index], (updated) => {
      target[index] = updated
    })
  }
}

function patchValue(
  current: unknown,
  next: unknown,
  assign: (value: unknown) => void,
) {
  if (isJsonRecord(current) && isJsonRecord(next)) {
    patchJsonRecord(current, next)
    return
  }

  if (Array.isArray(current) && Array.isArray(next)) {
    patchArray(current, next)
    return
  }

  assign(next)
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseJsonRecord(
  text: string,
): { ok: true; value: JsonRecord } | { ok: false; error: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (!isJsonRecord(value)) {
    return { ok: false, error: 'Root value must be a JSON object.' }
  }

  return { ok: true, value }
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
