import { describe, expect, it } from 'vitest';
import {
  as,
  composeSources,
  defineSchema,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  number,
  pipe,
  project,
  ref,
  relation,
  string,
  where
} from '@tarstate/core';

type Product = {
  readonly id: string;
  readonly category: string;
  readonly price: number;
  readonly label: string;
};

type Inventory = {
  readonly productId: string;
  readonly stock: number;
  readonly warehouse: string;
};

type BenchData = {
  readonly products: readonly Product[];
  readonly inventory: readonly Inventory[];
};

type Sample = {
  readonly ms: number;
};

type BenchRow = {
  readonly scenario: string;
  readonly source: string;
  readonly inputRows: number;
  readonly outputRows: number;
  readonly p50Ms: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly rowsPerMs: string;
};

const TARGET_CATEGORY = 'category-3';
const SAMPLE_COUNT = 7;

const schema = defineSchema({
  products: relation<Product>({
    key: 'id',
    fields: {
      id: id('product'),
      category: string(),
      price: number(),
      label: string()
    }
  }),
  inventory: relation<Inventory>({
    key: 'productId',
    fields: {
      productId: ref('products.id'),
      stock: number(),
      warehouse: string()
    }
  })
});

const product = as(schema.products, 'product');
const inventory = as(schema.inventory, 'inventory');

const categoryInventoryRows = pipe(
  from(product),
  where(eq(product.category, TARGET_CATEGORY)),
  leftJoin(from(inventory), eq(product.id, inventory.productId)),
  project({
    id: product.id,
    label: product.label,
    price: product.price,
    stock: maybe(inventory.stock),
    warehouse: maybe(inventory.warehouse)
  })
);

describe('tarstate evaluator benchmark', () => {
  it('reports hand lower bound against scan and indexed evaluator paths', async () => {
    const rows: BenchRow[] = [];

    for (const size of [1_000, 5_000, 10_000]) {
      const data = makeData(size);

      rows.push(benchHand('category filter + inventory leftJoin', data));
      rows.push(await benchQuery('category filter + inventory leftJoin', data, 'tarstate scan', fromObjectSource));
      rows.push(
        await benchQuery(
          'category filter + inventory leftJoin',
          data,
          'tarstate indexed optimized',
          fromIndexedObjectSource
        )
      );
    }

    console.table(rows);
    expect(rows.every((row) => Number(row.p50Ms) > 0)).toBe(true);
  }, 60_000);
});

async function benchQuery(
  scenario: string,
  data: BenchData,
  source: string,
  sourceFactory: typeof fromObjectSource
): Promise<BenchRow> {
  const samples: Sample[] = [];
  let outputRows = 0;

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const sourceData = composeSources(
      sourceFactory({ products: data.products }),
      sourceFactory({ inventory: data.inventory })
    );
    const start = performance.now();
    const result = await evaluate(sourceData, categoryInventoryRows);
    const ms = performance.now() - start;

    expect(result.diagnostics).toEqual([]);
    samples.push({ ms });
    outputRows = result.rows.length;
  }

  return benchRow({
    scenario,
    source,
    inputRows: data.products.length,
    outputRows,
    samples
  });
}

function benchHand(scenario: string, data: BenchData): BenchRow {
  const samples: Sample[] = [];
  let outputRows = 0;

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const result = handRows(data);
    const ms = performance.now() - start;

    samples.push({ ms });
    outputRows = result.length;
  }

  return benchRow({
    scenario,
    source: 'hand lower bound',
    inputRows: data.products.length,
    outputRows,
    samples
  });
}

function handRows(data: BenchData): {
  readonly id: string;
  readonly label: string;
  readonly price: number;
  readonly stock: number | undefined;
  readonly warehouse: string | undefined;
}[] {
  const inventoryByProductId = new Map(data.inventory.map((item) => [item.productId, item]));
  const output: {
    id: string;
    label: string;
    price: number;
    stock: number | undefined;
    warehouse: string | undefined;
  }[] = [];

  for (const item of data.products) {
    if (item.category !== TARGET_CATEGORY) {
      continue;
    }

    const matchingInventory = inventoryByProductId.get(item.id);
    output.push({
      id: item.id,
      label: item.label,
      price: item.price,
      stock: matchingInventory?.stock,
      warehouse: matchingInventory?.warehouse
    });
  }

  return output;
}

function benchRow(input: {
  readonly scenario: string;
  readonly source: string;
  readonly inputRows: number;
  readonly outputRows: number;
  readonly samples: readonly Sample[];
}): BenchRow {
  const durations = input.samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const p50Ms = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...durations);

  return {
    scenario: input.scenario,
    source: input.source,
    inputRows: input.inputRows,
    outputRows: input.outputRows,
    p50Ms: fixed(p50Ms),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    rowsPerMs: fixed(input.outputRows / p50Ms)
  };
}

function makeData(size: number): BenchData {
  const products = Array.from({ length: size }, (_, index) => ({
    id: `product-${index}`,
    category: `category-${index % 8}`,
    price: index % 997,
    label: `Product ${index}`
  }));

  return {
    products,
    inventory: products.map((item, index) => ({
      productId: item.id,
      stock: 10 + (index % 90),
      warehouse: `warehouse-${index % 12}`
    }))
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
