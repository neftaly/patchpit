export type Atom = string | number | boolean | null;
export type FieldRef<T extends Atom, Rel extends string> = {
    readonly _rel: Rel;
    readonly _field: string;
};
export type Predicate<Rels extends string> = {
    readonly _rels: Rels;
    readonly op: BinaryOp | LogicalOp;
};
export type BinaryOp = 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte';
export type LogicalOp = 'and' | 'or' | 'not';
declare const _qb: unique symbol;
export type QB<T extends Record<string, Atom>, Rels extends string> = {
    readonly [_qb]: Rels;
} & {
    readonly [K in keyof T]: FieldRef<T[K] & Atom, Rels>;
};
export type Constraint = {
    readonly kind: 'primaryKey';
    readonly ref: FieldRef<Atom, string>;
} | {
    readonly kind: 'unique';
    readonly ref: FieldRef<Atom, string>;
} | {
    readonly kind: 'foreignKey';
    readonly pred: Predicate<string>;
};
export type SchemaShape = Record<string, Record<string, Atom>>;
export type Schema<S extends SchemaShape> = {
    readonly [K in keyof S]: QB<S[K], K & string>;
};
export type App<S extends SchemaShape, D extends Record<string, QB<any, any>>> = {
    readonly schema: Schema<S>;
    readonly derived: D;
    readonly constraints: readonly Constraint[];
};
export type UnionRels<Ps extends Predicate<string>[]> = Ps[number] extends Predicate<infer R> ? R : never;
export {};
//# sourceMappingURL=types.d.ts.map