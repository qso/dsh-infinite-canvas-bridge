import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { EXPECTED_PROTOCOL_VERSION } from '../shared/constants.js';

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath) {
  try {
    const st = await fs.stat(dirPath);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function findAvailablePort(start, end, preferred = null, reservedPorts = new Set()) {
  if (preferred && !reservedPorts.has(preferred) && (await isPortFree(preferred))) {
    return preferred;
  }
  for (let port = start; port <= end; port += 1) {
    if (reservedPorts.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port available in range ${start}-${end}.`);
}

export async function probeCanvasServer(baseUrl, timeoutMs = 2500) {
  if (!baseUrl) return { reachable: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const [healthRes, configRes] = await Promise.all([
      fetch(`${baseUrl}/health`, { signal: controller.signal }),
      fetch(`${baseUrl}/config`, { signal: controller.signal }).catch(() => null),
    ]);
    if (!healthRes.ok) return { reachable: false };
    const health = await healthRes.json();
    const config = configRes && configRes.ok ? await configRes.json().catch(() => null) : null;
    return {
      reachable: true,
      url: baseUrl,
      health,
      config,
      protocolVersion: health?.protocolVersion ?? config?.protocolVersion ?? null,
      capabilities: {
        dshEmbed: Boolean(config?.capabilities?.dshEmbed),
        clientIdParam: Boolean(config?.capabilities?.clientIdParam),
        sharedConfigDir: Boolean(config?.capabilities?.sharedConfigDir),
        privateProxies: Boolean(config?.capabilities?.privateProxies),
      },
    };
  } catch {
    return { reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

async function detectRepoCliFlags(repoPath, entryPath) {
  try {
    const cliSource = path.join(repoPath, 'apps', 'cli', 'src', 'cli.ts');
    const target = (await fileExists(cliSource)) ? cliSource : entryPath;
    if (!target || !(await fileExists(target))) {
      return { supportsSharedConfigDir: false, supportsNoSaveConfig: false };
    }
    const text = await fs.readFile(target, 'utf8');
    return {
      supportsSharedConfigDir: text.includes('shared-config-dir'),
      supportsNoSaveConfig: text.includes('no-save-config'),
    };
  } catch {
    return { supportsSharedConfigDir: false, supportsNoSaveConfig: false };
  }
}

/**
 * Validate backend configuration and return actionable diagnostics for the UI & agent.
 */
export async function diagnoseBackend(config) {
  const backend = config.effectiveBackend;

  if (backend === 'external') {
    if (!config.externalUrl) {
      return {
        ok: false,
        backend,
        code: 'MISSING_EXTERNAL_URL',
        message: 'External backend mode requires an externalUrl (e.g. http://127.0.0.1:17371).',
      };
    }
    const probe = await probeCanvasServer(config.externalUrl);
    if (!probe.reachable) {
      return {
        ok: false,
        backend,
        code: 'EXTERNAL_UNREACHABLE',
        message: `Cannot reach Infinite Canvas server at ${config.externalUrl}. Start it first or check the URL.`,
      };
    }
    return {
      ok: true,
      backend,
      url: config.externalUrl,
      probe,
    };
  }

  if (backend === 'local-repo') {
    if (!config.repoPath || !(await dirExists(config.repoPath))) {
      return {
        ok: false,
        backend,
        code: 'REPO_NOT_FOUND',
        message: `Configured Infinite Canvas repository path does not exist: ${config.repoPath || '(empty)'}`,
        hint: 'Set repoPath to your local Infinite Canvas v1.0+ checkout or switch backendMode to "npx".',
      };
    }
    const cliDir = path.join(config.repoPath, 'apps', 'cli');
    if (!(await dirExists(cliDir))) {
      return {
        ok: false,
        backend,
        code: 'REPO_NOT_V1',
        message: `Directory ${config.repoPath} does not contain apps/cli (Infinite Canvas v1.0+ layout required).`,
        hint: 'Update your Infinite Canvas repository to v1.0.0 or newer.',
      };
    }

    if (config.repoRunMode === 'built') {
      const distEntry = path.join(cliDir, 'dist', 'index.js');
      const distUi = path.join(cliDir, 'dist', 'ui', 'index.html');
      if (!(await fileExists(distEntry)) || !(await fileExists(distUi))) {
        return {
          ok: false,
          backend,
          code: 'CLI_NOT_BUILT',
          message: `Built CLI bundle not found in ${cliDir}/dist.`,
          hint: `Run build in ${cliDir} (pnpm build:cli or ./node_modules/.bin/vite build --config ui/vite.config.ts && node build.mjs), or switch repoRunMode to "dev".`,
        };
      }
      const flags = await detectRepoCliFlags(config.repoPath, distEntry);
      return {
        ok: true,
        backend,
        repoRunMode: 'built',
        entryPath: distEntry,
        cwd: cliDir,
        flags,
      };
    }

    // dev mode
    const devEntry = path.join(cliDir, 'src', 'dev.ts');
    const tsxBin = path.join(config.repoPath, 'node_modules', '.bin', 'tsx');
    const cliTsxBin = path.join(cliDir, 'node_modules', '.bin', 'tsx');
    const resolvedTsx = (await fileExists(cliTsxBin)) ? cliTsxBin : (await fileExists(tsxBin)) ? tsxBin : null;
    if (!(await fileExists(devEntry)) || !resolvedTsx) {
      return {
        ok: false,
        backend,
        code: 'DEV_DEPS_MISSING',
        message: `Dev entry or tsx binary missing in ${config.repoPath}.`,
        hint: `Run "pnpm install" in ${config.repoPath}, or build the CLI bundle for built mode.`,
      };
    }
    const flags = await detectRepoCliFlags(config.repoPath, devEntry);
    return {
      ok: true,
      backend,
      repoRunMode: 'dev',
      entryPath: devEntry,
      tsxBin: resolvedTsx,
      cwd: cliDir,
      flags,
    };
  }

  // npx official fallback
  return {
    ok: true,
    backend: 'npx',
    npxPackage: config.npxPackage,
    flags: { supportsSharedConfigDir: false, supportsNoSaveConfig: false },
  };
}

export class CanvasProcessManager {
  constructor(getConfig) {
    this.getConfig = getConfig;
    /** @type {Map<string, { dataDir: string, url: string, port: number | null, managed: boolean, child: import('node:child_process').ChildProcess | null, backend: string, startedAt: number, logs: string[], capabilities: Record<string, boolean>, lastError: string | null }>} */
    this.instances = new Map();
    /** @type {Map<string, Promise<any>>} */
    this.starting = new Map();
    this.disposing = false;
  }

  getInstanceState(dataDir) {
    const key = path.resolve(dataDir);
    const inst = this.instances.get(key);
    if (!inst) return null;
    return {
      dataDir: inst.dataDir,
      url: inst.url,
      port: inst.port,
      managed: inst.managed,
      backend: inst.backend,
      startedAt: inst.startedAt,
      capabilities: inst.capabilities,
      lastError: inst.lastError,
      recentLogs: inst.logs.slice(-20),
    };
  }

  async checkExistingForDataDir(dataDir) {
    const key = path.resolve(dataDir);
    const existing = this.instances.get(key);
    if (existing?.url) {
      const probe = await probeCanvasServer(existing.url);
      if (probe.reachable) {
        existing.capabilities = probe.capabilities;
        existing.lastError = null;
        return { running: true, instance: existing, probe };
      }
      if (!existing.managed || !existing.child || existing.child.exitCode !== null) {
        this.instances.delete(key);
      }
    }

    // Check `.canvas.url` written by an already-running Infinite Canvas server for this dataDir
    const urlFile = path.join(key, '.canvas.url');
    try {
      const savedUrl = (await fs.readFile(urlFile, 'utf8')).trim();
      if (savedUrl && /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+/i.test(savedUrl)) {
        const probe = await probeCanvasServer(savedUrl);
        if (probe.reachable) {
          const port = Number(new URL(savedUrl).port) || null;
          const adopted = {
            dataDir: key,
            url: savedUrl,
            port,
            managed: false,
            child: null,
            backend: 'adopted',
            startedAt: Date.now(),
            logs: [],
            capabilities: probe.capabilities,
            lastError: null,
          };
          this.instances.set(key, adopted);
          return { running: true, instance: adopted, probe };
        }
      }
    } catch {
      // No reusable .canvas.url
    }

    return { running: false, instance: null, probe: null };
  }

  async ensureRunning(scope) {
    if (this.disposing) {
      throw new Error('Bridge plugin is shutting down.');
    }
    const config = await this.getConfig();

    if (config.effectiveBackend === 'external') {
      const diag = await diagnoseBackend(config);
      if (!diag.ok) {
        throw new Error(diag.message);
      }
      const key = path.resolve(scope.dataDir);
      const extInst = {
        dataDir: key,
        url: diag.url,
        port: Number(new URL(diag.url).port) || null,
        managed: false,
        child: null,
        backend: 'external',
        startedAt: Date.now(),
        logs: [],
        capabilities: diag.probe.capabilities,
        lastError: null,
      };
      this.instances.set(key, extInst);
      return { instance: extInst, probe: diag.probe };
    }

    const key = path.resolve(scope.dataDir);
    const already = await this.checkExistingForDataDir(key);
    if (already.running) {
      return { instance: already.instance, probe: already.probe };
    }

    if (this.starting.has(key)) {
      return await this.starting.get(key);
    }

    const startPromise = this.#spawnForScope(scope, config).finally(() => {
      this.starting.delete(key);
    });
    this.starting.set(key, startPromise);
    return await startPromise;
  }

  async #spawnForScope(scope, config) {
    const key = path.resolve(scope.dataDir);
    const diag = await diagnoseBackend(config);
    if (!diag.ok) {
      const detail = diag.hint ? `${diag.message} ${diag.hint}` : diag.message;
      throw new Error(detail);
    }

    await fs.mkdir(key, { recursive: true });
    if (config.useSharedConfigDir && config.sharedConfigDir && diag.flags?.supportsSharedConfigDir) {
      await fs.mkdir(config.sharedConfigDir, { recursive: true, mode: 0o700 });
    }

    const reservedPorts = new Set();
    for (const inst of this.instances.values()) {
      if (inst.port) reservedPorts.add(inst.port);
    }
    const port = await findAvailablePort(
      config.portRangeStart,
      config.portRangeEnd,
      scope.preferredPort,
      reservedPorts,
    );

    const cliArgs = ['serve', '--data-dir', key, '--port', String(port)];
    if (config.useSharedConfigDir && config.sharedConfigDir && diag.flags?.supportsSharedConfigDir) {
      cliArgs.push('--shared-config-dir', config.sharedConfigDir);
    }
    if (diag.flags?.supportsNoSaveConfig) {
      cliArgs.push('--no-save-config');
    }

    let command;
    let args;
    let cwd;
    const env = { ...process.env };

    if (diag.backend === 'local-repo') {
      env.INFINITE_CANVAS_REPO_ROOT = config.repoPath;
      cwd = diag.cwd;
      if (diag.repoRunMode === 'built') {
        command = process.execPath;
        args = [diag.entryPath, ...cliArgs];
      } else {
        command = diag.tsxBin;
        args = [diag.entryPath, ...cliArgs];
      }
    } else {
      command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      args = ['-y', config.npxPackage, ...cliArgs];
      cwd = scope.projectDir;
    }

    const logs = [];
    const pushLog = (chunk) => {
      const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        logs.push(line);
        if (logs.length > 80) logs.shift();
      }
    };

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', pushLog);
    child.stderr?.on('data', pushLog);

    let exitedEarly = null;
    child.once('exit', (code, signal) => {
      exitedEarly = { code, signal };
      const cur = this.instances.get(key);
      if (cur && cur.child === child) {
        cur.lastError = `Process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
        this.instances.delete(key);
      }
    });

    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + config.startupTimeoutMs;
    let probe = { reachable: false };

    while (Date.now() < deadline) {
      if (exitedEarly) {
        const tail = logs.slice(-8).join('\n');
        throw new Error(
          `Infinite Canvas server exited before becoming ready (code=${exitedEarly.code ?? 'null'}).${tail ? `\n${tail}` : ''}`,
        );
      }
      probe = await probeCanvasServer(url, 1500);
      if (probe.reachable) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!probe.reachable) {
      await this.#killChild(child);
      const tail = logs.slice(-8).join('\n');
      throw new Error(
        `Timed out waiting for Infinite Canvas server at ${url} (${config.startupTimeoutMs}ms).${tail ? `\n${tail}` : ''}`,
      );
    }

    if (probe.protocolVersion && probe.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
      pushLog(`Warning: protocolVersion=${probe.protocolVersion} (expected ${EXPECTED_PROTOCOL_VERSION})`);
    }

    const inst = {
      dataDir: key,
      url,
      port,
      managed: true,
      child,
      backend: diag.backend === 'local-repo' ? `local-repo:${diag.repoRunMode}` : diag.backend,
      startedAt: Date.now(),
      logs,
      capabilities: probe.capabilities,
      lastError: null,
    };
    this.instances.set(key, inst);
    return { instance: inst, probe };
  }

  async stopForDataDir(dataDir) {
    const key = path.resolve(dataDir);
    const inst = this.instances.get(key);
    if (!inst) return { stopped: false };
    this.instances.delete(key);
    if (inst.managed && inst.child) {
      await this.#killChild(inst.child);
      return { stopped: true, managed: true };
    }
    return { stopped: false, managed: false };
  }

  async restartForScope(scope) {
    await this.stopForDataDir(scope.dataDir);
    return await this.ensureRunning(scope);
  }

  async disposeAll() {
    this.disposing = true;
    const tasks = [];
    for (const [key, inst] of this.instances.entries()) {
      this.instances.delete(key);
      if (inst.managed && inst.child) {
        tasks.push(this.#killChild(inst.child));
      }
    }
    await Promise.allSettled(tasks);
  }

  async #killChild(child) {
    if (!child || child.exitCode !== null || child.killed) return;
    await new Promise((resolve) => {
      const hardTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(hardTimer);
        resolve();
      });
      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(hardTimer);
        resolve();
      }
    });
  }
}
