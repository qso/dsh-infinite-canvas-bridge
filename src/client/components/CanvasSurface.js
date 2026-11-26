export function createCanvasSurface(React) {
  const h = React.createElement;
  const { useEffect, useState } = React;

  function SettingsModal({ initialConfig, t, onClose, onSave }) {
    const [backendMode, setBackendMode] = useState(initialConfig?.backendMode || 'auto');
    const [repoPath, setRepoPath] = useState(initialConfig?.repoPath || '');
    const [repoRunMode, setRepoRunMode] = useState(initialConfig?.repoRunMode || 'built');
    const [externalUrl, setExternalUrl] = useState(initialConfig?.externalUrl || '');
    const [npxPackage, setNpxPackage] = useState(initialConfig?.npxPackage || '@basketikun/infinite-canvas@latest');
    const [sharedConfigDir, setSharedConfigDir] = useState(initialConfig?.sharedConfigDir || '');
    const [useSharedConfigDir, setUseSharedConfigDir] = useState(initialConfig?.useSharedConfigDir !== false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    async function handleSave() {
      setSaving(true);
      setErr('');
      try {
        await onSave({
          backendMode,
          repoPath: repoPath.trim(),
          repoRunMode,
          externalUrl: externalUrl.trim(),
          npxPackage: npxPackage.trim() || '@basketikun/infinite-canvas@latest',
          sharedConfigDir: sharedConfigDir.trim(),
          useSharedConfigDir,
        });
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    }

    return h('div', {
      className: 'icb-settings-overlay',
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
    },
      h('div', { className: 'icb-settings-modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { className: 'icb-card-title' }, t('settingsTitle')),
        h('div', { className: 'icb-card-desc' }, t('settingsHint')),

        h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('backendMode')),
          h('select', {
            className: 'icb-select',
            value: backendMode,
            onChange: (e) => setBackendMode(e.target.value),
          },
            h('option', { value: 'auto' }, t('modeAuto')),
            h('option', { value: 'local-repo' }, t('modeLocalRepo')),
            h('option', { value: 'npx' }, t('modeNpx')),
            h('option', { value: 'external' }, t('modeExternal')),
          ),
        ),

        (backendMode === 'auto' || backendMode === 'local-repo') && h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('repoPath')),
          h('input', {
            className: 'icb-input',
            value: repoPath,
            placeholder: '/path/to/infinite-canvas',
            onChange: (e) => setRepoPath(e.target.value),
          }),
        ),

        (backendMode === 'auto' || backendMode === 'local-repo') && h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('repoRunMode')),
          h('select', {
            className: 'icb-select',
            value: repoRunMode,
            onChange: (e) => setRepoRunMode(e.target.value),
          },
            h('option', { value: 'built' }, t('runModeBuilt')),
            h('option', { value: 'dev' }, t('runModeDev')),
          ),
        ),

        backendMode === 'npx' && h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('npxPackage')),
          h('input', {
            className: 'icb-input',
            value: npxPackage,
            onChange: (e) => setNpxPackage(e.target.value),
          }),
        ),

        (backendMode === 'auto' || backendMode === 'external') && h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('externalUrl')),
          h('input', {
            className: 'icb-input',
            value: externalUrl,
            placeholder: 'http://127.0.0.1:17371',
            onChange: (e) => setExternalUrl(e.target.value),
          }),
        ),

        h('label', { className: 'icb-checkbox-row' },
          h('input', {
            type: 'checkbox',
            checked: useSharedConfigDir,
            onChange: (e) => setUseSharedConfigDir(e.target.checked),
          }),
          h('span', null, t('useSharedConfigDir')),
        ),

        useSharedConfigDir && h('div', { className: 'icb-field' },
          h('label', { className: 'icb-label' }, t('sharedConfigDir')),
          h('input', {
            className: 'icb-input',
            value: sharedConfigDir,
            placeholder: '~/.infinite-canvas/shared',
            onChange: (e) => setSharedConfigDir(e.target.value),
          }),
        ),

        err && h('div', { className: 'icb-card-code' }, err),

        h('div', { className: 'icb-card-actions', style: { justifyContent: 'flex-end' } },
          h('button', { type: 'button', className: 'icb-btn outline', onClick: onClose }, t('cancel')),
          h('button', { type: 'button', className: 'icb-btn primary', disabled: saving, onClick: handleSave },
            saving ? t('saving') : t('save'),
          ),
        ),
      ),
    );
  }

  return function CanvasSurface({ host, sessionId: explicitSessionId, store, t }) {
    const [, setTick] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [iframeNonce, setIframeNonce] = useState(0);
    const [titleDraft, setTitleDraft] = useState('');

    const sessionId = explicitSessionId || store.getForegroundSessionId();
    const status = sessionId ? store.getStatusSnapshot(sessionId) : null;
    const loading = sessionId ? store.isLoading(sessionId) : false;
    const error = sessionId ? store.getError(sessionId) : null;
    const owner = sessionId ? store.getHostOwner(sessionId) : null;
    const iframeUrl = sessionId ? store.getIframeUrl(sessionId) : null;

    useEffect(() => {
      const bump = () => setTick((v) => v + 1);
      const unsubGlobal = store.subscribeGlobal(bump);
      const unsubSession = sessionId ? store.subscribeSession(sessionId, bump) : () => {};
      return () => {
        unsubGlobal();
        unsubSession();
      };
    }, [sessionId]);

    useEffect(() => {
      if (!sessionId) return undefined;
      store.claimHost(sessionId, host);
      void store.refreshStatus(sessionId, { autoStart: true, showLoading: !store.getStatusSnapshot(sessionId) });
      return () => {
        store.releaseHost(sessionId, host);
      };
    }, [sessionId, host]);

    if (!sessionId) {
      return h('div', { className: 'icb-root' },
        h('div', { className: 'icb-center' },
          h('div', { className: 'icb-card' },
            h('div', { className: 'icb-card-title' }, t('noSessionTitle')),
            h('div', { className: 'icb-card-desc' }, t('noSessionDesc')),
          ),
        ),
      );
    }

    const hostTaken = owner && owner !== host;
    const isRunning = Boolean(status?.instance?.url);
    const isConnected = Boolean(status?.clientConnected);
    const dotClass = !status?.active
      ? 'icb-dot'
      : isConnected
        ? 'icb-dot ok'
        : isRunning
          ? 'icb-dot warn'
          : 'icb-dot err';

    const statusLabel = !status?.active
      ? t('statusInactive')
      : isConnected
        ? t('statusConnected')
        : isRunning
          ? t('statusConnecting')
          : t('statusStopped');

    async function handleInitFolder() {
      try {
        await store.initProject(sessionId, {
          title: titleDraft.trim() || undefined,
          autoStart: true,
        });
      } catch {
        // Error captured in store
      }
    }

    function openExternalWindow() {
      if (status?.instance?.url) {
        window.open(status.instance.url, '_blank', 'noopener,noreferrer');
      }
    }

    function openNewCanvas() {
      if (!status?.instance?.url || !status?.binding?.clientId) return;
      const u = new URL('/canvas', status.instance.url);
      u.searchParams.set('mode', 'new');
      u.searchParams.set('embed', 'dsh');
      u.searchParams.set('dshClientId', status.binding.clientId);
      store.setIframeUrlOverride(sessionId, u.toString());
      setIframeNonce((n) => n + 1);
    }

    function openCanvasLibrary() {
      if (!status?.instance?.url || !status?.binding?.clientId) return;
      const u = new URL('/canvas', status.instance.url);
      u.searchParams.set('embed', 'dsh');
      u.searchParams.set('dshClientId', status.binding.clientId);
      store.setIframeUrlOverride(sessionId, u.toString());
      setIframeNonce((n) => n + 1);
    }

    let bodyNode;
    if (hostTaken) {
      bodyNode = h('div', { className: 'icb-center' },
        h('div', { className: 'icb-card' },
          h('div', { className: 'icb-card-title' }, t('hostTakenTitle')),
          h('div', { className: 'icb-card-desc' }, t('hostTakenDesc')),
          h('div', { className: 'icb-card-actions' },
            h('button', {
              type: 'button',
              className: 'icb-btn primary',
              onClick: () => store.claimHost(sessionId, host),
            }, t('hostTakeOver')),
          ),
        ),
      );
    } else if (!status && loading) {
      bodyNode = h('div', { className: 'icb-center' },
        h('div', { className: 'icb-card' },
          h('div', { className: 'icb-card-title' }, t('loadingTitle')),
          h('div', { className: 'icb-card-desc' }, t('loadingDesc')),
        ),
      );
    } else if (status && !status.active) {
      bodyNode = h('div', { className: 'icb-center' },
        h('div', { className: 'icb-card' },
          h('div', { className: 'icb-card-title' }, t('initTitle')),
          h('div', { className: 'icb-card-desc' }, t('initDesc')),
          status.cwd && h('div', { className: 'icb-card-code' }, status.cwd),
          h('div', { className: 'icb-field' },
            h('label', { className: 'icb-label' }, t('projectTitleLabel')),
            h('input', {
              className: 'icb-input',
              value: titleDraft,
              placeholder: t('projectTitlePlaceholder'),
              onChange: (e) => setTitleDraft(e.target.value),
            }),
          ),
          !status.backend?.ok && h('div', { className: 'icb-card-code' },
            `${status.backend?.message || ''}${status.backend?.hint ? `\n${status.backend.hint}` : ''}`,
          ),
          error && h('div', { className: 'icb-card-code' }, error),
          h('div', { className: 'icb-card-actions' },
            h('button', {
              type: 'button',
              className: 'icb-btn primary',
              disabled: loading || !status.cwd,
              onClick: handleInitFolder,
            }, loading ? t('initializing') : t('initButton')),
            h('button', {
              type: 'button',
              className: 'icb-btn outline',
              onClick: () => setSettingsOpen(true),
            }, t('settings')),
          ),
        ),
      );
    } else if (status?.active && (!isRunning || !iframeUrl)) {
      const diagText = status.startError || error || status.backend?.message || t('serverNotRunning');
      const hintText = status.backend?.hint || '';
      bodyNode = h('div', { className: 'icb-center' },
        h('div', { className: 'icb-card' },
          h('div', { className: 'icb-card-title' }, t('backendIssueTitle')),
          h('div', { className: 'icb-card-desc' }, t('backendIssueDesc')),
          h('div', { className: 'icb-card-code' }, [diagText, hintText].filter(Boolean).join('\n\n')),
          h('div', { className: 'icb-card-actions' },
            h('button', {
              type: 'button',
              className: 'icb-btn primary',
              disabled: loading,
              onClick: () => void store.ensureStarted(sessionId).catch(() => {}),
            }, loading ? t('starting') : t('startServer')),
            h('button', {
              type: 'button',
              className: 'icb-btn outline',
              onClick: () => setSettingsOpen(true),
            }, t('settings')),
          ),
        ),
      );
    } else {
      bodyNode = h('iframe', {
        key: `${sessionId}:${iframeUrl}:${iframeNonce}`,
        className: 'icb-iframe',
        src: iframeUrl,
        title: status?.project?.title || 'Infinite Canvas',
        allow: 'clipboard-read; clipboard-write',
      });
    }

    return h('div', { className: 'icb-root' },
      h('div', { className: 'icb-toolbar' },
        h('div', { className: 'icb-toolbar-left' },
          h('span', { className: dotClass }),
          h('span', { className: 'icb-title', title: status?.project?.projectDir || status?.cwd || '' },
            status?.active ? (status.activeCanvas?.title || status.project?.title || t('tabTitle')) : t('tabTitle'),
          ),
          h('span', { className: 'icb-badge' }, statusLabel),
          status?.instance?.backend && h('span', { className: 'icb-badge' }, status.instance.backend),
        ),
        h('div', { className: 'icb-toolbar-right' },
          status?.active && isRunning && h('button', {
            type: 'button',
            className: 'icb-btn',
            onClick: openCanvasLibrary,
            title: t('library'),
          }, t('library')),
          status?.active && isRunning && h('button', {
            type: 'button',
            className: 'icb-btn',
            onClick: openNewCanvas,
            title: t('newCanvas'),
          }, t('newCanvas')),
          status?.active && isRunning && h('button', {
            type: 'button',
            className: 'icb-btn',
            onClick: () => setIframeNonce((n) => n + 1),
            title: t('reload'),
          }, t('reload')),
          status?.active && isRunning && h('button', {
            type: 'button',
            className: 'icb-btn',
            disabled: loading,
            onClick: () => void store.restartInstance(sessionId).catch(() => {}),
            title: t('restart'),
          }, t('restart')),
          status?.active && isRunning && h('button', {
            type: 'button',
            className: 'icb-btn',
            onClick: openExternalWindow,
            title: t('openExternal'),
          }, t('openExternal')),
          h('button', {
            type: 'button',
            className: 'icb-btn',
            onClick: () => setSettingsOpen(true),
            title: t('settings'),
          }, t('settings')),
        ),
      ),
      h('div', { className: 'icb-stage' }, bodyNode),
      settingsOpen && h(SettingsModal, {
        initialConfig: status?.config,
        t,
        onClose: () => setSettingsOpen(false),
        onSave: async (next) => {
          await store.updateSettings(sessionId, next);
          if (status?.active) {
            await store.restartInstance(sessionId).catch(() => {});
          }
        },
      }),
    );
  };
}
