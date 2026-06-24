// ---------------------------------------------------------------------------
// Runtime query spec — carried by every QB as a hidden property
// ---------------------------------------------------------------------------
export const _spec = Symbol('_spec');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function getSpec(qb) {
    return qb[_spec];
}
// Attach the spec as a non-enumerable symbol property so it is invisible to
// spread, Object.keys(), serialization, and console output.
export function makeQB(fieldRefs, spec) {
    const obj = { ...fieldRefs };
    Object.defineProperty(obj, _spec, { value: spec, enumerable: false, writable: false });
    return obj;
}
export function fieldsOf(qb) {
    return Object.fromEntries(Object.entries(qb));
}
export function isFieldRefNode(x) {
    return typeof x === 'object' && x !== null && '_rel' in x && '_field' in x;
}
//# sourceMappingURL=internal.js.map