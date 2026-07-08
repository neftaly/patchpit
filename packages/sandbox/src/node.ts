import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxUrlMount } from './index.ts';

export const respondWithSandboxUrlMount = async (
  mount: SandboxUrlMount,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const mountResponse = await mount.respond(new Request(url, { method: request.method ?? 'GET' }));
  if (mountResponse === undefined) return false;
  await writeNodeResponse(response, mountResponse);
  return true;
};

async function writeNodeResponse(response: ServerResponse, webResponse: Response) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}
