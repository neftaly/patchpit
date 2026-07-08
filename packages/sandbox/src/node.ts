import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxUrlMount } from './index.ts';

export const respondWithSandboxUrlMount = async (
  mount: SandboxUrlMount,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const methodResponse = sandboxUrlMountMethodResponse(mount, url, request.method);
  if (methodResponse !== undefined) {
    await writeNodeResponse(response, methodResponse);
    return true;
  }
  const mountResponse = await mount.respond(new Request(url, { method: request.method ?? 'GET' }));
  if (mountResponse === undefined) return false;
  await writeNodeResponse(response, mountResponse);
  return true;
};

export const sandboxUrlMountMethodResponse = (
  mount: Pick<SandboxUrlMount, 'scopePath'>,
  url: URL,
  method = 'GET',
): Response | undefined => {
  if (!url.pathname.startsWith(mount.scopePath)) return undefined;
  if (method === 'GET' || method === 'HEAD') return undefined;
  return new Response('Method not allowed', {
    headers: {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain',
    },
    status: 405,
  });
};

export async function writeNodeResponse(response: ServerResponse, webResponse: Response) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}
