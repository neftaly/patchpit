import { _spec, makeQB, getSpec, fieldsOf } from './internal.js';
export function defineSchema(shape) {
    const schema = {};
    for (const relName in shape) {
        const fieldRefs = {};
        for (const fieldName in shape[relName]) {
            fieldRefs[fieldName] = { _rel: relName, _field: fieldName };
        }
        schema[relName] = makeQB(fieldRefs, { from: relName, predicates: [], joins: [], projection: null });
    }
    return schema;
}
// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------
export function where(qb, pred) {
    const spec = getSpec(qb);
    return makeQB(fieldsOf(qb), { ...spec, predicates: [...spec.predicates, pred] });
}
export function join(qb, other, on) {
    const spec = getSpec(qb);
    const otherSpec = getSpec(other);
    const merged = { ...fieldsOf(qb), ...fieldsOf(other) };
    return makeQB(merged, { ...spec, joins: [...spec.joins, { spec: otherSpec, on: on }] });
}
export function select(qb, ...keys) {
    const spec = getSpec(qb);
    const picked = Object.fromEntries(keys.map(k => [k, qb[k]]));
    return makeQB(picked, { ...spec, projection: keys });
}
export function pipe(a, ...fns) {
    return fns.reduce((v, f) => f(v), a);
}
// ---------------------------------------------------------------------------
// defineApp
// ---------------------------------------------------------------------------
export function defineApp(spec) {
    return spec;
}
//# sourceMappingURL=query.js.map