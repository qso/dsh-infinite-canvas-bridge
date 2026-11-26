import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_DATA_DIR_NAME,
  PROJECT_MARKER_FILE,
  PROJECT_SCHEMA_V1,
} from '../shared/constants.js';

const MAX_WALK_DEPTH = 7;

async function existsFile(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function resolveSessionCwd(ctx, sessionId) {
  if (!sessionId) return null;
  const sessions = ctx.get?.('sessions');
  const workingDirectory = ctx.get?.('workingDirectory');
  const live = sessions?.get?.(sessionId);
  if (live) {
    try {
      if (workingDirectory?.get) {
        const wd = workingDirectory.get(live);
        if (wd) return wd;
      }
    } catch {
      // Fallback to header cwd
    }
    if (live.header?.cwd) return live.header.cwd;
  }

  const projCache = ctx.get?.('sessionProjectionCache');
  if (projCache?.read) {
    try {
      const cached = await projCache.read(sessionId, 'workingDirectory');
      if (typeof cached === 'string' && cached.length > 0) return cached;
      if (cached && typeof cached === 'object' && typeof cached.value === 'string' && cached.value.length > 0) {
        return cached.value;
      }
    } catch {
      // Fallback to persistence stat
    }
  }

  const persistence = ctx.get?.('sessionPersistence');
  if (persistence?.stat) {
    try {
      const st = await persistence.stat(sessionId);
      if (st?.header?.cwd) return st.header.cwd;
    } catch {
      // Ignore missing persistence entry
    }
  }

  return null;
}

export function resolveAgentCwd(ctx, agent) {
  if (!agent) return null;
  const workingDirectory = ctx.get?.('workingDirectory');
  try {
    if (agent.session && workingDirectory?.get) {
      const wd = workingDirectory.get(agent.session);
      if (wd) return wd;
    }
  } catch {
    // Fallback
  }
  return agent.session?.header?.cwd ?? null;
}

/**
 * Walk upward from cwd looking for `.infinite-canvas.json`.
 */
export async function resolveCanvasProjectScope(cwd) {
  if (!cwd || typeof cwd !== 'string' || !path.isAbsolute(cwd)) {
    return { active: false, cwd: cwd ?? null };
  }

  const homeDir = os.homedir();
  let cur = path.resolve(cwd);

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth += 1) {
    const markerPath = path.join(cur, PROJECT_MARKER_FILE);
    if (await existsFile(markerPath)) {
      const config = await readJsonSafe(markerPath);
      if (config && config.schema === PROJECT_SCHEMA_V1) {
        const projectDir = cur;
        const rawDataDir = typeof config.data_dir === 'string' && config.data_dir.trim()
          ? config.data_dir.trim()
          : DEFAULT_DATA_DIR_NAME;
        const dataDir = path.resolve(projectDir, rawDataDir);
        const title = typeof config.title === 'string' && config.title.trim()
          ? config.title.trim()
          : path.basename(projectDir);
        const defaultProjectId = typeof config.default_project_id === 'string' && config.default_project_id.trim()
          ? config.default_project_id.trim()
          : null;
        const preferredPort = Number.isInteger(Number(config.port)) && Number(config.port) >= 1024 && Number(config.port) <= 65535
          ? Number(config.port)
          : null;

        return {
          active: true,
          cwd: path.resolve(cwd),
          projectDir,
          markerPath,
          dataDir,
          title,
          defaultProjectId,
          preferredPort,
          projectConfig: config,
        };
      }
    }

    const parent = path.dirname(cur);
    if (parent === cur || cur === homeDir) break;
    cur = parent;
  }

  return { active: false, cwd: path.resolve(cwd) };
}

export async function resolveScopeForSession(ctx, sessionId) {
  const cwd = await resolveSessionCwd(ctx, sessionId);
  return resolveCanvasProjectScope(cwd);
}

export async function resolveScopeForAgent(ctx, agent) {
  const cwd = resolveAgentCwd(ctx, agent);
  return resolveCanvasProjectScope(cwd);
}

/**
 * Initialize a directory as a folder-based Infinite Canvas project.
 * Creates `.infinite-canvas.json` and a git-safe `.gitignore` inside the data directory.
 */
export async function initCanvasProjectInDir(targetDir, options = {}) {
  if (!targetDir || !path.isAbsolute(targetDir)) {
    throw new Error('Target directory must be an absolute path.');
  }
  const projectDir = path.resolve(targetDir);
  await fs.mkdir(projectDir, { recursive: true });

  const markerPath = path.join(projectDir, PROJECT_MARKER_FILE);
  const existing = await resolveCanvasProjectScope(projectDir);
  if (existing.active && existing.projectDir === projectDir) {
    return { created: false, scope: existing };
  }

  const dataDirName = typeof options.dataDir === 'string' && options.dataDir.trim()
    ? options.dataDir.trim()
    : DEFAULT_DATA_DIR_NAME;
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : path.basename(projectDir);

  const manifest = {
    schema: PROJECT_SCHEMA_V1,
    title,
    data_dir: dataDirName,
    default_project_id: null,
  };

  const tmp = `${markerPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, markerPath);

  const dataDir = path.resolve(projectDir, dataDirName);
  await fs.mkdir(dataDir, { recursive: true });
  const gitignorePath = path.join(dataDir, '.gitignore');
  if (!(await existsFile(gitignorePath))) {
    await fs.writeFile(
      gitignorePath,
      [
        '# Runtime lock and port files managed by Infinite Canvas local server',
        '.canvas.lock',
        '.canvas.url',
        'private/',
        '.dsh-sessions/',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  const scope = await resolveCanvasProjectScope(projectDir);
  return { created: true, scope };
}

export async function updateDefaultProjectId(scope, projectId) {
  if (!scope?.active || !scope.markerPath) return;
  const current = await readJsonSafe(scope.markerPath);
  if (!current || current.schema !== PROJECT_SCHEMA_V1) return;
  const normalized = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
  if (current.default_project_id === normalized) return;
  const next = { ...current, default_project_id: normalized };
  const tmp = `${scope.markerPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, scope.markerPath);
}
