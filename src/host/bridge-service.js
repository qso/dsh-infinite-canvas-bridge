import crypto from 'node:crypto';
import {
  normalizeBridgeConfig,
  readUserConfigOverrides,
  writeUserConfigOverrides,
} from './config.js';
import {
  CanvasProcessManager,
  diagnoseBackend,
  probeCanvasServer,
} from './process-manager.js';
import { initCanvasProjectInDir } from './scope-resolver.js';

import { createLegacyView } from './legacy-view.js';
import { listProjects, selectProject } from './canvas-selection.js';

export function deriveClientIdForSession(sessionId) {
  const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 32);
  const hash = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 10);
  return `dsh-${safe || 'sess'}-${hash}`;
}

export class InfiniteCanvasBridgeService {
  constructor(pluginConfig = {}, options = {}) {
    this.pluginConfig = pluginConfig && typeof pluginConfig === 'object' ? pluginConfig : {};
    this.userConfigPath = options.userConfigPath;
    this.processManager = new CanvasProcessManager(() => this.getConfig());
    this.sessions = new Map();
  }

  async getConfig() {
    const overrides = await readUserConfigOverrides(this.userConfigPath);
    return normalizeBridgeConfig(this.pluginConfig, overrides, process.env);
  }

  async updateUserConfig(patch) {
    const allowedKeys = [
      'newSessionCanvas',
      'backendMode',
      'repoPath',
      'repoRunMode',
      'externalUrl',
      'npxPackage',
      'sharedConfigDir',
      'useSharedConfigDir',
      'portRangeStart',
      'portRangeEnd',
      'autoStart',
    ];
    const clean = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        clean[key] = patch[key];
      }
    }
    await writeUserConfigOverrides(clean, this.userConfigPath);
    return await this.getConfig();
  }

  getSessionBinding(sessionId) {
    const key = String(sessionId || 'default');
    let state = this.sessions.get(key);
    if (!state) {
      state = {
        clientId: deriveClientIdForSession(key),
        projectId: null,
        openSeq: 0,
        openIntent: null,
      };
      this.sessions.set(key, state);
    }
    return state;
  }

  async selectCanvas(scope, sessionId, mode = 'resume', projectId = null) {
    if (!scope?.active) throw new Error('Initialize the canvas folder first.');
    if (projectId && (mode === 'new' || mode === 'choose')) throw new Error('Use a projectId or a selection mode, not both.');
    const binding = this.getSessionBinding(sessionId);
    const select = async () => {
      const { instance, probe } = await this.ensureStarted(scope);
      const workspaceKey = JSON.stringify([scope.dataDir, instance.url, probe.config?.workspaceId]);
      if (mode === 'resume' && !projectId && binding.workspaceKey === workspaceKey && binding.selected) return binding;
      const config = await this.getConfig();
      const openIds = [...new Set(Object.values(probe.health?.clientStates || {}).map(row => row?.projectId).filter(Boolean))];
      if (!probe.capabilities.clientIdParam) {
        for (const session of this.sessions.values()) {
          if (session.workspaceKey === workspaceKey && session.legacyView?.clientId && session.projectId && !openIds.includes(session.projectId)) openIds.push(session.projectId);
        }
      }
      binding.projectId = await selectProject(scope, { ...instance, workspaceId: probe.config?.workspaceId },
        sessionId, mode, projectId, config.newSessionCanvas, openIds);
      if (binding.legacyView && (!binding.projectId || binding.workspaceKey !== workspaceKey || probe.capabilities.clientIdParam)) {
        await binding.legacyView.close();
        binding.legacyView = null;
      }
      if (binding.projectId && !probe.capabilities.clientIdParam && !binding.legacyView) {
        binding.legacyView = await createLegacyView(instance.url);
      }
      binding.workspaceKey = workspaceKey;
      binding.selected = true;
      binding.choosing = !binding.projectId;
      return binding;
    };
    binding.pending = (binding.pending || Promise.resolve()).catch(() => {}).then(select);
    return binding.pending;
  }

  async listProjects(scope) {
    if (!scope?.active) throw new Error('Initialize the canvas folder first.');
    const { instance, probe } = await this.ensureStarted(scope);
    const open = new Set(Object.values(probe.health?.clientStates || {}).map(row => row?.projectId));
    for (const session of this.sessions.values()) {
      if (session.workspaceKey === JSON.stringify([scope.dataDir, instance.url, probe.config?.workspaceId]) && session.legacyView?.clientId) open.add(session.projectId);
    }
    return (await listProjects(instance)).map(row => ({ ...row, open: open.has(row.id) }));
  }

  requestOpenUi(sessionId, options = {}) {
    const binding = this.getSessionBinding(sessionId);
    binding.openSeq += 1;
    binding.openIntent = {
      seq: binding.openSeq,
      mode: options.mode || 'resume',
      projectId: options.projectId || null,
      requestedAt: Date.now(),
    };
    return binding.openIntent;
  }

  ackUiAction(sessionId, seq) {
    const binding = this.getSessionBinding(sessionId);
    if (binding.openIntent && Number(seq) >= binding.openIntent.seq) {
      binding.openIntent = null;
    }
    return { ok: true };
  }

  buildIframeUrl(instance, binding) {
    if (!instance?.url) return null;
    if (!binding.projectId || binding.choosing) return null;
    const url = new URL('/canvas/' + encodeURIComponent(binding.projectId), binding.legacyView?.origin || instance.url);
    url.searchParams.set('embed', 'dsh');
    url.searchParams.set('dshClientId', binding.clientId);
    return url.toString();
  }

  async getStatus(scope, sessionId, options = {}) {
    const config = await this.getConfig();
    const binding = this.getSessionBinding(sessionId);
    const backendDiag = await diagnoseBackend(config);

    if (!scope?.active) {
      return {
        active: false,
        cwd: scope?.cwd ?? null,
        config,
        backend: backendDiag,
        binding: {
          clientId: binding.clientId,
          projectId: binding.projectId,
          openIntent: binding.openIntent,
        },
        instance: null,
        clientConnected: false,
        activeCanvas: null,
        iframeUrl: null,
      };
    }

    let instance = null;
    let probe = null;
    let startError = null;

    const existing = await this.processManager.checkExistingForDataDir(scope.dataDir);
    const compatible = config.effectiveBackend === 'external'
      ? existing.instance?.url === config.externalUrl
      : existing.instance?.backend !== 'external';
    if (existing.running && compatible) {
      instance = existing.instance;
      probe = existing.probe;
    } else if (config.effectiveBackend === 'external' && backendDiag.ok && backendDiag.probe?.reachable) {
      const started = await this.processManager.ensureRunning(scope);
      instance = started.instance;
      probe = started.probe;
    } else if (options.autoStart && config.autoStart && backendDiag.ok) {
      try {
        const started = await this.processManager.ensureRunning(scope);
        instance = started.instance;
        probe = started.probe;
      } catch (err) {
        startError = err instanceof Error ? err.message : String(err);
      }
    }

    if (instance && options.autoStart) {
      await this.selectCanvas(scope, sessionId);
    }
    const workspaceKey = instance && JSON.stringify([scope.dataDir, instance.url, probe?.config?.workspaceId]);
    const current = workspaceKey && binding.workspaceKey === workspaceKey;
    const projectId = current ? binding.projectId : null;
    const presence = probe?.health?.clientStates?.[binding.clientId];
    const legacy = instance && !probe?.capabilities?.projectEditors;
    const activeCanvas = projectId && presence?.projectId === projectId ? presence : null;
    const clientConnected = Boolean((!legacy || probe?.health?.clients === 1) && activeCanvas || (projectId && binding.legacyView?.clientId && probe?.health?.clients === 1 && probe.health.hasCanvas));
    const iframeUrl = current ? this.buildIframeUrl(instance, binding) : null;

    return {
      active: true,
      cwd: scope.cwd,
      project: {
        title: scope.title,
        projectDir: scope.projectDir,
        markerPath: scope.markerPath,
        dataDir: scope.dataDir,
        defaultProjectId: scope.defaultProjectId,
      },
      config,
      backend: backendDiag,
      binding: {
        clientId: binding.clientId,
        projectId,
        choosing: Boolean(current && binding.choosing),
        openIntent: binding.openIntent,
      },
      instance: instance
        ? {
            url: instance.url,
            port: instance.port,
            managed: instance.managed,
            backend: instance.backend,
            capabilities: instance.capabilities,
            protocolVersion: probe?.protocolVersion ?? null,
            recentLogs: instance.logs?.slice(-15) ?? [],
          }
        : null,
      startError,
      legacy,
      readOnly: Boolean(projectId && !activeCanvas && probe?.health?.readOnlyClients?.[binding.clientId] === projectId),
      clientConnected,
      activeCanvas,
      iframeUrl,
    };
  }

  async initProject(targetDir, options = {}) {
    return await initCanvasProjectInDir(targetDir, options);
  }

  async ensureStarted(scope) {
    return await this.processManager.ensureRunning(scope);
  }

  async restartInstance(scope) {
    return await this.processManager.restartForScope(scope);
  }

  async stopInstance(scope) {
    return await this.processManager.stopForDataDir(scope.dataDir);
  }

  /**
   * Forward a built-in or plugin canvas tool call to the bound Infinite Canvas server.
   */
  async callCanvasTool(scope, sessionId, name, input = {}, signal = undefined) {
    if (!scope?.active) {
      throw new Error('Current workspace is not an Infinite Canvas project (.infinite-canvas.json not found). Call canvas_init_project first.');
    }
    const config = await this.getConfig();
    const { instance } = await this.processManager.ensureRunning(scope);
    const binding = this.getSessionBinding(sessionId);

    const { projectId: inputProjectId, ...toolArgs } = input && typeof input === 'object' ? input : {};
    const { routeClientId, targetProjectId } = await this.toolTarget(scope, instance, binding, inputProjectId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.toolTimeoutMs);
    const mergedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

    try {
      const response = await fetch(`${instance.url}/api/tools`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          input: toolArgs,
          ...(routeClientId ? { clientId: routeClientId } : {}),
          ...(targetProjectId ? { projectId: targetProjectId } : {}),
        }),
        signal: mergedSignal,
      });

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        const errCode = body?.error?.code || 'CANVAS_TOOL_FAILED';
        const errMsg = body?.error?.message || body?.error || `HTTP ${response.status}`;
        throw new Error(`[${errCode}] ${errMsg}`);
      }

      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async toolTarget(scope, instance, binding, requestedId) {
    const live = await probeCanvasServer(instance.url);
    const expected = JSON.stringify([scope.dataDir, instance.url, live.config?.workspaceId]);
    const targetProjectId = binding.projectId;
    if (binding.workspaceKey !== expected || !targetProjectId || binding.choosing) throw new Error('Open or select a canvas for this session first.');
    if (requestedId && requestedId !== targetProjectId) throw new Error('Canvas changed. Read the selected canvas again.');
    if (!live.capabilities?.projectEditors && live.health?.clients !== 1) {
      throw new Error('The backend has no editor locking. Keep only this canvas page open before using Agent tools.');
    }
    if (live.capabilities?.clientIdParam) {
      if (live.health?.clientStates?.[binding.clientId]?.projectId !== targetProjectId) {
        throw new Error('This session has no editable connection to the selected canvas. Open it or release the other editor first.');
      }
      return { routeClientId: binding.clientId, targetProjectId };
    }
    if (!live.reachable || live.health?.clients !== 1 || !live.health.hasCanvas) {
      throw new Error('Compatibility mode requires exactly one open canvas page. Close other pages before editing.');
    }
    // Stock v1 verifies projectId inside the browser before executing every tool.
    const routeClientId = binding.legacyView?.clientId;
    if (!routeClientId) throw new Error('The embedded canvas is not connected. Open it in this session first.');
    return { routeClientId, targetProjectId };
  }

  async listCanvasPluginTools(scope, sessionId, signal = undefined) {
    if (!scope?.active) return [];
    const { instance } = await this.processManager.ensureRunning(scope);
    const binding = this.getSessionBinding(sessionId);
    const { routeClientId, targetProjectId } = await this.toolTarget(scope, instance, binding);

    const response = await fetch(`${instance.url}/api/tools/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(routeClientId ? { clientId: routeClientId } : {}),
        projectId: targetProjectId,
      }),
      signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message || `Failed to list plugin tools (HTTP ${response.status})`);
    }
    return Array.isArray(body.result) ? body.result : [];
  }

  async dispose() {
    await Promise.allSettled([...this.sessions.values()].map(binding => binding.pending));
    await Promise.allSettled([...this.sessions.values()].map(binding => binding.legacyView?.close()));
    await this.processManager.disposeAll();
  }
}
