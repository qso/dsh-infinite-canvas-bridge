export function createBridgeStore(ctx, rpc) {
  const globalListeners = new Set();
  const sessionListeners = new Map();
  const statusBySession = new Map();
  const loadingBySession = new Map();
  const errorBySession = new Map();
  const iframeOverrideBySession = new Map();
  const hostOwnerBySession = new Map(); // sessionId -> 'pane' | 'main'
  let foregroundSessionId = null;
  let sidebarRightController = null;
  let layoutController = null;
  let pollTimer = null;
  let disposed = false;

  function attachSidebarRight(controller) {
    sidebarRightController = controller || null;
  }

  function attachLayout(controller) {
    layoutController = controller || null;
  }

  function openRightPaneCanvas() {
    try {
      if (sidebarRightController && typeof sidebarRightController.openTab === 'function') {
        sidebarRightController.openTab('infinite-canvas-bridge');
        return true;
      }
    } catch {
      // Ignore and try fallback
    }
    try {
      if (layoutController && typeof layoutController.selectPanel === 'function') {
        layoutController.selectPanel('infinite-canvas-bridge');
        return true;
      }
    } catch {
      // Ignore
    }
    return false;
  }

  function emitGlobal() {
    for (const fn of globalListeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  function emitSession(sessionId) {
    const set = sessionListeners.get(sessionId);
    if (set) {
      for (const fn of set) {
        try { fn(); } catch { /* ignore */ }
      }
    }
    emitGlobal();
  }

  function readForegroundSessionId() {
    try {
      const s = ctx.sessions;
      if (!s) return foregroundSessionId;
      if (typeof s.currentId === 'string' && s.currentId) return s.currentId;
      if (typeof s.selectedId === 'string' && s.selectedId) return s.selectedId;
      if (typeof s.getSelectedId === 'function') {
        const id = s.getSelectedId();
        if (id) return id;
      }
      if (typeof s.getCurrent === 'function') {
        const cur = s.getCurrent();
        if (cur?.id) return cur.id;
      }
      if (sidebarRightController?.mounted) {
        const m = typeof sidebarRightController.mounted === 'function'
          ? sidebarRightController.mounted()
          : sidebarRightController.mounted;
        if (typeof m === 'string' && m) return m;
        if (m && typeof m.get === 'function') {
          const val = m.get();
          if (typeof val === 'string' && val) return val;
        }
        if (m && typeof m.getSnapshot === 'function') {
          const val = m.getSnapshot();
          if (typeof val === 'string' && val) return val;
        }
      }
    } catch {
      // Ignore probe error
    }
    return foregroundSessionId;
  }

  function setForegroundSessionId(sessionId) {
    if (!sessionId || sessionId === foregroundSessionId) return;
    foregroundSessionId = sessionId;
    emitGlobal();
  }

  function getStatusSnapshot(sessionId) {
    return statusBySession.get(sessionId) || null;
  }

  function isLoading(sessionId) {
    return Boolean(loadingBySession.get(sessionId));
  }

  function getError(sessionId) {
    return errorBySession.get(sessionId) || null;
  }

  function claimHost(sessionId, host) {
    if (!sessionId) return;
    hostOwnerBySession.set(sessionId, host);
    emitSession(sessionId);
  }

  function releaseHost(sessionId, host) {
    if (!sessionId) return;
    if (hostOwnerBySession.get(sessionId) === host) {
      hostOwnerBySession.delete(sessionId);
      emitSession(sessionId);
    }
  }

  function getHostOwner(sessionId) {
    return hostOwnerBySession.get(sessionId) || null;
  }

  function getIframeUrl(sessionId) {
    const override = iframeOverrideBySession.get(sessionId);
    if (override) return override;
    return statusBySession.get(sessionId)?.iframeUrl || null;
  }

  function setIframeUrlOverride(sessionId, url) {
    if (!url) iframeOverrideBySession.delete(sessionId);
    else iframeOverrideBySession.set(sessionId, url);
    emitSession(sessionId);
  }

  async function handleOpenIntent(sessionId, status) {
    const intent = status?.binding?.openIntent;
    if (!intent || !intent.seq) return;
    try {
      await rpc.ackUiAction(sessionId, intent.seq);
    } catch {
      // Ignore ack failure
    }
    if (status?.iframeUrl) {
      const targetUrl = new URL(status.iframeUrl);
      if (intent.mode === 'new' && !intent.projectId) {
        targetUrl.pathname = '/canvas';
        targetUrl.searchParams.set('mode', 'new');
      } else if (intent.projectId) {
        targetUrl.pathname = `/canvas/${encodeURIComponent(intent.projectId)}`;
        targetUrl.searchParams.delete('mode');
      }
      setIframeUrlOverride(sessionId, targetUrl.toString());
    }
    openRightPaneCanvas();
  }

  async function refreshStatus(sessionId, options = {}) {
    if (!sessionId || disposed) return null;
    if (options.foreground) setForegroundSessionId(sessionId);
    if (options.showLoading) {
      loadingBySession.set(sessionId, true);
      emitSession(sessionId);
    }
    try {
      const status = await rpc.getStatus(sessionId, Boolean(options.autoStart));
      if (disposed) return null;
      statusBySession.set(sessionId, status);
      errorBySession.delete(sessionId);
      emitSession(sessionId);
      await handleOpenIntent(sessionId, status);
      return status;
    } catch (err) {
      if (disposed) return null;
      errorBySession.set(sessionId, err instanceof Error ? err.message : String(err));
      emitSession(sessionId);
      return null;
    } finally {
      if (options.showLoading) {
        loadingBySession.set(sessionId, false);
        emitSession(sessionId);
      }
    }
  }

  async function initProject(sessionId, options = {}) {
    loadingBySession.set(sessionId, true);
    errorBySession.delete(sessionId);
    emitSession(sessionId);
    try {
      const res = await rpc.initProject(sessionId, options);
      if (res?.status) {
        statusBySession.set(sessionId, res.status);
        setIframeUrlOverride(sessionId, null);
      }
      emitSession(sessionId);
      return res;
    } catch (err) {
      errorBySession.set(sessionId, err instanceof Error ? err.message : String(err));
      emitSession(sessionId);
      throw err;
    } finally {
      loadingBySession.set(sessionId, false);
      emitSession(sessionId);
    }
  }

  async function ensureStarted(sessionId) {
    loadingBySession.set(sessionId, true);
    errorBySession.delete(sessionId);
    emitSession(sessionId);
    try {
      const status = await rpc.ensureStarted(sessionId);
      statusBySession.set(sessionId, status);
      emitSession(sessionId);
      return status;
    } catch (err) {
      errorBySession.set(sessionId, err instanceof Error ? err.message : String(err));
      emitSession(sessionId);
      throw err;
    } finally {
      loadingBySession.set(sessionId, false);
      emitSession(sessionId);
    }
  }

  async function restartInstance(sessionId) {
    loadingBySession.set(sessionId, true);
    errorBySession.delete(sessionId);
    emitSession(sessionId);
    try {
      const status = await rpc.restartInstance(sessionId);
      statusBySession.set(sessionId, status);
      setIframeUrlOverride(sessionId, null);
      emitSession(sessionId);
      return status;
    } catch (err) {
      errorBySession.set(sessionId, err instanceof Error ? err.message : String(err));
      emitSession(sessionId);
      throw err;
    } finally {
      loadingBySession.set(sessionId, false);
      emitSession(sessionId);
    }
  }

  async function stopInstance(sessionId) {
    loadingBySession.set(sessionId, true);
    emitSession(sessionId);
    try {
      const status = await rpc.stopInstance(sessionId);
      statusBySession.set(sessionId, status);
      setIframeUrlOverride(sessionId, null);
      emitSession(sessionId);
      return status;
    } catch (err) {
      errorBySession.set(sessionId, err instanceof Error ? err.message : String(err));
      emitSession(sessionId);
      throw err;
    } finally {
      loadingBySession.set(sessionId, false);
      emitSession(sessionId);
    }
  }

  async function updateSettings(sessionId, settings) {
    const res = await rpc.updateSettings(settings);
    if (sessionId) {
      await refreshStatus(sessionId, { autoStart: false });
    }
    return res;
  }

  // Background lightweight poll for foreground session to catch agent `canvas_open` intents & connection status
  pollTimer = setInterval(() => {
    if (disposed) return;
    const sid = readForegroundSessionId();
    if (!sid) return;
    const snap = statusBySession.get(sid);
    if (snap?.active || sessionListeners.get(sid)?.size) {
      void refreshStatus(sid, { autoStart: false });
    }
  }, 2200);

  return {
    attachSidebarRight,
    attachLayout,
    openRightPaneCanvas,
    getForegroundSessionId: () => readForegroundSessionId(),
    setForegroundSessionId,
    getStatusSnapshot,
    isLoading,
    getError,
    claimHost,
    releaseHost,
    getHostOwner,
    getIframeUrl,
    setIframeUrlOverride,
    refreshStatus,
    initProject,
    ensureStarted,
    restartInstance,
    stopInstance,
    updateSettings,
    subscribeGlobal(fn) {
      globalListeners.add(fn);
      return () => globalListeners.delete(fn);
    },
    subscribeSession(sessionId, fn) {
      if (!sessionListeners.has(sessionId)) sessionListeners.set(sessionId, new Set());
      sessionListeners.get(sessionId).add(fn);
      return () => {
        const set = sessionListeners.get(sessionId);
        if (set) {
          set.delete(fn);
          if (set.size === 0) sessionListeners.delete(sessionId);
        }
      };
    },
    dispose() {
      disposed = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      globalListeners.clear();
      sessionListeners.clear();
    },
  };
}
