import dns from 'node:dns/promises';
import os from 'node:os';

const port = readPort(process.argv[2] ?? process.env.PORT, 1337);
const aliasName = localNameFromLabel(process.argv[3] ?? process.env.PATCHPIT_LAN_ALIAS ?? 'xr');
const networkUrls = readLanAddresses().map((address) => `https://${address}:${port}/`);

console.log(`local:   https://localhost:${port}/`);
console.log(`network: ${networkUrls[0] ?? 'unavailable'}`);
console.log(`headset: https://${aliasName}:${port}/`);

try {
  const resolved = await dns.lookup(aliasName);
  console.log(`DNS check:    ${aliasName} resolves to ${resolved.address}`);
} catch (error) {
  console.log(`DNS check:    ${aliasName} does not resolve on this machine yet`);
}

function readPort(input, fallback) {
  const parsed = Number.parseInt(input ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readLanAddresses() {
  try {
    return Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => item.address)
      .sort();
  } catch {
    return [];
  }
}

function localNameFromLabel(input) {
  const label = input.endsWith('.local') ? input.slice(0, -'.local'.length) : input;

  if (!/^[a-z0-9-]{1,63}$/i.test(label) || label.startsWith('-') || label.endsWith('-')) {
    throw new Error(`Invalid mDNS alias label: ${input}`);
  }

  return `${label.toLowerCase()}.local`;
}
