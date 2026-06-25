import { isJsonRecord } from '@patchpit/json-doc-editor'
import type { JsonRecord } from '@patchpit/json-doc-editor'

type JsonArray = unknown[]

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
