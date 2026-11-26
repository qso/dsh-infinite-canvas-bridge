import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeBridgeConfig,
  readUserConfigOverrides,
  writeUserConfigOverrides,
} from '../src/host/config.js';

test('normalizeBridgeConfig defaults to npx when no repoPath or externalUrl is provided', () => {
  const cfg = normalizeBridgeConfig({}, {}, {});
  assert.equal(cfg.backendMode, 'auto');
  assert.equal(cfg.effectiveBackend, 'npx');
  assert.equal(cfg.repoPath, '');
  assert.equal(cfg.externalUrl, '');
  assert.equal(cfg.useSharedConfigDir, true);
  assert.ok(cfg.sharedConfigDir.endsWith(path.join('.infinite-canvas', 'shared')));
});

test('normalizeBridgeConfig auto-selects local-repo when repoPath is set and external when externalUrl is set', () => {
  const localCfg = normalizeBridgeConfig({ repoPath: '~/my-infinite-canvas' }, {}, {});
  assert.equal(localCfg.effectiveBackend, 'local-repo');
  assert.equal(localCfg.repoPath, path.join(os.homedir(), 'my-infinite-canvas'));

  const extCfg = normalizeBridgeConfig({ repoPath: '~/my-infinite-canvas', externalUrl: 'http://127.0.0.1:17371/canvas' }, {}, {});
  assert.equal(extCfg.effectiveBackend, 'external');
  assert.equal(extCfg.externalUrl, 'http://127.0.0.1:17371');
});

test('environment variables override user overrides and plugin config', () => {
  const cfg = normalizeBridgeConfig(
    { backendMode: 'npx', repoRunMode: 'built' },
    { backendMode: 'local-repo', repoPath: '/tmp/override-repo' },
    {
      DSH_INFINITE_CANVAS_MODE: 'local-repo',
      DSH_INFINITE_CANVAS_REPO: '/tmp/env-repo',
      DSH_INFINITE_CANVAS_REPO_RUN_MODE: 'dev',
    },
  );
  assert.equal(cfg.effectiveBackend, 'local-repo');
  assert.equal(cfg.repoPath, path.resolve('/tmp/env-repo'));
  assert.equal(cfg.repoRunMode, 'dev');
});

test('user config overrides persist atomically on disk', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'icb-cfg-'));
  const file = path.join(tmp, 'config.json');
  try {
    await writeUserConfigOverrides({ backendMode: 'local-repo', repoPath: '/tmp/demo' }, file);
    const loaded = await readUserConfigOverrides(file);
    assert.deepEqual(loaded, { backendMode: 'local-repo', repoPath: '/tmp/demo' });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
