import { expect, type Page, test } from 'playwright/test';

type RelationName = 'effectResults' | 'fullscreen';

type EffectResultRow = {
  readonly kind: string;
  readonly status: string;
  readonly message: string;
  readonly valueJson: string;
};

type FullscreenRow = {
  readonly active: boolean;
  readonly available: boolean;
  readonly mode: string;
  readonly activationRequired?: boolean;
  readonly activationActive?: boolean;
  readonly lastOutcome?: string;
  readonly lastErrorName?: string;
};

test.describe('fullscreen browser activation', () => {
  test('drives requestFullscreen from the real UI click path', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fullscreen-toggle').click();

    const result = await waitForFullscreenResult(page);
    expect(['ok', 'unsupported', 'denied']).toContain(result.status);
    expect(result.valueJson).toContain('"mode":"browser"');
    expect(result.valueJson).toContain('"activationRequired":true');

    const [fullscreen] = await relationRows<FullscreenRow>(page, 'fullscreen');
    expect(fullscreen?.mode).toBe('browser');
    expect(fullscreen?.activationRequired).toBe(true);

    if (result.status === 'ok') {
      expect(fullscreen).toMatchObject({
        active: true,
        available: true,
        lastOutcome: 'active'
      });
    } else {
      expect(['unsupported', 'denied']).toContain(fullscreen?.lastOutcome);
      expect(result.message).toMatch(/fullscreen|unavailable|rejected/i);
    }
  });

  test('records a typed outcome for a non-trusted programmatic click', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fullscreen-toggle').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });

    const result = await waitForFullscreenResult(page);
    expect(['ok', 'unsupported', 'denied']).toContain(result.status);
    expect(result.valueJson).toContain('"mode":"browser"');
    expect(result.valueJson).toContain('"activationRequired":true');

    const [fullscreen] = await relationRows<FullscreenRow>(page, 'fullscreen');
    expect(fullscreen?.mode).toBe('browser');

    if (result.status === 'denied') {
      expect(fullscreen).toMatchObject({
        active: false,
        activationActive: false,
        lastOutcome: 'denied'
      });
      expect(fullscreen?.lastErrorName).toMatch(/NotAllowedError|SecurityError/);
    } else if (result.status === 'unsupported') {
      expect(fullscreen).toMatchObject({
        active: false,
        available: false,
        lastOutcome: 'unsupported'
      });
    } else {
      expect(fullscreen).toMatchObject({
        active: true,
        available: true,
        lastOutcome: 'active'
      });
    }
  });
});

async function waitForFullscreenResult(page: Page): Promise<EffectResultRow> {
  let result: EffectResultRow | undefined;

  await expect.poll(async () => {
    const rows = await relationRows<EffectResultRow>(page, 'effectResults');
    result = rows.find((row) => row.kind === 'fullscreen.enter');
    return result?.status ?? null;
  }, {
    message: 'fullscreen.enter result row'
  }).not.toBeNull();

  if (result === undefined) {
    throw new Error('fullscreen.enter result row was not recorded');
  }

  return result;
}

async function relationRows<Row>(page: Page, relation: RelationName): Promise<readonly Row[]> {
  await page.getByTestId('relation-select').selectOption(relation);
  const rawJson = await page.getByTestId('relation-json').textContent();
  return JSON.parse(rawJson ?? '[]') as readonly Row[];
}
