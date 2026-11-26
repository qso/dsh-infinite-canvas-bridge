import { PANEL_ID, PLUGIN_ID, PLUGIN_NS, TAB_KIND } from '../shared/constants.js';
import { createCanvasSurface } from './components/CanvasSurface.js';
import { createSessionChip } from './components/SessionChip.js';
import { createBridgeRpcClient } from './rpc-client.js';
import { createBridgeStore } from './store.js';
import { BRIDGE_CSS } from './styles.js';

const LOCALE_DICT = {
  zh: {
    tabTitle: '无限画布',
    guideDesc: '嵌入本地持久化 Infinite Canvas，边对话边让 Agent 实时编排节点并触发生成。',
    statusInactive: '未初始化',
    statusConnected: '已连接',
    statusConnecting: '等待画布连接',
    statusStopped: '未启动',
    noSessionTitle: '请先选择或新建一个会话',
    noSessionDesc: '无限画布按会话工作目录绑定，打开任意文件夹会话即可使用。',
    hostTakenTitle: '画布已在另一个视图打开',
    hostTakenDesc: '为避免同一会话出现双连接冲突，同一时刻仅在一个视图承载画布。',
    hostTakeOver: '切换到此处显示',
    loadingTitle: '正在准备无限画布...',
    loadingDesc: '正在检查当前文件夹工程并连接本地 Infinite Canvas 服务。',
    initTitle: '将当前文件夹设为无限画布工程',
    initDesc: '初始化后会创建 .infinite-canvas.json，并将画布、图片、视频与音频持久化保存在当前目录的 .infinite-canvas/ 中（模型凭据保存在全局共享目录，不会写入工程目录）。',
    projectTitleLabel: '工程名称（可选）',
    projectTitlePlaceholder: '留空则使用当前文件夹名',
    initButton: '初始化并打开画布',
    initializing: '正在初始化...',
    backendIssueTitle: 'Infinite Canvas 本地服务未就绪',
    backendIssueDesc: '请检查后端配置（支持官方 npx 版、本地魔改源码仓或外部已运行服务）。',
    serverNotRunning: '服务尚未启动。',
    startServer: '启动服务',
    starting: '启动中...',
    library: '画布库',
    newCanvas: '新建画布',
    reload: '刷新',
    restart: '重启服务',
    openExternal: '浏览器打开',
    settings: '设置',
    settingsTitle: 'Infinite Canvas 后端设置',
    settingsHint: '配置保存在 ~/.dsh-infinite-canvas-bridge/config.json，不修改插件源码。',
    backendMode: '后端模式',
    modeAuto: '自动检测（优先外部 URL → 本地仓 → npx 官方版）',
    modeLocalRepo: '本地源码 / 自定义 Fork 仓库',
    modeNpx: '官方 npx (@basketikun/infinite-canvas)',
    modeExternal: '连接已启动的外部服务 URL',
    repoPath: '本地 Infinite Canvas 仓库路径',
    repoRunMode: '本地仓启动方式',
    runModeBuilt: '已构建纯 Node 服务（推荐，启动快省内存）',
    runModeDev: '开发热更新模式（tsx + Vite）',
    npxPackage: 'npx 包名',
    externalUrl: '外部服务地址',
    useSharedConfigDir: '启用全局共享配置目录（跨工程共享模型渠道/API Key，且不写入项目文件夹）',
    sharedConfigDir: '共享配置目录路径',
    cancel: '取消',
    save: '保存并应用',
    saving: '保存中...',
    chipEnable: '无限画布',
    chipActiveTip: '点击在右侧分栏打开当前工程的无限画布',
    chipInactiveTip: '点击将当前文件夹初始化为持久化无限画布工程',
  },
  en: {
    tabTitle: 'Infinite Canvas',
    guideDesc: 'Embed local persistent Infinite Canvas side-by-side so the Agent edits nodes and runs generations live.',
    statusInactive: 'Not initialized',
    statusConnected: 'Connected',
    statusConnecting: 'Connecting',
    statusStopped: 'Stopped',
    noSessionTitle: 'Select or start a session first',
    noSessionDesc: 'Infinite Canvas binds to your session working directory.',
    hostTakenTitle: 'Canvas is active in another view',
    hostTakenDesc: 'Only one surface hosts the canvas per session to keep WebSocket routing isolated.',
    hostTakeOver: 'Move canvas here',
    loadingTitle: 'Preparing Infinite Canvas...',
    loadingDesc: 'Checking project directory and starting the local Infinite Canvas server.',
    initTitle: 'Initialize folder as an Infinite Canvas project',
    initDesc: 'Creates .infinite-canvas.json and persists canvases and generated media in .infinite-canvas/ inside this folder, while keeping API keys in your shared config directory.',
    projectTitleLabel: 'Project title (optional)',
    projectTitlePlaceholder: 'Defaults to current folder name',
    initButton: 'Initialize & open canvas',
    initializing: 'Initializing...',
    backendIssueTitle: 'Infinite Canvas backend not ready',
    backendIssueDesc: 'Check backend settings (supports official npx, local fork repository, or external running server).',
    serverNotRunning: 'Local server is not running.',
    startServer: 'Start server',
    starting: 'Starting...',
    library: 'Library',
    newCanvas: 'New',
    reload: 'Reload',
    restart: 'Restart',
    openExternal: 'Open in browser',
    settings: 'Settings',
    settingsTitle: 'Infinite Canvas backend settings',
    settingsHint: 'Saved to ~/.dsh-infinite-canvas-bridge/config.json without touching plugin source.',
    backendMode: 'Backend mode',
    modeAuto: 'Auto (external URL -> local repo -> official npx)',
    modeLocalRepo: 'Local source / custom fork repository',
    modeNpx: 'Official npx (@basketikun/infinite-canvas)',
    modeExternal: 'External running server URL',
    repoPath: 'Local Infinite Canvas repository path',
    repoRunMode: 'Local repo launch mode',
    runModeBuilt: 'Built Node server (recommended, fast & low memory)',
    runModeDev: 'Dev hot-reload mode (tsx + Vite)',
    npxPackage: 'npx package spec',
    externalUrl: 'External server URL',
    useSharedConfigDir: 'Share model channels & credentials globally (keeps secrets out of project folders)',
    sharedConfigDir: 'Shared config directory',
    cancel: 'Cancel',
    save: 'Save & apply',
    saving: 'Saving...',
    chipEnable: 'Infinite Canvas',
    chipActiveTip: 'Open this folder project in the right-sidebar Infinite Canvas tab',
    chipInactiveTip: 'Initialize this folder as a persistent Infinite Canvas project',
  },
};

export function createClientPlugin(React) {
  const h = React.createElement;
  const CanvasSurface = createCanvasSurface(React);
  const SessionChip = createSessionChip(React);

  function CanvasIcon() {
    return h('svg', {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
      h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
      h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 }),
      h('path', { d: 'M10 6.5h4.5a3 3 0 0 1 3 3V14' }),
      h('circle', { cx: 6.5, cy: 17.5, r: 2.5 }),
      h('path', { d: 'M9 17.5h5' }),
    );
  }

  return {
    inject: ['slots', 'sessions', 'connection', 'locale'],
    apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-dsh-plugin', PLUGIN_ID);
        styleEl.textContent = BRIDGE_CSS;
        document.head.appendChild(styleEl);
        return () => styleEl.remove();
      }, `${PLUGIN_ID}: styles`);

      ctx.effect(() => ctx.locale.register(PLUGIN_NS, LOCALE_DICT), `${PLUGIN_ID}: locale`);
      const t = ctx.locale.bind(PLUGIN_NS);

      const rpc = createBridgeRpcClient();
      const store = createBridgeStore(ctx, rpc);
      ctx.effect(() => () => store.dispose(), `${PLUGIN_ID}: store`);

      // Optional layout service for fallback panel selection
      ctx.inject(['layout'], (layoutCtx) => {
        store.attachLayout(layoutCtx.layout);
        layoutCtx.effect(() => () => store.attachLayout(null), `${PLUGIN_ID}: detach layout`);
      });

      // 1. Right-sidebar persistent tab (side-by-side chat + live canvas)
      ctx.inject(['sidebarRight', 'sidebarRightTabs'], (srCtx) => {
        store.attachSidebarRight(srCtx.sidebarRight);
        srCtx.effect(() => () => store.attachSidebarRight(null), `${PLUGIN_ID}: detach sidebarRight`);

        srCtx.effect(() => srCtx.sidebarRightTabs.register({
          id: PLUGIN_ID,
          kind: TAB_KIND,
          multiple: false,
          keepMounted: true,
          title: () => t('tabTitle'),
          guide: [{
            id: 'open',
            order: 30,
            title: () => t('tabTitle'),
            description: () => t('guideDesc'),
            icon: CanvasIcon,
          }],
        }), `${PLUGIN_ID}: right-sidebar tab type`);

        srCtx.effect(() => srCtx.slots.inject('sidebar.right.pane.tab', () => srCtx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: PLUGIN_ID,
          locale: PLUGIN_NS,
        }, function RightPaneCanvas(props) {
          return h(CanvasSurface, {
            host: 'pane',
            sessionId: props?.sessionId,
            store,
            t,
          });
        })), `${PLUGIN_ID}: right-sidebar body slot`);

        srCtx.effect(() => srCtx.slots.inject('sidebar.right.pane.tab.title', () => srCtx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: PLUGIN_ID,
          locale: PLUGIN_NS,
        }, function RightPaneCanvasTitle() {
          return h('span', { className: 'icb-pane-tab-title' }, t('tabTitle'));
        })), `${PLUGIN_ID}: right-sidebar title slot`);
      });

      // 2. Composer left-side binding chip
      try {
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: `${PANEL_ID}-chip`,
          order: 42,
          locale: PLUGIN_NS,
        }, function ComposerCanvasChip(props) {
          return h(SessionChip, {
            sessionId: props?.sessionId,
            store,
            t,
          });
        })), `${PLUGIN_ID}: composer chip`);
      } catch {
        // Older DSH without conversation.input.left slot
      }

      // 3. Conversation top view tab (shown automatically when folder has .infinite-canvas.json)
      ctx.inject(['uiConversation'], (convCtx) => {
        convCtx.effect(() => convCtx.uiConversation.views.register(PANEL_ID, {
          build: () => ({ ready: true }),
        }), `${PLUGIN_ID}: conversation view target`);

        function ConversationCanvasView(props) {
          return h(CanvasSurface, {
            host: 'view',
            sessionId: props?.sessionId,
            store,
            t,
          });
        }

        let disposeViewSlot = null;
        const syncViewTab = () => {
          const sid = store.getForegroundSessionId();
          const snap = sid ? store.getStatusSnapshot(sid) : null;
          const shouldShow = Boolean(sid && snap?.active);
          if (shouldShow) {
            if (!disposeViewSlot) {
              disposeViewSlot = convCtx.slots.inject('conversation.view', () => convCtx.slots.register({
                name: 'conversation.view',
                id: PANEL_ID,
                order: 18,
                locale: PLUGIN_NS,
                label: () => t('tabTitle'),
              }, ConversationCanvasView));
            }
          } else if (disposeViewSlot) {
            const fn = disposeViewSlot;
            disposeViewSlot = null;
            void fn();
          }
        };

        const unsub = store.subscribeGlobal(syncViewTab);
        convCtx.effect(() => () => {
          unsub();
          if (disposeViewSlot) {
            const fn = disposeViewSlot;
            disposeViewSlot = null;
            void fn();
          }
        }, `${PLUGIN_ID}: dynamic conversation.view tab`);
        syncViewTab();
      });

      // 4. Fullscreen main view + left rail entry
      try {
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 105,
          label: () => t('tabTitle'),
          locale: PLUGIN_NS,
        }, CanvasIcon)), `${PLUGIN_ID}: left sidebar entry`);

        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: PLUGIN_NS,
        }, function FullscreenCanvasMain() {
          return h(CanvasSurface, {
            host: 'main',
            store,
            t,
          });
        })), `${PLUGIN_ID}: fullscreen main view`);
      } catch {
        // Ignore if shell main/panellist slot unavailable
      }
    },
  };
}
