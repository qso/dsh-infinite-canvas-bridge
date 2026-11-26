/**
 * Built-in Infinite Canvas v1.0 tool catalog mirrored as plain JSON Schema
 * so this plugin has zero runtime npm dependencies while keeping exact parity
 * with `@infinite-canvas/shared/canvas/tools/schemas`.
 */

const NODE_TYPES = ['image', 'text', 'video', 'audio', 'group'];
const GENERATION_MODES = ['text', 'image', 'video', 'audio'];

const POSITION_SCHEMA = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
  },
  required: ['x', 'y'],
  additionalProperties: false,
};

const VIEWPORT_SCHEMA = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    k: { type: 'number' },
  },
  required: ['x', 'y', 'k'],
  additionalProperties: false,
};

const GENERATION_OPTION_PROPS = {
  model: { type: 'string', description: 'Model ID returned by canvas_list_models.' },
  size: { type: 'string', description: 'Image/video size or aspect ratio (e.g. 16:9, 9:16, 1024x1024).' },
  quality: { type: 'string', description: 'Image quality or resolution tier.' },
  count: { type: 'number', description: 'Number of outputs to generate.' },
  seconds: { type: 'string', description: 'Video duration in seconds.' },
  vquality: { type: 'string', description: 'Video resolution/quality.' },
  generateAudio: { type: 'string', description: 'Whether to generate synchronized audio.' },
  watermark: { type: 'string', description: 'Watermark option.' },
  videoMode: { type: 'string', description: 'Video generation mode (e.g. frames or reference).' },
  audioVoice: { type: 'string', description: 'Audio voice id.' },
  audioFormat: { type: 'string', description: 'Audio output format.' },
  audioSpeed: { type: 'string', description: 'Audio speed.' },
  audioInstructions: { type: 'string', description: 'Audio style or delivery instructions.' },
};

const PROJECT_ID_PROP = {
  projectId: {
    type: 'string',
    description: 'Canvas project ID returned by canvas_get_state. Pass it on follow-up calls to guard against accidental canvas switches.',
  },
};

export const CANVAS_BUILTIN_TOOLS = [
  {
    name: 'canvas_get_state',
    readOnly: true,
    description: 'Read a compact overview of the active Infinite Canvas: projectId, title, node IDs/types/titles/positions/sizes/statuses/group members, and connections. Supports filtering by ids, types, selectedOnly, groupId, keyword, and offset pagination.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        ids: { type: 'array', items: { type: 'string' } },
        types: { type: 'array', items: { type: 'string', enum: NODE_TYPES } },
        selectedOnly: { type: 'boolean', description: 'Return only currently selected nodes in the canvas.' },
        groupId: { type: 'string' },
        keyword: { type: 'string' },
        includeConnections: { type: 'boolean' },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_get_nodes',
    readOnly: true,
    description: 'Read full text content, generation parameters, media dimensions, and group members for up to 50 node IDs.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
      },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_list_models',
    readOnly: true,
    description: 'List configured model IDs, capabilities (text/image/video/audio), and defaults in the current Infinite Canvas instance. Always check this before creating generation nodes instead of guessing model IDs.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        capability: { type: 'string', enum: GENERATION_MODES },
        keyword: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_apply_ops',
    readOnly: false,
    description: 'Apply up to 200 canvas operations in one batch: add_node, update_node, move_nodes, group_nodes, ungroup_nodes, set_group_members, delete_node, delete_connections, connect_nodes, set_viewport, select_nodes, run_generation. Returns only deltas and submittedNodeIds.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        ops: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'add_node',
                  'update_node',
                  'move_nodes',
                  'group_nodes',
                  'ungroup_nodes',
                  'set_group_members',
                  'delete_node',
                  'delete_connections',
                  'connect_nodes',
                  'set_viewport',
                  'select_nodes',
                  'run_generation',
                ],
              },
              id: { type: 'string' },
              ids: { type: 'array', items: { type: 'string' } },
              nodeType: { type: 'string', enum: NODE_TYPES },
              title: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              position: POSITION_SCHEMA,
              patch: { type: 'object', additionalProperties: true },
              metadata: { type: 'object', additionalProperties: true },
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              groupId: { type: 'string' },
              nodeIds: { type: 'array', items: { type: 'string' } },
              fromNodeId: { type: 'string' },
              toNodeId: { type: 'string' },
              all: { type: 'boolean' },
              viewport: VIEWPORT_SCHEMA,
              nodeId: { type: 'string' },
              mode: { type: 'string', enum: GENERATION_MODES },
              prompt: { type: 'string' },
            },
            required: ['type'],
            additionalProperties: true,
          },
        },
      },
      required: ['ops'],
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_create_text_nodes',
    readOnly: false,
    description: 'Create one or more text nodes (scripts, briefs, prompts, storyboards, notes) neatly laid out in a row or column.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              title: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
            required: ['text'],
            additionalProperties: false,
          },
        },
        x: { type: 'number' },
        y: { type: 'number' },
        gap: { type: 'number' },
        direction: { type: 'string', enum: ['row', 'column'] },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_create_generation_flow',
    readOnly: false,
    description: 'Create a visual generation node flow on the canvas for text, image, video, or audio, optionally connecting existing referenceNodeIds (nodes or groups). Set autoRun=true to trigger generation through the canvas node immediately; poll progress with generation_get_status.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        prompt: { type: 'string' },
        title: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        referenceNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Existing node IDs or group IDs used as visual/text/audio references.',
        },
        mode: { type: 'string', enum: GENERATION_MODES },
        autoRun: { type: 'boolean', description: 'Set true to trigger generation immediately via the created node.' },
        ...GENERATION_OPTION_PROPS,
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'generation_get_status',
    readOnly: true,
    description: 'Check asynchronous generation status for canvas nodes or workbench tasks. Use nodeIds returned by canvas_create_generation_flow or canvas_apply_ops(run_generation) before retrying.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        scope: { type: 'string', enum: ['all', 'canvas', 'image', 'video'] },
        taskId: { type: 'string' },
        nodeIds: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_view_image',
    readOnly: true,
    description: 'Inspect an image node or stored asset image (resized up to 1024px) so you can visually review generated artwork or reference images directly.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        nodeId: { type: 'string' },
        storageKey: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_list_references',
    readOnly: true,
    description: 'List up to 50 recent uploaded reference images in the current project, returning storageKey, name, and dimensions.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'canvas_insert_media',
    readOnly: false,
    description: 'Insert an existing media asset (via assetId from assets_list or storageKey from canvas_list_references) onto the canvas while preserving aspect ratio.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        assetId: { type: 'string' },
        attachmentId: { type: 'string', description: 'DSH conversation image from canvas_list_references. Use only one image source.' },
        storageKey: { type: 'string' },
        title: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'prompts_search',
    readOnly: true,
    description: 'Search the built-in and configured prompt libraries in Infinite Canvas.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        keyword: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'assets_list',
    readOnly: true,
    description: 'List saved items in the Infinite Canvas asset library.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        ids: { type: 'array', items: { type: 'string' } },
        includeContent: { type: 'boolean' },
        kind: { type: 'string', enum: ['all', 'text', 'image', 'video'] },
        keyword: { type: 'string' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'assets_add',
    readOnly: false,
    description: 'Save a text or image item into the Infinite Canvas asset library.',
    parameters: {
      type: 'object',
      properties: {
        ...PROJECT_ID_PROP,
        kind: { type: 'string', enum: ['text', 'image'] },
        title: { type: 'string' },
        content: { type: 'string' },
        imageUrl: { type: 'string' },
        source: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['kind', 'title'],
      additionalProperties: false,
    },
  },
];
