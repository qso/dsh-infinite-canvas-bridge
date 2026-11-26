import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BACKEND_MODES,
  DEFAULT_NPX_PACKAGE,
  DEFAULT_PORT_RANGE_END,
  DEFAULT_PORT_RANGE_START,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  REPO_RUN_MODES,
} from '../shared/constants.js';

export const USER_CONFIG_DIR = path.join(os.homedir(), '.dsh-infinite-canvas-bridge');
export const USER_CONFIG_FILE = path.join(USER_CONFIG_DIR, 'config.json');
export const DEFAULT_SHARED_CONFIG_DIR = path.join(os.homedir(), '.infinite-canvas', 'shared');

export function expandHome(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function clampInt(val, fallback, min, max) {
  const num = Number(val);
  if (!Number.isInteger(num) || num < min || num > max) return fallback;
  return num;
}

function normalizeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const u = new URL(raw.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.origin;
  } catch {
    return '';
  }
}

export function normalizeBridgeConfig(pluginConfig = {}, userOverrides = {}, env = process.env) {
  const merged = {
    ...pluginConfig,
    ...userOverrides,
  };

  const envBackendMode = env?.DSH_INFINITE_CANVAS_MODE?.trim();
  const envRepoPath = env?.DSH_INFINITE_CANVAS_REPO?.trim();
  const envRepoRunMode = env?.DSH_INFINITE_CANVAS_REPO_RUN_MODE?.trim();
  const envExternalUrl = env?.DSH_INFINITE_CANVAS_URL?.trim();
  const envSharedConfigDir = env?.DSH_INFINITE_CANVAS_SHARED_CONFIG_DIR?.trim();
  const envNpxPackage = env?.DSH_INFINITE_CANVAS_NPX_PACKAGE?.trim();

  const rawBackendMode = envBackendMode || merged.backendMode || 'auto';
  const backendMode = BACKEND_MODES.includes(rawBackendMode) ? rawBackendMode : 'auto';

  const rawRepoRunMode = envRepoRunMode || merged.repoRunMode || 'built';
  const repoRunMode = REPO_RUN_MODES.includes(rawRepoRunMode) ? rawRepoRunMode : 'built';

  const repoPathRaw = expandHome(envRepoPath || merged.repoPath || '');
  const repoPath = repoPathRaw ? path.resolve(repoPathRaw) : '';

  const externalUrl = normalizeUrl(envExternalUrl || merged.externalUrl || '');

  const sharedConfigRaw = expandHome(
    envSharedConfigDir !== undefined
      ? envSharedConfigDir
      : merged.sharedConfigDir !== undefined
        ? merged.sharedConfigDir
        : DEFAULT_SHARED_CONFIG_DIR,
  );
  const sharedConfigDir = sharedConfigRaw ? path.resolve(sharedConfigRaw) : '';

  const npxPackage = String(envNpxPackage || merged.npxPackage || DEFAULT_NPX_PACKAGE).trim() || DEFAULT_NPX_PACKAGE;
  const portRangeStart = clampInt(merged.portRangeStart, DEFAULT_PORT_RANGE_START, 1024, 65000);
  const portRangeEnd = clampInt(merged.portRangeEnd, DEFAULT_PORT_RANGE_END, portRangeStart, 65535);
  const startupTimeoutMs = clampInt(merged.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS, 3000, 120000);
  const toolTimeoutMs = clampInt(merged.toolTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS, 5000, 180000);
  const autoStart = merged.autoStart !== false;
  const useSharedConfigDir = merged.useSharedConfigDir !== false;

  let effectiveBackend = backendMode;
  if (effectiveBackend === 'auto') {
    if (externalUrl) effectiveBackend = 'external';
    else if (repoPath) effectiveBackend = 'local-repo';
    else effectiveBackend = 'npx';
  }

  return {
    backendMode,
    effectiveBackend,
    newSessionCanvas: ['blank', 'open', 'choose'].includes(merged.newSessionCanvas) ? merged.newSessionCanvas : 'blank',
    repoPath,
    repoRunMode,
    externalUrl,
    npxPackage,
    sharedConfigDir,
    useSharedConfigDir,
    portRangeStart,
    portRangeEnd,
    startupTimeoutMs,
    toolTimeoutMs,
    autoStart,
  };
}

export async function readUserConfigOverrides(filePath = USER_CONFIG_FILE) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeUserConfigOverrides(patch, filePath = USER_CONFIG_FILE) {
  const existing = await readUserConfigOverrides(filePath);
  const next = { ...existing, ...patch };
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, filePath);
  return next;
}
