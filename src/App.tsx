import { createSandboxFrameAttributes } from "@patchpit/sandbox";
import { sandboxCompatApp } from "../apps/sandbox-compat/app.ts";

export function App() {
  const frameAttributes = createSandboxFrameAttributes({
    baseUrl: window.location.href,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatApp.id,
  });

  return (
    <div
      style={{
        background:
          "conic-gradient(#ddd 25%, #fff 0 50%, #ddd 0 75%, #fff 0) 0/16px 16px",
        display: "flex",
        height: "100vh",
      }}
    >
      <iframe
        {...frameAttributes}
        title="Sandbox"
        style={{ border: 0, flex: 1 }}
      />
    </div>
  );
}
