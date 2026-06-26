import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 9208;
const apps = [
  {
    name: 'Patchpit shell',
    path: '/shell/',
    root: 'apps/patchpit-shell',
    port: 9209
  },
  {
    name: 'Tarstate example',
    path: '/tarstate/',
    root: 'apps/tarstate-example',
    port: 9210
  },
  {
    name: 'Royal examples',
    path: '/royal/',
    root: 'apps/royal-examples',
    port: 9211
  }
];

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = [];
let shuttingDown = false;
let server;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Patchpit dev</title>
  </head>
  <body>
    <ul>
${apps.map((app) => `      <li><a href="${app.path}">${app.name}</a></li>`).join('\n')}
    </ul>
  </body>
</html>
`;

const byRequestPath = (url = '/') =>
  apps.find((app) => url === app.path.slice(0, -1) || url.startsWith(app.path));

const shutdown = (code = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server?.close();
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 250).unref();
};

for (const app of apps) {
  const child = spawn(
    pnpm,
    [
      '--dir',
      app.root,
      'exec',
      'vite',
      '--config',
      '../../vite.config.ts',
      '--host',
      host,
      '--port',
      String(app.port),
      '--strictPort'
    ],
    {
      env: {
        ...process.env,
        BASE_PATH: app.path,
        DEV_ALL_PORT: String(port)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${app.root}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${app.root}] ${chunk}`));
  child.on('exit', (exitCode, signal) => {
    if (!shuttingDown) {
      console.error(`${app.name} dev server exited (${signal ?? exitCode}).`);
      shutdown(exitCode ?? 1);
    }
  });
}

const proxyHttp = (app, req, res) => {
  const proxyReq = http.request(
    {
      host,
      port: app.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: `${host}:${app.port}`
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Dev proxy failed for ${app.name}: ${error.message}\n`);
  });

  req.pipe(proxyReq);
};

const proxyWebSocket = (app, req, socket, head) => {
  const target = net.connect(app.port, host, () => {
    target.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries({
          ...req.headers,
          host: `${host}:${app.port}`
        })
          .filter((entry) => entry[1] !== undefined)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });

  target.on('error', () => socket.destroy());
};

server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  const app = byRequestPath(req.url);
  if (app === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found\n');
    return;
  }

  if (req.url === app.path.slice(0, -1)) {
    res.writeHead(302, { location: app.path });
    res.end();
    return;
  }

  proxyHttp(app, req, res);
});

server.on('upgrade', (req, socket, head) => {
  const app = byRequestPath(req.url);
  if (app === undefined) {
    socket.destroy();
    return;
  }

  proxyWebSocket(app, req, socket, head);
});

server.listen(port, host, () => {
  console.log(`Patchpit dev index: http://${host}:${port}/`);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
