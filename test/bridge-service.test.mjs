import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {
  InfiniteCanvasBridgeService,
  deriveClientIdForSession,
} from '../src/host/bridge-service.js';
import { initCanvasProjectInDir, resolveCanvasProjectScope } from '../src/host/scope-resolver.js';

function startMockBridgeBackend(expectedClientId) {
  const receivedCalls = [];
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          protocolVersion: 12,
          clients: 1,
          hasCanvas: true,
          clientStates: {
            [expectedClientId]: { projectId: 'proj_live_1', title: 'Live Canvas' },
          },
        }));
        return;
      }
      if (req.url === '/config') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          protocolVersion: 12,
          capabilities: { dshEmbed: true, clientIdParam: true, sharedConfigDir: true, privateProxies: true },
        }));
        return;
      }
      if (req.url === '/api/tools' && req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        receivedCalls.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          result: { projectId: 'proj_live_1', title: 'Live Canvas', nodes: [] },
        }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        receivedCalls,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test('bridge routes tool calls strictly by per-session clientId and syncs projectId to .infinite-canvas.json', async () => {
  const sessionId = 'session-alpha-001';
  const clientId = deriveClientIdForSession(sessionId);
  assert.notEqual(clientId, deriveClientIdForSession('session-beta-002'));

  const mock = await startMockBridgeBackend(clientId);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'icb-bridge-'));
  const userConfigPath = path.join(tmp, 'user-config.json');
  const projectDir = path.join(tmp, 'project');

  try {
    const { scope } = await initCanvasProjectInDir(projectDir, { title: 'Test Studio' });
    const service = new InfiniteCanvasBridgeService(
      { backendMode: 'external', externalUrl: mock.url },
      { userConfigPath },
    );

    const status = await service.getStatus(scope, sessionId, { autoStart: false });
    assert.equal(status.active, true);
    assert.equal(status.clientConnected, true);
    assert.equal(status.activeCanvas?.projectId, 'proj_live_1');
    assert.ok(status.iframeUrl.includes('embed=dsh'));
    assert.ok(status.iframeUrl.includes(`dshClientId=${encodeURIComponent(clientId)}`));

    const result = await service.callCanvasTool(scope, sessionId, 'canvas_get_state', { selectedOnly: true });
    assert.equal(result.projectId, 'proj_live_1');
    assert.equal(mock.receivedCalls.length, 1);
    assert.equal(mock.receivedCalls[0].clientId, clientId);
    assert.equal(mock.receivedCalls[0].projectId, 'proj_live_1');
    assert.deepEqual(mock.receivedCalls[0].input, { selectedOnly: true });

    // Wait briefly for async manifest sync
    await new Promise((r) => setTimeout(r, 50));
    const persisted = await resolveCanvasProjectScope(projectDir);
    assert.equal(persisted.defaultProjectId, 'proj_live_1');

    // Open UI intent lifecycle
    const intent = service.requestOpenUi(sessionId, { mode: 'new' });
    assert.equal(intent.seq, 1);
    service.ackUiAction(sessionId, 1);
    assert.equal(service.getSessionBinding(sessionId).openIntent, null);

    await service.dispose();
  } finally {
    await mock.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('built client.js registers a valid DSH browser module factory', async () => {
  const clientCode = await fs.readFile(new URL('../client.js', import.meta.url), 'utf8');
  let registered = null;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          registered = entry;
        },
      },
    },
    URL,
    setInterval,
    clearInterval,
  };
  vm.runInNewContext(clientCode, sandbox);
  assert.ok(registered);
  assert.equal(registered.id, 'dsh-infinite-canvas-bridge');
  assert.equal(typeof registered.factory, 'function');

  const fakeReact = {
    createElement: () => null,
    useEffect: () => {},
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  };
  const plugin = registered.factory((mod) => {
    if (mod === 'react') return fakeReact;
    throw new Error(`Unexpected require: ${mod}`);
  });
  assert.equal(typeof plugin.apply, 'function');
  assert.ok(Array.isArray(plugin.inject));
});
