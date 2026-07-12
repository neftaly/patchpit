import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxUrlMount } from './index.ts';

export const respondWithSandboxUrlMount = async (
  mount: SandboxUrlMount,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> => {
  const url = nodeRequestUrl(request);
  if (url === undefined) return false;
  const mountResponse = await mount.respond({
    method: request.method ?? 'GET',
    url: url.toString(),
  });
  if (mountResponse === undefined) return false;
  await writeNodeResponse(response, mountResponse);
  return true;
};

const nodeRequestUrl = (request: IncomingMessage): URL | undefined => {
  try {
    return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  } catch {
    return undefined;
  }
};

async function writeNodeResponse(response: ServerResponse, webResponse: Response) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}
