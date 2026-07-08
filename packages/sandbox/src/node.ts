import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxUrlMount } from './index.ts';

export const respondWithSandboxUrlMount = async (
  mount: SandboxUrlMount,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const webRequest = nodeRequestToWebRequest(url, request.method);
  if (webRequest === undefined) return false;
  const mountResponse = await mount.respond(webRequest);
  if (mountResponse === undefined) return false;
  await writeNodeResponse(response, mountResponse);
  return true;
};

const nodeRequestToWebRequest = (url: URL, method = 'GET'): Request | undefined => {
  try {
    return new Request(url, { method });
  } catch {
    return undefined;
  }
};

async function writeNodeResponse(response: ServerResponse, webResponse: Response) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}
