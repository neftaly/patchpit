import type { Atom, FieldRef, QB } from './types.js';
export declare const _spec: unique symbol;
export interface QuerySpec {
    from: string;
    predicates: PredNode[];
    joins: JoinNode[];
    projection: string[] | null;
}
export interface JoinNode {
    spec: QuerySpec;
    on: PredNode;
}
export type PredNode = {
    op: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte';
    lhs: FieldRefNode;
    rhs: FieldRefNode | Atom;
} | {
    op: 'and' | 'or';
    operands: PredNode[];
} | {
    op: 'not';
    operand: PredNode;
};
export interface FieldRefNode {
    _rel: string;
    _field: string;
}
export declare function getSpec(qb: object): QuerySpec;
export declare function makeQB<T extends Record<string, Atom>, Rels extends string>(fieldRefs: Record<string, FieldRef<any, any>>, spec: QuerySpec): QB<T, Rels>;
export declare function fieldsOf(qb: QB<any, any>): Record<string, FieldRef<any, any>>;
export declare function isFieldRefNode(x: unknown): x is FieldRefNode;
//# sourceMappingURL=internal.d.ts.map