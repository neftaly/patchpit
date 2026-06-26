# Quest Dev Control

Patchpit should treat headset/browser control as a capability bridge, not as an
unrestricted remote-control channel.

## One Dev Path

Start the headset scene:

```sh
pnpm dev
```

The command starts Vite, then opens a dedicated Chromium dev profile at:

```text
https://localhost:1337/
```

That profile uses `--remote-debugging-port=9222`, so agents and DevTools can
attach without taking over the normal browser profile. Set `PATCHPIT_XR_OPEN=0`
to skip browser launch.

Open this in Quest Browser:

```text
https://xr.local:1337/
```

That is the intended dev path. `pnpm dev` always starts HTTPS on port `1337`
using Vite basic SSL for local XR testing.

On first load, the browser will show an invalid-certificate warning. For local
XR testing only, choose Advanced, then Proceed. This is a dev workaround, not a
product pattern.

If `xr.local` does not resolve yet, the alias needs host/router mDNS or DNS
setup; Patchpit still serves on port `1337`.

`pnpm lan:url` prints the same URL and DNS status.

## Trusted HTTPS Later

Do not make real users learn certificate bypasses. The longer-term product path
is a trusted HTTPS origin or relay that gives each local session a real
certificate and forwards only explicitly granted traffic to the local Patchpit
runtime. The relay should carry opaque stream/session data, not private local
files by default, and should be replaceable by a self-hosted origin.

## ADB Control

The first supported path is Android platform-tools over ADB:

1. Enable developer mode for the Quest.
2. Plug the headset into the Linux machine.
3. Accept USB debugging inside the headset.
4. Run `pnpm quest:browser status`.
5. If USB is visible but `adb` is missing, install Android platform-tools on the
   host or use the container path below.
6. Run `pnpm quest:browser devices`.
7. Run `pnpm quest:browser forward`.
8. Run `pnpm quest:browser tabs`.

`pnpm quest:browser usb` is a fast replug check. It uses `lsusb` only, so it can
confirm the Quest is visible even before `adb` is installed.

If a managed agent sandbox reports `spawnSync lsusb EPERM`, run the command in
the host terminal. The sandbox can block USB enumeration even when the host can
see the headset.

If the Quest browser package name changes, override it:

```sh
QUEST_BROWSER_PACKAGE=com.oculus.browser pnpm quest:browser open 'http://xr.local:1337/'
```

## Container Shape

The Meta desktop tools are not the core dependency for this path. A Linux
container only needs Android platform-tools plus USB passthrough.

The host still needs to grant the container access to the USB device and keep
the ADB key material stable:

```sh
docker run --rm -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v "$HOME/.android:/root/.android" \
  -v "$PWD:/work" \
  -w /work \
  ubuntu:24.04
```

Inside the container, install `adb`/platform-tools and run the same
`pnpm quest:browser ...` commands. Host-installed `adb` is simpler and should be
the default until the container path is needed for reproducibility.

## Control Model

There are two trust layers:

- ADB host keypair: approved physically in-headset. This proves the machine is
  allowed to debug the device.
- Patchpit capability token: short-lived, local-first, and scoped to a concrete
  action set such as `inspect-tabs`, `open-url`, `read-console`, or
  `drive-scene`.

Agents should not get raw device control by default. They should request a
capability, the user or policy broker grants it, and every exchange is logged.

## Driver Pattern

Use the same shape for hardware drivers:

- explicit device identity and provenance,
- narrow capability grants,
- schema-checked commands,
- replayable logs,
- fuzzable parsers,
- revocation,
- clear user-visible state,
- no hidden privileged reads.

Reverse engineering work must stay lawful, documented, and focused on
interoperability with devices and software we are allowed to inspect.

## Platform Targets

Royal/regl/WebGL2 is the main renderer target.

Compatibility and prototype tracks:

- WebXR: Quest-first interaction, VR session lifecycle, controller input, and
  headset performance telemetry.
- WebGL1: fallback feature gates and reduced material/geometry paths.
- iPad A10+ 6GB: memory/thermal profile and touch controls.
- Desktop RTX 3060: high-quality baseline and 1080p144/4k144 experiments.

Each target should report capability facts rather than guessing from user-agent
strings whenever possible.
