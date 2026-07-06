export default async function activate(env) {
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';
  const main = document.createElement('main');
  main.style.cssText = 'display:grid;place-content:center;min-height:100%;gap:0.5rem;font:16px system-ui,sans-serif;text-align:center;';
  const heading = document.createElement('h1');
  heading.textContent = 'Hello from /apps/hello-world';
  const detail = document.createElement('p');
  detail.textContent = 'Requesting host launch view...';
  main.append(heading, detail);
  root.append(main);

  try {
    if (typeof env.services?.view !== 'function') {
      throw new Error('view service unavailable');
    }
    const launch = await env.services.view({ name: 'launch' });
    const session = launch?.session ?? env.session;
    detail.textContent = 'Launch view: ' + (launch?.appId ?? env.appId) + ' / ' + session.id;
    const url = document.createElement('p');
    url.textContent = 'Session URL: ' + session.url;
    main.append(url);
  } catch (error) {
    detail.textContent = 'Launch view unavailable: ' + (error instanceof Error ? error.message : String(error));
  }
}
