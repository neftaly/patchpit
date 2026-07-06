import type { RelationSet, TarstateRow } from './protocol';

type RelationRows = RelationSet['relations'];

export function relationSetFromRows(relations: Readonly<Record<string, readonly unknown[]>>): RelationSet {
  return { relations: relations as RelationRows };
}

export function relationRows<Row extends object = TarstateRow>(
  relationSet: RelationSet,
  relation: string,
): readonly Row[] {
  return (relationSet.relations[relation] ?? []) as readonly Row[];
}

export function relationSetNames(relationSet: RelationSet): readonly string[] {
  return Object.keys(relationSet.relations).sort();
}

export function relationSetCounts(relationSet: RelationSet): Readonly<Record<string, number>> {
  return relationRowCounts(relationSet.relations);
}

export function relationRowCounts(relations: Readonly<Record<string, readonly unknown[]>>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(relations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, rows]) => [name, rows.length]),
  );
}
