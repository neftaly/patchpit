import type { Atom, QB } from './types.js';
export type Doc = Readonly<Record<string, ReadonlyArray<Readonly<Record<string, Atom>>>>>;
export declare function evaluate<T extends Record<string, Atom>, Rels extends string>(qb: QB<T, Rels>, doc: Doc): ReadonlyArray<T>;
//# sourceMappingURL=evaluate.d.ts.map