import { sandboxDocumentPathKey, type SandboxDocumentPath } from "./path.ts";

export type SandboxDocumentBody = string | Blob | BufferSource;

export type SandboxFrameAttributes = {
  readonly referrerPolicy: "no-referrer";
  readonly sandbox: "allow-scripts";
  readonly src: string;
};

export type SandboxUrlMount = {
  readonly frame: SandboxFrameAttributes;
  readonly respond: (
    request: Request | URL | string,
  ) => Promise<Response | undefined>;
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

export type SandboxFrameOptions = Omit<SandboxUrlMountOptions, "files" | "mountId"> & {
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
  src: new URL(sandboxMountPath(route, sandboxId, entry), baseUrl).toString(),
});

export const createSandboxUrlMount = ({
  baseUrl,
  entry,
  files,
  mountId = crypto.randomUUID(),
  route = defaultSandboxRoute,
}: SandboxUrlMountOptions): SandboxUrlMount => {
  const plan = planSandboxDocument(entry, files);
  const base = new URL(baseUrl);
  const mountOrigin = base.origin;
  const scopePath = sandboxMountScopePath(route, mountId);
  const mountFiles = new Map(plan.files.map((file) => [file.path, file.file]));

  return {
    frame: createSandboxFrame({ baseUrl, entry, route, sandboxId: mountId }),
    respond: async (request) => {
      const path = sandboxMountRequestPath(request, route, mountId);
      if (path === undefined) return undefined;
      const file = mountFiles.get(path);
      if (file === undefined)
        return sandboxResponse("Not found", 404, "text/plain");
      const content = await file.read();
      if (content === undefined)
        return sandboxResponse("Not found", 404, "text/plain");
      return sandboxResponse(
        request instanceof Request && request.method === "HEAD"
          ? null
          : content.body,
        200,
        content.contentType ?? defaultSandboxContentType,
        mountOrigin,
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
) => {
  const entryPath = sandboxDocumentPathKey(entry);
  const plannedFiles = files.map((file) => ({
    file,
    path: sandboxDocumentPathKey(file.path),
  }));
  const duplicatePath = firstDuplicate(plannedFiles.map((file) => file.path));
  if (duplicatePath !== undefined)
    throw new Error(`Duplicate sandbox document path: ${duplicatePath}`);
  const entryFileIndex = plannedFiles.findIndex(
    (file) => file.path === entryPath,
  );
  if (entryFileIndex === -1)
    throw new Error(`Sandbox entry file is missing: ${entryPath}`);

  return { entryFileIndex, entryPath, files: plannedFiles };
};

const firstDuplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const defaultSandboxRoute = ["__patchpit", "sandbox"] as const;
const defaultSandboxContentType = "application/octet-stream";

const sandboxMountScopePath = (
  route: readonly string[],
  mountId: string,
): string => `/${[...route, mountId].map(encodeURIComponent).join("/")}/`;

const sandboxMountPath = (
  route: readonly string[],
  mountId: string,
  path: readonly string[],
): string =>
  `${sandboxMountScopePath(route, mountId)}${sandboxDocumentPathKey(path)}`;

const sandboxMountRequestPath = (
  request: Request | URL | string,
  route: readonly string[],
  mountId: string,
): string | undefined => {
  const url = new URL(request instanceof Request ? request.url : request);
  const segments = url.pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map(decodeURIComponent);
  const prefix = [...route, mountId];
  return sameSegments(segments.slice(0, prefix.length), prefix)
    ? sandboxDocumentPathKey(segments.slice(prefix.length))
    : undefined;
};

const sandboxResponse = (
  body: BodyInit | null,
  status: number,
  contentType: string,
  mountOrigin?: string,
): Response =>
  new Response(body, {
    headers: sandboxUrlMountHeaders(contentType, mountOrigin),
    status,
  });

export const sandboxUrlMountHeaders = (
  contentType: string,
  mountOrigin?: string,
): Record<string, string> => ({
  "Access-Control-Allow-Origin": "*",
  ...(mountOrigin === undefined
    ? {}
    : {
        "Content-Security-Policy":
          sandboxUrlMountContentSecurityPolicy(mountOrigin),
      }),
  "Content-Type": contentType,
  "Timing-Allow-Origin": "*",
});

export const sandboxUrlMountContentSecurityPolicy = (
  mountOrigin: string,
): string =>
  [
    `default-src 'none'`,
    `base-uri 'none'`,
    `connect-src ${mountOrigin}`,
    `font-src ${mountOrigin} data:`,
    `form-action 'none'`,
    `frame-src ${mountOrigin}`,
    `img-src ${mountOrigin} data:`,
    `media-src ${mountOrigin}`,
    `object-src 'none'`,
    `script-src 'unsafe-inline' ${mountOrigin}`,
    `style-src 'unsafe-inline' ${mountOrigin}`,
    `worker-src 'none'`,
  ].join("; ");

const sameSegments = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((segment, index) => segment === right[index]);
