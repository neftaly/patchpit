export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!isJsonContainer(left) || !isJsonContainer(right)) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => sameJsonValue(value, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      sameJsonValue(leftRecord[key], rightRecord[key]),
  )
}

function isJsonContainer(
  value: unknown,
): value is readonly unknown[] | Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
