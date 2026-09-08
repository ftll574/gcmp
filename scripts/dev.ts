import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const gatewayHealthUrl = 'http://127.0.0.1:8787/api/schedules/health';
const viteArgs = process.argv.slice(2);
const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(tsxCli) || !existsSync(viteCli)) {
  throw new Error('Run npm install before npm run dev (local tsx/vite CLI not found)');
}

async function gatewayHealthy(timeoutMs = 600): Promise<boolean> {
  try {
    const response = await fetch(gatewayHealthUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { scope?: unknown };
    return payload.scope === 'scheduled-nonstop-passenger-flights';
  } catch {
    return false;
  }
}

function spawnNodeCli(cli: string, args: ReadonlyArray<string>): ChildProcess {
  return spawn(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
}

async function waitForGateway(child: ChildProcess, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Schedule gateway exited before becoming healthy (code ${child.exitCode})`);
    if (await gatewayHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for the schedule/live-route gateway on port 8787');
}

function stopChild(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
}

let ownedGateway: ChildProcess | null = null;
let vite: ChildProcess | null = null;
let shuttingDown = false;

function shutdown(exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  stopChild(vite);
  stopChild(ownedGateway);
  // Give child processes a moment to observe SIGTERM; Windows npm.cmd wrappers
  // may exit first, but their Node children receive the same console shutdown.
  setTimeout(() => process.exit(exitCode), 150);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => shutdown(0));
}

try {
  if (await gatewayHealthy()) {
    console.log('[dev] Reusing existing GCMP schedule/live-route gateway on http://127.0.0.1:8787');
  } else {
    console.log('[dev] Starting GCMP schedule/live-route gateway on http://127.0.0.1:8787');
    ownedGateway = spawnNodeCli(tsxCli, ['scripts/serve-schedules.ts']);
    await waitForGateway(ownedGateway);
  }

  vite = spawnNodeCli(viteCli, viteArgs);
  vite.once('exit', (code, signal) => {
    stopChild(ownedGateway);
    if (signal) shutdown(0);
    else shutdown(code ?? 1);
  });
  ownedGateway?.once('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] Schedule/live-route gateway stopped unexpectedly (code ${code ?? 'unknown'}).`);
      shutdown(code ?? 1);
    }
  });
} catch (error) {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
}
