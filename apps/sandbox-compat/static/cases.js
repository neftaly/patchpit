const caseTimeoutMs = 500;

const caseDefinitions = [
  compatCase('image-file-backed', 'pass', () => imageLoads('./relative-file.svg')),
  compatCase('image-url-backed-file', 'pass', () => imageLoads('./ghostscript-tiger.svg')),
  compatCase('fetch-relative-json', 'pass', fetchRelativeJson),
  compatCase('css-import-relative', 'fail', cssImportRelative),
  compatCase('css-url-relative', 'fail', cssUrlRelative),
  compatCase('dynamic-import-relative', 'fail', () =>
    import('./module-dep.js').then(() => pass(), () => fail('dynamic import rejected'))),
  compatCase('iframe-relative', 'pass', iframeRelative),
  compatCase('module-import-relative', 'fail', moduleImportRelative),
  compatCase('srcset-relative', 'fail', () => imageLoads(undefined, './srcset-file.svg 1x')),
  compatCase('worker-relative', 'fail', workerRelative),
];

const selectedCase = new URLSearchParams(location.hash.slice(1)).get('case');
const activeCases = selectedCase === null
  ? caseDefinitions
  : caseDefinitions.filter((definition) => definition.id === selectedCase);
if (activeCases.length === 0) throw new Error(`Unknown sandbox compat case: ${selectedCase}`);
const startedAt = performance.now();

const results = await Promise.all(activeCases.map(async ({ run, ...definition }) => ({
  ...definition,
  ...await run(),
})));

const report = {
  cases: results,
  durationMs: performance.now() - startedAt,
  type: 'sandbox-compat:report',
};

window.__sandboxCompatReport = report;
parent.postMessage(report, '*');

function compatCase(id, expectedSandbox, run) {
  return { expectedSandbox, id, run };
}

async function fetchRelativeJson() {
  try {
    const response = await fetch('./data.json');
    const data = await response.json();
    return data.ok === true ? pass() : fail('unexpected json body');
  } catch {
    return fail('fetch rejected');
  }
}

async function cssImportRelative() {
  const loaded = await loadStyle('./css-import.css');
  if (loaded.status === 'fail') return loaded;
  return getComputedStyle(document.body).getPropertyValue('--sandbox-compat-css-import').trim() === 'pass'
    ? pass()
    : fail('css import did not apply');
}

async function cssUrlRelative() {
  const before = resourceCount('css-url-file.svg');
  const loaded = await loadStyle('./css-url.css');
  if (loaded.status === 'fail') return loaded;
  await delay(200);
  return resourceCount('css-url-file.svg') > before
    ? pass()
    : fail('css url resource did not load');
}

function iframeRelative() {
  return finishWithin((finish) => {
    const onMessage = (event) => {
      if (event.data?.type === 'sandbox-compat:frame') {
        window.removeEventListener('message', onMessage);
        finish(pass());
      }
    };
    window.addEventListener('message', onMessage);
    const iframe = document.createElement('iframe');
    iframe.src = './frame.html';
    document.body.append(iframe);
  }, 'iframe did not report');
}

function moduleImportRelative() {
  return window.__sandboxCompatModuleImport === 'pass'
    ? pass()
    : finishWithin((finish) => {
      const report = () => finish(window.__sandboxCompatModuleImport === 'pass'
        ? pass()
        : fail('module import did not complete'));
      window.addEventListener('sandbox-compat:module-import', report, { once: true });
    }, 'module import did not complete');
}

function workerRelative() {
  return finishWithin((finish) => {
    let worker;
    try {
      worker = new Worker('./worker.js', { type: 'module' });
    } catch {
      finish(fail('worker construction rejected'));
      return;
    }
    worker.addEventListener('message', (event) => {
      worker.terminate();
      finish(event.data?.type === 'sandbox-compat:worker' ? pass() : fail('unexpected worker message'));
    }, { once: true });
    worker.addEventListener('error', () => {
      worker.terminate();
      finish(fail('worker error'));
    }, { once: true });
  }, 'worker did not report');
}

function pass() {
  return { status: 'pass' };
}

function fail(detail) {
  return { detail, status: 'fail' };
}

function imageLoads(src, srcset) {
  return finishWithin((finish) => {
    const image = new Image();
    image.addEventListener('load', () => finish(pass()), { once: true });
    image.addEventListener('error', () => finish(fail(`${src ?? srcset} image error`)), { once: true });
    if (srcset !== undefined) image.srcset = srcset;
    if (src !== undefined) image.src = src;
    document.body.append(image);
  }, `${src ?? srcset} image did not load`);
}

function loadStyle(href) {
  return finishWithin((finish) => {
    const link = document.createElement('link');
    link.addEventListener('load', () => finish(pass()), { once: true });
    link.addEventListener('error', () => finish(fail(`failed to load stylesheet: ${href}`)), { once: true });
    link.href = href;
    link.rel = 'stylesheet';
    document.head.append(link);
  }, `stylesheet did not load: ${href}`);
}

function finishWithin(start, timeoutDetail) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    start(finish);
    window.setTimeout(() => finish(fail(timeoutDetail)), caseTimeoutMs);
  });
}

function resourceCount(suffix) {
  return performance.getEntriesByType('resource')
    .filter((entry) => entry.name.endsWith(suffix))
    .length;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
