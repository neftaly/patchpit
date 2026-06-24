import type { Atom, QB, Predicate, SchemaShape, Schema, App, Constraint } from './types.js';
type ReservedField = '_rel' | '_field' | '_rels';
type AssertNoReserved<T extends Record<string, Atom>> = keyof T & ReservedField extends never ? T : never;
type SafeSchemaShape = {
    [K: string]: {
        [F: string]: Atom;
    } & {
        _rel?: never;
        _field?: never;
        _rels?: never;
    };
};
export declare function defineSchema<S extends SafeSchemaShape>(shape: {
    readonly [K in keyof S]: AssertNoReserved<S[K]>;
}): Schema<S>;
export declare function where<T extends Record<string, Atom>, Rels extends string>(qb: QB<T, Rels>, pred: Predicate<NoInfer<Rels>>): QB<T, Rels>;
export declare function join<T extends Record<string, Atom>, Rels extends string, U extends Record<string, Atom>, R2 extends string>(qb: QB<T, Rels>, other: QB<U, R2>, on: Predicate<NoInfer<Rels | R2>>): QB<Omit<T, keyof U> & U, Rels | R2>;
export declare function select<T extends Record<string, Atom>, Rels extends string, K extends keyof T>(qb: QB<T, Rels>, ...keys: K[]): QB<Pick<T, K>, Rels>;
export declare function pipe<A>(a: A): A;
export declare function pipe<A, B>(a: A, f1: (a: A) => B): B;
export declare function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C;
export declare function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D;
export declare function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E;
export declare function pipe<A, B, C, D, E, F>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F): F;
export declare function defineApp<S extends SchemaShape, D extends Record<string, QB<any, any>>>(spec: {
    schema: Schema<S>;
    derived: D;
    constraints: readonly Constraint[];
}): App<S, D>;
export {};
//# sourceMappingURL=query.d.ts.map