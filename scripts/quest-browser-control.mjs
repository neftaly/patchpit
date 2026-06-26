#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const command = process.argv[2] ?? 'status';
const args = process.argv.slice(3);
const devtoolsPort = Number.parseInt(process.env.QUEST_DEVTOOLS_PORT ?? '9222', 10);
const browserPackage = process.env.QUEST_BROWSER_PACKAGE ?? 'com.oculus.browser';

const questUsbPattern = /(?:Oculus|Meta|Quest|2833:5013)/i;
const commands = new Set(['devices', 'forward', 'open', 'packages', 'status', 'tabs', 'usb']);

if (!commands.has(command)) {
  usage(1);
}

if (command === 'status') {
  printUsbStatus();

  if (!hasAdb()) {
    printAdbMissing();
    process.exit(1);
  }

  adb(['devices', '-l']);
  console.log('');
  await printTabs(false);
} else if (command === 'devices') {
  requireAdb();
  adb(['devices', '-l']);
} else if (command === 'packages') {
  requireAdb();
  adb(['shell', 'pm', 'list', 'packages']);
} else if (command === 'forward') {
  requireAdb();
  adb(['forward', `tcp:${devtoolsPort}`, 'localabstract:chrome_devtools_remote']);
  console.log(`forwarded http://127.0.0.1:${devtoolsPort}/json/list`);
} else if (command === 'tabs') {
  await printTabs(true);
} else if (command === 'usb') {
  printUsbStatus();
} else if (command === 'open') {
  const url = args[0];

  if (url === undefined || url.length === 0) {
    console.error('usage: pnpm quest:browser open <url>');
    process.exit(1);
  }

  requireAdb();
  adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    url,
    browserPackage
  ]);
}

function usage(exitCode) {
  console.error([
    'usage: pnpm quest:browser <command>',
    '',
    'commands:',
    '  status    show ADB devices and forwarded browser tabs if available',
    '  devices   show ADB devices',
    '  usb       show visible USB devices and Quest matches',
    '  packages  list Android packages on the headset',
    '  forward   forward Quest browser DevTools to localhost',
    '  tabs      list forwarded browser tabs',
    '  open URL  ask the Quest browser package to open a URL',
    '',
    'env:',
    '  QUEST_DEVTOOLS_PORT=9222',
    '  QUEST_BROWSER_PACKAGE=com.oculus.browser'
  ].join('\n'));
  process.exit(exitCode);
}

function requireAdb() {
  if (hasAdb()) {
    return;
  }

  printAdbMissing();
  process.exit(1);
}

function hasAdb() {
  return spawnSync('adb', ['version'], { encoding: 'utf8' }).status === 0;
}

function printAdbMissing() {
  console.error([
    'adb is not available on PATH.',
    'Install Android platform-tools on the host, or run this script from a container with USB passthrough.',
    'The Quest must have developer mode enabled and USB debugging accepted in-headset.'
  ].join('\n'));
}

function printUsbStatus() {
  const result = spawnSync('lsusb', [], { encoding: 'utf8' });

  if (result.status !== 0) {
    const reason = result.error instanceof Error ? result.error.message : (result.stderr.trim() || `exit ${result.status}`);
    console.log(`USB scan unavailable: ${reason}`);
    console.log('If this is running under a sandbox, run the same command in the host terminal.');
    return;
  }

  const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
  const questLines = lines.filter((line) => questUsbPattern.test(line));

  if (questLines.length === 0) {
    console.log('Quest USB: not visible');
    console.log('Try waking the headset, reconnecting USB, and accepting any in-headset permission prompt.');
    return;
  }

  console.log('Quest USB: visible');
  for (const line of questLines) {
    console.log(`  ${line}`);
  }
}

function adb(args) {
  const result = spawnSync('adb', args, { encoding: 'utf8', stdio: 'inherit' });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function printTabs(requireForward) {
  try {
    const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const tabs = await response.json();
    console.log(JSON.stringify(tabs, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (requireForward) {
      console.error(`DevTools tabs unavailable: ${message}`);
      console.error(`run: pnpm quest:browser forward`);
      process.exit(1);
    }

    console.log(`DevTools tabs unavailable: ${message}`);
    console.log(`run: pnpm quest:browser forward`);
  }
}
