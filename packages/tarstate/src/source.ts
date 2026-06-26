import type { TarstateDiagnostic } from './diagnostics.js';
import type { RelationRef } from './schema.js';

/** Value that may be returned directly or by promise. */
export type MaybePromise<T> = T | Promise<T>;

/** Requested equality lookup for a relation field. */
export type RelationLookup = {
  readonly relation: RelationRef;
  readonly field: string;
  readonly value: unknown;
};

/** Read interface used by evaluators and adapters. */
export type RelationSource = {
  readonly rows: (relation: RelationRef) => MaybePromise<Iterable<unknown>>;
  /** Return `undefined` when this lookup is unsupported; return `[]` for no matches. */
  readonly lookup?: (lookup: RelationLookup) => MaybePromise<Iterable<unknown> | undefined>;
  readonly diagnostics?: () => MaybePromise<Iterable<TarstateDiagnostic>>;
};

/** Build a simple source from relation-name arrays. */
export function fromObjectSource(data: Record<string, readonly unknown[]>): RelationSource {
  return {
    rows: (relationRef) => data[relationRef.name] ?? []
  };
}

/**
 * Build an object source with equality lookup support.
 *
 * @remarks Fixture helper only; production adapters should own their index policy.
 */
export function fromIndexedObjectSource(data: Record<string, readonly unknown[]>): RelationSource {
  return {
    rows: (relationRef) => data[relationRef.name] ?? [],
    lookup: ({ relation: relationRef, field: fieldName, value: lookupValue }) =>
      (data[relationRef.name] ?? []).filter((row) => isRecord(row) && row[fieldName] === lookupValue)
  };
}

/**
 * Overlay multiple sources as one read source.
 *
 * @returns Concatenated rows/diagnostics; lookup if any child supports it.
 */
export function composeSources(...sources: readonly RelationSource[]): RelationSource {
  return {
    rows: async (relationRef) => {
      const rows = await Promise.all(sources.map(async (source) => Array.from(await source.rows(relationRef))));
      return rows.flat();
    },
    lookup: async (lookup) => {
      const lookups = await Promise.all(
        sources.map(async (source) => {
          if (source.lookup === undefined) {
            return undefined;
          }

          return source.lookup(lookup);
        })
      );

      const supported = lookups.filter((rows): rows is Iterable<unknown> => rows !== undefined);
      return supported.length === 0 ? undefined : supported.flatMap((rows) => Array.from(rows));
    },
    diagnostics: async () => {
      const diagnostics = await Promise.all(
        sources.map(async (source) => (source.diagnostics === undefined ? [] : Array.from(await source.diagnostics())))
      );
      return diagnostics.flat();
    }
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
