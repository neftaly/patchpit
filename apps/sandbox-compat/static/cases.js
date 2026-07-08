const caseDefinitions = [
  { expectedSandbox: 'pass', id: 'img-relative' },
  { expectedSandbox: 'fail', id: 'module-import-relative' },
];

const selectedCase = new URLSearchParams(location.hash.slice(1)).get('case');
const activeCases = selectedCase === null
  ? caseDefinitions
  : caseDefinitions.filter((definition) => definition.id === selectedCase);
if (activeCases.length === 0) throw new Error(`Unknown sandbox compat case: ${selectedCase}`);
const startedAt = performance.now();

const caseRunners = {
  'img-relative': () => new Promise((resolve) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(pass()), { once: true });
    image.addEventListener('error', () => resolve(fail('image error')), { once: true });
    image.src = './relative-file.svg';
    document.body.append(image);
  }),
  'module-import-relative': () =>
    window.__sandboxCompatModuleImport === 'pass'
      ? pass()
      : new Promise((resolve) => {
        const finish = () => resolve(window.__sandboxCompatModuleImport === 'pass'
          ? pass()
          : fail('module import did not complete'));
        window.addEventListener('sandbox-compat:module-import', finish, { once: true });
        window.setTimeout(finish, 500);
      }),
};

const results = await Promise.all(activeCases.map(async (definition) => ({
  ...definition,
  ...await caseRunners[definition.id](),
})));

const report = {
  cases: results,
  durationMs: performance.now() - startedAt,
  type: 'sandbox-compat:report',
};

window.__sandboxCompatReport = report;
parent.postMessage(report, '*');

function pass() {
  return { status: 'pass' };
}

function fail(detail) {
  return { detail, status: 'fail' };
}
