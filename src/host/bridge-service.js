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
import {
  initCanvasProjectInDir,
  updateDefaultProjectId,
} from './scope-resolver.js';

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
    /** @type {Map<string, { clientId: string, projectId: string | null, openSeq: number, openIntent: { seq: number, mode: string, projectId: string | null, requestedAt: number } | null }>} */
    this.sessions = new Map();
  }

  async getConfig() {
    const overrides = await readUserConfigOverrides(this.userConfigPath);
    return normalizeBridgeConfig(this.pluginConfig, overrides, process.env);
  }

  async updateUserConfig(patch) {
    const allowedKeys = [
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

  setSessionProjectId(sessionId, projectId, scope = null) {
    const binding = this.getSessionBinding(sessionId);
    binding.projectId = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
    if (scope?.active && binding.projectId) {
      void updateDefaultProjectId(scope, binding.projectId).catch(() => {});
    }
    return binding;
  }

  requestOpenUi(sessionId, options = {}) {
    const binding = this.getSessionBinding(sessionId);
    binding.openSeq += 1;
    binding.openIntent = {
      seq: binding.openSeq,
      mode: options.mode || 'recent',
      projectId: options.projectId || binding.projectId || null,
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

  buildIframeUrl(instance, binding, scope, options = {}) {
    if (!instance?.url) return null;
    const projectId = options.projectId || binding.projectId || scope?.defaultProjectId || null;
    const mode = options.mode || (projectId ? null : 'recent');
    const pathname = projectId ? `/canvas/${encodeURIComponent(projectId)}` : '/canvas';
    const url = new URL(pathname, instance.url);
    if (!projectId && mode) {
      url.searchParams.set('mode', mode);
    }
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
    if (existing.running) {
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

    const clientStates = probe?.health?.clientStates && typeof probe.health.clientStates === 'object'
      ? probe.health.clientStates
      : null;

    let clientConnected = false;
    let activeCanvas = null;

    if (probe?.reachable) {
      if (clientStates) {
        if (Object.prototype.hasOwnProperty.call(clientStates, binding.clientId)) {
          clientConnected = true;
          activeCanvas = clientStates[binding.clientId] || null;
        }
      } else {
        // Upstream server without clientStates field: fall back to global client presence
        clientConnected = Number(probe.health?.clients || 0) > 0;
        activeCanvas = probe.health?.hasCanvas ? { projectId: binding.projectId || scope.defaultProjectId || null, title: null } : null;
      }
    }

    if (activeCanvas?.projectId && activeCanvas.projectId !== binding.projectId) {
      this.setSessionProjectId(sessionId, activeCanvas.projectId, scope);
    }

    const iframeUrl = instance
      ? this.buildIframeUrl(instance, binding, scope, {
          projectId: binding.openIntent?.projectId || undefined,
          mode: binding.openIntent?.mode || undefined,
        })
      : null;

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
        projectId: binding.projectId || scope.defaultProjectId || null,
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
    const { instance, probe } = await this.processManager.ensureRunning(scope);
    const binding = this.getSessionBinding(sessionId);

    const { projectId: inputProjectId, ...toolArgs } = input && typeof input === 'object' ? input : {};
    const targetProjectId = typeof inputProjectId === 'string' && inputProjectId.trim()
      ? inputProjectId.trim()
      : binding.projectId || undefined;

    // Resolve routing clientId: use exact session clientId when backend supports it
    const liveProbe = await probeCanvasServer(instance.url, 2000);
    const supportsPerClient = Boolean(liveProbe.capabilities?.clientIdParam || probe?.capabilities?.clientIdParam);
    const clientStates = liveProbe.health?.clientStates;

    let routeClientId = supportsPerClient ? binding.clientId : undefined;
    if (supportsPerClient && clientStates) {
      if (!Object.prototype.hasOwnProperty.call(clientStates, binding.clientId)) {
        const connectedIds = Object.keys(clientStates);
        if (connectedIds.length === 0) {
          throw new Error(
            'No Infinite Canvas view is currently connected for this session. Call canvas_open first or ask the user to open the Infinite Canvas tab in the right sidebar.',
          );
        }
        // If another tab (e.g. external browser) is connected but the session iframe isn't, inform clearly
        throw new Error(
          `This session's embedded canvas (clientId=${binding.clientId}) is not open yet. Call canvas_open to open the right-sidebar canvas tab, wait a moment, then retry.`,
        );
      }
    } else if (!liveProbe.health?.clients) {
      throw new Error(
        'No Infinite Canvas page is connected. Call canvas_open or open the Infinite Canvas panel first.',
      );
    }

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

      const result = body.result;
      if (result && typeof result === 'object' && typeof result.projectId === 'string' && result.projectId) {
        this.setSessionProjectId(sessionId, result.projectId, scope);
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async listCanvasPluginTools(scope, sessionId, signal = undefined) {
    if (!scope?.active) return [];
    const { instance, probe } = await this.processManager.ensureRunning(scope);
    const binding = this.getSessionBinding(sessionId);
    const supportsPerClient = Boolean(probe?.capabilities?.clientIdParam);

    const response = await fetch(`${instance.url}/api/tools/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(supportsPerClient ? { clientId: binding.clientId } : {}),
        ...(binding.projectId ? { projectId: binding.projectId } : {}),
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
    await this.processManager.disposeAll();
  }
}
