import { sandboxDocumentPathKey, type SandboxDocumentPath } from "./path.ts";

export type SandboxDocumentBody = string | Blob | BufferSource;

export type SandboxFrameAttributes = {
  readonly referrerPolicy: "no-referrer";
  readonly sandbox: "allow-scripts";
  readonly src: string;
};

export type SandboxUrlMount = {
  readonly frame: SandboxFrameAttributes;
  readonly respond: (request: Request) => Promise<Response | undefined>;
  readonly scopePath: string;
};

export type SandboxUrlMountFile = {
  readonly path: SandboxDocumentPath;
  readonly read: () =>
    | Promise<SandboxUrlMountFileContent | undefined>
    | SandboxUrlMountFileContent
    | undefined;
};

export type SandboxUrlMountFileContent = {
  readonly body: SandboxDocumentBody;
  readonly contentType?: string;
};

type SandboxUrlMountOptions = {
  readonly baseUrl: string | URL;
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxUrlMountFile[];
  readonly mountId?: string;
  readonly route?: readonly string[];
};

export type SandboxFrameOptions = {
  readonly baseUrl: string | URL;
  readonly entry: SandboxDocumentPath;
  readonly route?: readonly string[];
  readonly sandboxId: string;
};

export const createSandboxFrame = ({
  baseUrl,
  entry,
  sandboxId,
  route = defaultSandboxRoute,
}: SandboxFrameOptions): SandboxFrameAttributes => ({
  referrerPolicy: "no-referrer",
  sandbox: "allow-scripts",
  src: new URL(
    `${sandboxMountScopePath(route, sandboxId)}${sandboxDocumentPathKey(entry)}`,
    baseUrl,
  ).toString(),
});

export const createSandboxUrlMount = ({
  baseUrl,
  entry,
  files,
  mountId = crypto.randomUUID(),
  route = defaultSandboxRoute,
}: SandboxUrlMountOptions): SandboxUrlMount => {
  const mountFiles = planSandboxDocument(entry, files);
  const base = new URL(baseUrl);
  const mountOrigin = base.origin;
  const scopePath = sandboxMountScopePath(route, mountId);
  const mountSource = `${mountOrigin}${scopePath}`;

  return {
    frame: createSandboxFrame({ baseUrl, entry, route, sandboxId: mountId }),
    respond: async (request) => {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(scopePath)) return undefined;
      if (request.method !== "GET" && request.method !== "HEAD")
        return sandboxResponse("Method not allowed", 405, "text/plain", mountSource, {
          Allow: "GET, HEAD",
        });
      const path = sandboxPathKey(url.pathname.slice(scopePath.length));
      const content = path === undefined ? undefined : await mountFiles.get(path)?.read();
      if (content === undefined)
        return sandboxResponse("Not found", 404, "text/plain", mountSource);
      return sandboxResponse(
        request.method === "HEAD" ? null : content.body,
        200,
        content.contentType ?? defaultSandboxContentType,
        mountSource,
      );
    },
    scopePath,
  };
};

export const planSandboxDocument = <
  TFile extends { readonly path: SandboxDocumentPath },
>(
  entry: SandboxDocumentPath,
  files: readonly TFile[],
): ReadonlyMap<string, TFile> => {
  const entryPath = sandboxDocumentPathKey(entry);
  const plannedFiles = new Map<string, TFile>();
  for (const file of files) {
    const path = sandboxDocumentPathKey(file.path);
    if (plannedFiles.has(path))
      throw new Error(`Duplicate sandbox document path: ${path}`);
    plannedFiles.set(path, file);
  }
  if (!plannedFiles.has(entryPath))
    throw new Error(`Sandbox entry file is missing: ${entryPath}`);

  return plannedFiles;
};

const defaultSandboxRoute = ["__patchpit", "sandbox"] as const;
const defaultSandboxContentType = "application/octet-stream";

const sandboxMountScopePath = (
  route: readonly string[],
  mountId: string,
): string => `/${[...route, mountId].map(encodeURIComponent).join("/")}/`;

const sandboxPathKey = (pathname: string): string | undefined => {
  try {
    return sandboxDocumentPathKey(
      pathname.split("/").filter((segment) => segment !== "").map(decodeURIComponent),
    );
  } catch {
    return undefined;
  }
};

const sandboxResponse = (
  body: BodyInit | null,
  status: number,
  contentType: string,
  mountSource: string,
  headers: Record<string, string> = {},
): Response =>
  new Response(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Security-Policy": sandboxUrlMountContentSecurityPolicy(mountSource),
      "Content-Type": contentType,
      "Timing-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
    status,
  });

const sandboxUrlMountContentSecurityPolicy = (
  mountSource: string,
): string =>
  [
    `default-src 'none'`,
    `sandbox allow-scripts`,
    `base-uri 'none'`,
    `connect-src ${mountSource}`,
    `font-src ${mountSource} data:`,
    `form-action 'none'`,
    `frame-src ${mountSource}`,
    `img-src ${mountSource} data:`,
    `media-src ${mountSource}`,
    `object-src 'none'`,
    `script-src 'unsafe-inline' ${mountSource}`,
    `style-src 'unsafe-inline' ${mountSource}`,
    `worker-src 'none'`,
  ].join("; ");
