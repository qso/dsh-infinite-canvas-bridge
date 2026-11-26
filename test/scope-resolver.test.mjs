import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initCanvasProjectInDir,
  resolveCanvasProjectScope,
  updateDefaultProjectId,
} from '../src/host/scope-resolver.js';

test('initCanvasProjectInDir creates marker, data dir, gitignore, and resolves from nested subdirs', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'icb-scope-'));
  try {
    const before = await resolveCanvasProjectScope(tmp);
    assert.equal(before.active, false);

    const { created, scope } = await initCanvasProjectInDir(tmp, { title: 'My Storyboard' });
    assert.equal(created, true);
    assert.equal(scope.active, true);
    assert.equal(scope.title, 'My Storyboard');
    assert.equal(scope.dataDir, path.join(tmp, '.infinite-canvas'));

    const gitignore = await fs.readFile(path.join(scope.dataDir, '.gitignore'), 'utf8');
    assert.match(gitignore, /\.canvas\.lock/);
    assert.match(gitignore, /private\//);

    // Subdirectory walks upward to locate the same project
    const nested = path.join(tmp, 'scenes', 'act1');
    await fs.mkdir(nested, { recursive: true });
    const resolvedNested = await resolveCanvasProjectScope(nested);
    assert.equal(resolvedNested.active, true);
    assert.equal(resolvedNested.projectDir, path.resolve(tmp));

    // Re-init is idempotent
    const second = await initCanvasProjectInDir(tmp, { title: 'Ignored' });
    assert.equal(second.created, false);
    assert.equal(second.scope.title, 'My Storyboard');

    // Update default_project_id persists cleanly
    await updateDefaultProjectId(scope, 'proj_abc123');
    const refreshed = await resolveCanvasProjectScope(tmp);
    assert.equal(refreshed.defaultProjectId, 'proj_abc123');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
