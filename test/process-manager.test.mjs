import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CanvasProcessManager,
  diagnoseBackend,
  findAvailablePort,
  probeCanvasServer,
} from '../src/host/process-manager.js';

function createMockCanvasServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, protocolVersion: 12, clients: 1, hasCanvas: true, clientStates: {} }));
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
      res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test('probeCanvasServer reads health, protocolVersion, and capabilities', async () => {
  const mock = await createMockCanvasServer();
  try {
    const probe = await probeCanvasServer(mock.url);
    assert.equal(probe.reachable, true);
    assert.equal(probe.protocolVersion, 12);
    assert.equal(probe.capabilities.dshEmbed, true);
    assert.equal(probe.capabilities.clientIdParam, true);
    assert.equal(probe.capabilities.sharedConfigDir, true);
  } finally {
    await mock.close();
  }
});

test('CanvasProcessManager adopts an already-running server recorded in .canvas.url', async () => {
  const mock = await createMockCanvasServer();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'icb-pm-'));
  try {
    await fs.writeFile(path.join(tmp, '.canvas.url'), `${mock.url}\n`, 'utf8');
    const pm = new CanvasProcessManager(async () => ({ effectiveBackend: 'npx' }));
    const found = await pm.checkExistingForDataDir(tmp);
    assert.equal(found.running, true);
    assert.equal(found.instance.url, mock.url);
    assert.equal(found.instance.managed, false);
  } finally {
    await mock.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('diagnoseBackend reports clear errors for missing local repo', async () => {
  const diag = await diagnoseBackend({
    effectiveBackend: 'local-repo',
    repoPath: '/nonexistent/path/to/infinite-canvas',
    repoRunMode: 'built',
  });
  assert.equal(diag.ok, false);
  assert.equal(diag.code, 'REPO_NOT_FOUND');
});

test('findAvailablePort returns an open localhost port', async () => {
  const port = await findAvailablePort(28100, 28150);
  assert.ok(port >= 28100 && port <= 28150);
});
