import { getSpec } from './internal.js';
// ---------------------------------------------------------------------------
// evaluate — pure function from (QB spec, immutable doc snapshot) → rows
// ---------------------------------------------------------------------------
export function evaluate(qb, doc) {
    return evalSpec(getSpec(qb), doc);
}
// ---------------------------------------------------------------------------
// Internal evaluation
// ---------------------------------------------------------------------------
function evalSpec(spec, doc) {
    let rows = Array.from(doc[spec.from] ?? []);
    for (const j of spec.joins) {
        const rhs = evalSpec(j.spec, doc);
        rows = rows.flatMap(l => rhs
            .filter(r => evalPred(j.on, { ...l, ...r }))
            .map(r => ({ ...l, ...r })));
    }
    rows = rows.filter(row => spec.predicates.every(p => evalPred(p, row)));
    if (spec.projection) {
        const keys = spec.projection;
        rows = rows.map(row => Object.fromEntries(keys.map(k => [k, row[k] ?? null])));
    }
    return rows;
}
function evalPred(pred, row) {
    switch (pred.op) {
        case 'eq': return resolve(pred.lhs, row) === resolve(pred.rhs, row);
        case 'ne': return resolve(pred.lhs, row) !== resolve(pred.rhs, row);
        case 'lt': return resolve(pred.lhs, row) < resolve(pred.rhs, row);
        case 'gt': return resolve(pred.lhs, row) > resolve(pred.rhs, row);
        case 'lte': return resolve(pred.lhs, row) <= resolve(pred.rhs, row);
        case 'gte': return resolve(pred.lhs, row) >= resolve(pred.rhs, row);
        case 'and': return pred.operands.every(p => evalPred(p, row));
        case 'or': return pred.operands.some(p => evalPred(p, row));
        case 'not': return !evalPred(pred.operand, row);
    }
}
function resolve(ref, row) {
    if (ref !== null && typeof ref === 'object' && '_field' in ref) {
        return row[ref._field] ?? null;
    }
    return ref;
}
//# sourceMappingURL=evaluate.js.map