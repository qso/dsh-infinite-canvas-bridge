import { TAB_KIND } from '../../shared/constants.js';

export function createSessionChip(React) {
  const h = React.createElement;
  const { useEffect, useState } = React;

  return function SessionChip({ sessionId, ctx, store, t }) {
    const [, setTick] = useState(0);
    const status = sessionId ? store.getStatusSnapshot(sessionId) : null;
    const loading = sessionId ? store.isLoading(sessionId) : false;

    useEffect(() => {
      if (!sessionId) return undefined;
      store.setForegroundSessionId(sessionId);
      const bump = () => setTick((v) => v + 1);
      const unsub = store.subscribeSession(sessionId, bump);
      void store.refreshStatus(sessionId, { autoStart: false, foreground: true });
      return unsub;
    }, [sessionId]);

    if (!sessionId) return null;

    const active = Boolean(status?.active);
    const connected = Boolean(status?.clientConnected);
    const running = Boolean(status?.instance?.url);

    function openCanvasPanel() {
      try {
        if (ctx.sidebarRight && typeof ctx.sidebarRight.openTab === 'function') {
          ctx.sidebarRight.openTab(TAB_KIND);
          return;
        }
      } catch {
        // Fallback below
      }
      try {
        if (ctx.layout && typeof ctx.layout.openPanel === 'function') {
          ctx.layout.openPanel(TAB_KIND);
        }
      } catch {
        // Ignore
      }
    }

    async function handleClick() {
      if (!active) {
        openCanvasPanel();
        return;
      }
      if (!running) {
        void store.ensureStarted(sessionId).catch(() => {});
      }
      openCanvasPanel();
    }

    const dotClass = !active
      ? 'icb-dot'
      : connected
        ? 'icb-dot ok'
        : running
          ? 'icb-dot warn'
          : 'icb-dot';

    const label = !active
      ? t('chipEnable')
      : loading
        ? t('starting')
        : (status.activeCanvas?.title || status.project?.title || t('tabTitle'));

    return h('button', {
      type: 'button',
      className: `icb-chip${active && connected ? ' active' : ''}`,
      onClick: handleClick,
      title: active ? `${t('chipActiveTip')}: ${status.project?.projectDir || ''}` : t('chipInactiveTip'),
    },
      h('span', { className: dotClass }),
      h('span', null, label),
    );
  };
}
