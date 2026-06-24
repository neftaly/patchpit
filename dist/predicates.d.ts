import type { Atom, FieldRef, Predicate, Constraint, UnionRels } from './types.js';
export declare function eq<T extends Atom, R1 extends string, R2 extends string>(lhs: FieldRef<T, R1>, r: FieldRef<T, R2>): Predicate<R1 | R2>;
export declare function eq<T extends Atom, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function ne<T extends Atom, R1 extends string, R2 extends string>(lhs: FieldRef<T, R1>, r: FieldRef<T, R2>): Predicate<R1 | R2>;
export declare function ne<T extends Atom, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function lt<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function gt<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function lte<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function gte<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>;
export declare function and<Ps extends [Predicate<string>, ...Predicate<string>[]]>(...ps: Ps): Predicate<UnionRels<Ps>>;
export declare function or<Ps extends [Predicate<string>, ...Predicate<string>[]]>(...ps: Ps): Predicate<UnionRels<Ps>>;
export declare function not<R extends string>(p: Predicate<R>): Predicate<R>;
export declare function primaryKey(ref: FieldRef<Atom, string>): Constraint;
export declare function unique(ref: FieldRef<Atom, string>): Constraint;
export declare function foreignKey(pred: Predicate<string>): Constraint;
//# sourceMappingURL=predicates.d.ts.map