# Patchpit Planned Architecture

This is the planned smaller Patchpit shape. Product UI is installed apps.
Trusted code is only the runtime, compositor/window manager, app host, and local
supervisor needed to enforce scope and sandboxing.

```mermaid
flowchart TB
  User[User]
  Bootstrap[Bootstrap install affordance]
  Setup[First-run setup script]

  subgraph Documents["Automerge documents"]
    Apps["/apps<br/>installed app manifests"]
    Home["/home<br/>user documents"]
    SystemApps["/system/apps<br/>durable app state docs"]
    SystemRuntime["/system/runtime<br/>diagnostics"]
    WorkspaceDoc["/system/window-manager.am<br/>workspace surfaces and sessions"]
  end

  subgraph Trusted["Trusted substrate"]
    Runtime["Runtime<br/>manifests, policy, routing, canonical writes"]
    Tarstate["Tarstate<br/>views, schemas, write lenses"]
    Compositor["Compositor / window manager<br/>surfaces, focus, tabs, reserved slots"]
    AppHost["Sandbox app host<br/>manifest entry, scope attachment, revocation"]
    Supervisor["Local supervisor<br/>OS sandbox, process limits, killability"]
  end

  subgraph AppServices["Scoped app services"]
    View["view(name, args)<br/>scoped read model"]
    Act["act(name, input)<br/>semantic write or route action"]
    Open["open(name, args)<br/>long-lived port or stream"]
  end

  subgraph InstalledApps["Installed apps"]
    Settings["Settings app<br/>app management UI"]
    Launcher["Launcher app<br/>reserved edge surface"]
    Files["Files app"]
    Viewer["Viewer app"]
    Terminal["Terminal app"]
    StateBrowser["State Browser app<br/>debug placement during migration"]
    OtherApps["Future apps"]
  end

  User --> Bootstrap
  Bootstrap --> Setup
  Setup --> Runtime
  Runtime --> Apps
  Runtime --> Home
  Runtime --> SystemApps
  Runtime --> SystemRuntime
  Runtime --> WorkspaceDoc
  Runtime --> Tarstate
  Tarstate --> View
  Runtime --> Act
  Runtime --> Open
  Runtime --> Compositor
  Compositor --> AppHost
  AppHost --> Supervisor
  AppHost --> AppServices
  AppServices --> InstalledApps
  Apps --> AppHost
  WorkspaceDoc --> Compositor
  Launcher --> Act
  Settings --> Act
  Files --> View
  Viewer --> View
  Terminal --> Open
```

## Rules

- `/apps` is the only installed-app registry.
- Settings, Launcher, Files, Viewer, Terminal, and State Browser are apps.
- The base bootstrap affordance can install the first apps, but it is not an app
  catalog, launcher, or package manager.
- Launcher placement is trusted compositor policy; Launcher rendering is normal
  app UI.
- Route and launch requests share one runtime admission path.
- Active app/session state is derived from workspace sessions and app-host
  diagnostics, not from a second app-instance registry.
- Apps see `view`, `act`, and `open`; projections, intents, and capabilities are
  runtime implementation categories.
- Tree metadata and file/media content travel separately.
- V0 is snapshot/reset-first for views and live-workspace-only for projections.
- The in-process bootstrap runtime is migration scaffolding. The planned owner
  is the SharedWorker runtime, with OS sandboxing added through a local
  supervisor where available.
