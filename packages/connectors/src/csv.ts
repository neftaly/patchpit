export type CsvRecord = {
  readonly row: number;
  readonly values: ReadonlyMap<string, string>;
};

export function parseCsvRecords(input: string): readonly CsvRecord[] {
  const rows = parseCsvRows(input).filter((row) => row.some((cell) => cell.trim() !== ''));
  const [headers, ...bodyRows] = rows;

  if (headers === undefined) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);

  return bodyRows.map((row, rowIndex) => {
    const values = new Map<string, string>();

    normalizedHeaders.forEach((header, cellIndex) => {
      if (header !== '') {
        values.set(header, row[cellIndex] ?? '');
      }
    });

    return {
      row: rowIndex + 2,
      values
    };
  });
}

function parseCsvRows(input: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';

      if (char === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  return rows;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
