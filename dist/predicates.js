import { isFieldRefNode } from './internal.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ref(f) {
    return { _rel: f._rel, _field: f._field };
}
function rhs(v) {
    return isFieldRefNode(v) ? ref(v) : v;
}
export function eq(lhs, r) {
    return { _rels: lhs._rel, op: 'eq', lhs: ref(lhs), rhs: rhs(r) };
}
export function ne(lhs, r) {
    return { _rels: lhs._rel, op: 'ne', lhs: ref(lhs), rhs: rhs(r) };
}
export function lt(lhs, r) {
    return { _rels: lhs._rel, op: 'lt', lhs: ref(lhs), rhs: r };
}
export function gt(lhs, r) {
    return { _rels: lhs._rel, op: 'gt', lhs: ref(lhs), rhs: r };
}
export function lte(lhs, r) {
    return { _rels: lhs._rel, op: 'lte', lhs: ref(lhs), rhs: r };
}
export function gte(lhs, r) {
    return { _rels: lhs._rel, op: 'gte', lhs: ref(lhs), rhs: r };
}
// ---------------------------------------------------------------------------
// Logical combinators
// ---------------------------------------------------------------------------
export function and(...ps) {
    return { _rels: ps[0]._rels, op: 'and', operands: ps };
}
export function or(...ps) {
    return { _rels: ps[0]._rels, op: 'or', operands: ps };
}
export function not(p) {
    return { _rels: p._rels, op: 'not', operand: p };
}
// ---------------------------------------------------------------------------
// Constraint constructors
// ---------------------------------------------------------------------------
export function primaryKey(ref) {
    return { kind: 'primaryKey', ref };
}
export function unique(ref) {
    return { kind: 'unique', ref };
}
export function foreignKey(pred) {
    return { kind: 'foreignKey', pred };
}
//# sourceMappingURL=predicates.js.map