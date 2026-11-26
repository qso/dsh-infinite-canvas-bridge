import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANVAS_BUILTIN_TOOLS } from '../shared/tool-catalog.js';
import {
  resolveAgentCwd,
  resolveCanvasProjectScope,
  resolveScopeForAgent,
} from './scope-resolver.js';

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLUGIN_SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills');

function jsonText(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

function getSessionIdFromExec(exec) {
  return exec?.agent?.session?.id ?? exec?.agent?.sessionId ?? 'default';
}

function parseSkillMarkdown(raw, filePath) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (!match) throw new Error(`Skill missing frontmatter: ${filePath}`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[kv[1]] = val;
  }
  const name = typeof meta.name === 'string' ? meta.name.trim() : '';
  const description = typeof meta.description === 'string' ? meta.description.trim() : '';
  if (!SKILL_NAME_RE.test(name) || !description) {
    throw new Error(`Invalid skill frontmatter: ${filePath}`);
  }
  return {
    name,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    content: raw.slice(match[0].length).trim(),
  };
}

export function registerAgentIntegration(ctx, bridgeService) {
  const whenActive = async ({ agent }) => {
    if (!agent) return false;
    const scope = await resolveScopeForAgent(ctx, agent);
    return Boolean(scope?.active);
  };

  // 1. Tools
  ctx.inject(['tools'], (scopeCtx) => {
    const tools = scopeCtx.tools;

    // Global lightweight initializer so users can turn any folder into a canvas project via chat
    scopeCtx.effect(() => tools.register({
      name: 'canvas_init_project',
      description: 'Initialize the current session working directory as a persistent folder-based Infinite Canvas project (.infinite-canvas.json + .infinite-canvas/ data directory) and start the local canvas server.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Optional human-friendly project title.' },
          data_dir: { type: 'string', description: 'Optional relative data directory name (default: ".infinite-canvas").' },
        },
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => jsonText(value),
      },
      async execute(args, exec) {
        const cwd = resolveAgentCwd(ctx, exec?.agent);
        if (!cwd) throw new Error('Current session has no working directory.');
        const sessionId = getSessionIdFromExec(exec);
        const res = await bridgeService.initProject(cwd, {
          title: args.title,
          dataDir: args.data_dir,
        });
        bridgeService.requestOpenUi(sessionId, { mode: 'recent' });
        const status = await bridgeService.getStatus(res.scope, sessionId, { autoStart: true });
        return {
          created: res.created,
          project: status.project,
          instance: status.instance ? { url: status.instance.url, backend: status.instance.backend } : null,
          startError: status.startError,
          nextStep: 'The right-sidebar Infinite Canvas tab has been requested to open. Once connected, you can read and edit the canvas directly with canvas_* tools.',
        };
      },
    }), 'dsh-infinite-canvas-bridge: tool canvas_init_project');

    // Conditional open / focus tool
    scopeCtx.effect(() => tools.register({
      name: 'canvas_open',
      description: 'Ensure the current folder project Infinite Canvas server is running and open/focus the embedded Infinite Canvas tab in the DeepSeek Harness right sidebar.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['recent', 'new', 'choose'],
            description: 'Which canvas to open when projectId is not specified (default: "recent").',
          },
          projectId: {
            type: 'string',
            description: 'Optional specific canvas project ID to open.',
          },
        },
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => jsonText(value),
      },
      async execute(args, exec) {
        const scope = await resolveScopeForAgent(ctx, exec?.agent);
        if (!scope?.active) throw new Error('Current folder is not an Infinite Canvas project.');
        const sessionId = getSessionIdFromExec(exec);
        await bridgeService.ensureStarted(scope);
        const intent = bridgeService.requestOpenUi(sessionId, {
          mode: args.mode || 'recent',
          projectId: args.projectId || null,
        });
        const status = await bridgeService.getStatus(scope, sessionId, { autoStart: false });
        return {
          ok: true,
          openRequestSeq: intent.seq,
          clientConnected: status.clientConnected,
          activeCanvas: status.activeCanvas,
          url: status.instance?.url ?? null,
          hint: status.clientConnected
            ? 'Canvas is already connected and ready for canvas_get_state / canvas_apply_ops.'
            : 'Requested DeepSeek Harness UI to open the Infinite Canvas right-sidebar tab. Wait 1-2 seconds if needed before calling canvas_get_state.',
        };
      },
    }, { when: whenActive }), 'dsh-infinite-canvas-bridge: tool canvas_open');

    // Conditional built-in Infinite Canvas v1.0 tools (13 tools)
    for (const def of CANVAS_BUILTIN_TOOLS) {
      scopeCtx.effect(() => tools.register({
        name: def.name,
        description: def.description,
        parameters: def.parameters,
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, value) => {
            if (def.name === 'canvas_view_image' && value && typeof value === 'object' && value.image?.data && value.image?.mimeType) {
              const { image, ...rest } = value;
              return [
                {
                  type: 'image',
                  data: image.data,
                  mimeType: image.mimeType,
                },
                {
                  type: 'text',
                  text: JSON.stringify(rest, null, 2),
                },
              ];
            }
            return jsonText(value);
          },
        },
        async execute(args, exec) {
          const scope = await resolveScopeForAgent(ctx, exec?.agent);
          const sessionId = getSessionIdFromExec(exec);
          return await bridgeService.callCanvasTool(scope, sessionId, def.name, args || {}, exec?.signal);
        },
      }, { when: whenActive }), `dsh-infinite-canvas-bridge: tool ${def.name}`);
    }

    // Dynamic Infinite Canvas plugin tool discovery & invocation
    scopeCtx.effect(() => tools.register({
      name: 'canvas_list_plugin_tools',
      description: 'Discover third-party node/workbench plugin tools currently active on the connected Infinite Canvas page.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => jsonText(value),
      },
      async execute(_args, exec) {
        const scope = await resolveScopeForAgent(ctx, exec?.agent);
        const sessionId = getSessionIdFromExec(exec);
        const list = await bridgeService.listCanvasPluginTools(scope, sessionId, exec?.signal);
        return { tools: list };
      },
    }, { when: whenActive }), 'dsh-infinite-canvas-bridge: tool canvas_list_plugin_tools');

    scopeCtx.effect(() => tools.register({
      name: 'canvas_call_plugin_tool',
      description: 'Call a plugin tool discovered via canvas_list_plugin_tools by passing its exact name, binding, and input object.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact plugin tool name starting with plugin_.' },
          binding: { type: 'string', description: 'Binding string returned by canvas_list_plugin_tools.' },
          input: { type: 'object', additionalProperties: true },
          projectId: { type: 'string' },
        },
        required: ['name', 'binding', 'input'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => jsonText(value),
      },
      async execute(args, exec) {
        const scope = await resolveScopeForAgent(ctx, exec?.agent);
        const sessionId = getSessionIdFromExec(exec);
        return await bridgeService.callCanvasTool(
          scope,
          sessionId,
          args.name,
          { binding: args.binding, input: args.input, projectId: args.projectId },
          exec?.signal,
        );
      },
    }, { when: whenActive }), 'dsh-infinite-canvas-bridge: tool canvas_call_plugin_tool');
  });

  // 2. Conditional systemPrompt section
  ctx.inject(['systemPrompt'], (scopeCtx) => {
    scopeCtx.effect(() => scopeCtx.systemPrompt.section({
      id: 'infinite-canvas-bridge:workspace-context',
      priority: 45,
      async render({ agent }) {
        const scope = await resolveScopeForAgent(ctx, agent);
        if (!scope?.active) return '';
        return [
          `当前工作目录已启用「无限画布（Infinite Canvas）」自由创作工程：${scope.title}（数据持久化目录：${scope.dataDir}）。`,
          '你可以直接通过 canvas_* 原生工具实时读取和修改用户在右侧边栏看到的画布，无需让用户手动拖拽或复制 JSON。',
          '关键规则：',
          '1) 若画布尚未连接，先调用 canvas_open 打开右侧画布面板；首次操作先用 canvas_get_state 了解画布并记住 projectId 传给后续调用。',
          '2) 创作图片/视频/音频/文本时，默认先调 canvas_list_models 查询可用模型 ID（不要猜模型名），再通过 canvas_create_generation_flow（设置 autoRun=true）或 canvas_apply_ops(run_generation) 让画布节点直接触发生成，保持流程可视化可复编辑。',
          '3) submittedNodeIds 仅代表已提交，需用 generation_get_status 查询结果；需要审图时用 canvas_view_image 查看图片内容。',
          '4) 修改完画布后，简明告知用户你新增/修改/连线了哪些节点，以便用户在右侧画布即时查看或继续对话迭代。',
        ].join('\n');
      },
    }), 'dsh-infinite-canvas-bridge: conditional systemPrompt');
  });

  // 3. Slash command /canvas-init
  ctx.inject(['commands'], (scopeCtx) => {
    scopeCtx.effect(() => scopeCtx.commands.register({
      name: 'canvas-init',
      description: 'Initialize current directory as a persistent Infinite Canvas folder project (.infinite-canvas.json)',
      input: { hint: '[project-title]' },
      handler: async ({ agent, rawInput }) => {
        const dir = resolveAgentCwd(ctx, agent);
        if (!dir) {
          return { kind: 'error', text: '当前会话尚未绑定工作目录，请先打开一个本地文件夹。' };
        }
        const existing = await resolveCanvasProjectScope(dir);
        if (existing.active) {
          return {
            kind: 'success',
            text: `当前目录已经是无限画布工程：${existing.title}（${existing.markerPath}）。可在输入框左下角或右侧边栏打开「无限画布」。`,
          };
        }
        const res = await bridgeService.initProject(dir, { title: rawInput?.trim() || undefined });
        const sessionId = agent?.session?.id ?? agent?.sessionId ?? 'default';
        bridgeService.requestOpenUi(sessionId, { mode: 'recent' });
        return {
          kind: 'success',
          text: `已初始化无限画布工程：${res.scope.title}（${res.scope.markerPath}），作品持久化在 ${res.scope.dataDir}。`,
        };
      },
    }), 'dsh-infinite-canvas-bridge: slash command /canvas-init');
  });

  // 4. Scoped Skill Provider (only active inside .infinite-canvas.json projects)
  ctx.inject(['skills'], (scopeCtx) => {
    scopeCtx.effect(() => scopeCtx.skills.registerProvider(() => ({
      name: 'infinite-canvas-bridge',
      async list(options) {
        const scope = await resolveCanvasProjectScope(options?.cwd);
        if (!scope?.active) return [];
        const skillDir = path.join(PLUGIN_SKILLS_DIR, 'infinite-canvas-bridge');
        const skillMd = path.join(skillDir, 'SKILL.md');
        try {
          const raw = await fs.readFile(skillMd, { encoding: 'utf8', signal: options?.signal });
          const parsed = parseSkillMarkdown(raw, skillMd);
          return [{
            path: skillMd,
            name: parsed.name,
            description: parsed.description,
            invocation: parsed.invocation,
            source: 'bundled',
            provider: 'infinite-canvas-bridge',
            rank: 500,
            resourceBase: { kind: 'directory', path: skillDir.split(path.sep).join('/') },
            locator: skillMd,
          }];
        } catch {
          return [];
        }
      },
      async get(candidate, options) {
        const { rank: _rank, locator, ...summary } = candidate;
        const filePath = typeof locator === 'string' ? locator : candidate.path;
        if (!filePath) return undefined;
        try {
          const raw = await fs.readFile(filePath, { encoding: 'utf8', signal: options?.signal });
          const parsed = parseSkillMarkdown(raw, filePath);
          return { ...summary, content: parsed.content };
        } catch {
          return undefined;
        }
      },
    })), 'dsh-infinite-canvas-bridge: scoped skill provider');
  });
}
