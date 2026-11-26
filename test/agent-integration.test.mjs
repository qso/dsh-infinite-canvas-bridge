import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { registerAgentIntegration } from '../src/host/agent-integration.js';
import { initCanvasProjectInDir } from '../src/host/scope-resolver.js';

test('DSH receives scoped instructions and stored image attachment blocks', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'icb-agent-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await initCanvasProjectInDir(tmp);
  const image = { attachmentId: 'image-ref', mediaType: 'image/png', name: 'drawing.png' };
  const bytes = Buffer.from('fixture');
  const attachments = {
    readImage: async ref => { assert.equal(ref, image); return { data: bytes }; },
    saveImage: async input => { assert.deepEqual(input.data, bytes); assert.equal(input.mediaType, image.mediaType); return image; },
  };
  const tools = new Map();
  let assemble;
  const host = {
    get: name => name === 'attachments' ? attachments : undefined,
    inject([name], fn) {
      if (name === 'tools') fn({ effect: register => register(), tools: { register: tool => tools.set(tool.name, tool) } });
      if (name === 'systemPrompt') fn({ on: (event, handler) => { assert.equal(event, 'system-prompt/assemble'); assemble = handler; } });
    },
  };
  const calls = [];
  const bridge = {
    getSessionBinding: () => ({ projectId: 'project-A' }),
    callCanvasTool: async (_scope, id, name, input) => {
      assert.equal(id, 'chat');
      calls.push({ name, input });
      if (name === 'canvas_list_references') return [];
      if (name === 'assets_add') return { id: 'asset' };
      if (name === 'canvas_insert_media') return { nodeId: 'node' };
      return { storageKey: 'image', image: { mimeType: image.mediaType, data: bytes.toString('base64') } };
    },
  };
  registerAgentIntegration(host, bridge);
  const exec = { agent: { session: { id: 'chat', header: { cwd: tmp }, snapshotEvents: () =>
    [{ type: 'user/message', data: { content: [{ type: 'image', attachment: image }] } }] } } };
  const assembleBase = async () => ({ sections: [] });
  assert.equal((await assemble({}, exec, assembleBase)).sections.length, 1);
  assert.equal((await assemble({}, {}, assembleBase)).sections.length, 0);
  const refs = tools.get('canvas_list_references');
  assert.equal(refs.output.schema.type, 'array');
  assert.equal((await refs.execute({}, exec))[0].attachmentId, image.attachmentId);
  const insert = tools.get('canvas_insert_media');
  await assert.rejects(insert.execute({ attachmentId: 'other-chat' }, exec));
  assert.equal((await insert.execute({ attachmentId: image.attachmentId }, exec)).nodeId, 'node');
  const [, add, place] = calls;
  assert.equal(add.input.projectId, 'project-A');
  assert.equal(add.input.imageUrl, 'data:image/png;base64,' + bytes.toString('base64'));
  assert.deepEqual(place.input, { projectId: 'project-A', assetId: 'asset' });
  const view = tools.get('canvas_view_image');
  const result = await view.execute({ nodeId: 'node' }, exec);
  assert.deepEqual(Object.keys(result).sort(), ['attachment', 'storageKey']);
  assert.deepEqual(view.output.render({}, result)[0], { type: 'image', attachment: image });
});
