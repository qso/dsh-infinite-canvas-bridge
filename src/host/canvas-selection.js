import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

async function storageRequest(instance, suffix, options) {
  const response = await fetch(new URL('/api/storage/projects' + suffix, instance.url), options);
  if (!response.ok) throw new Error(`Canvas storage returned HTTP ${response.status}.`);
  return response.json();
}

export async function listProjects(instance) {
  const records = await storageRequest(instance, '');
  return records.filter(row => row.value?.id === row.key)
    .map(({ value }) => ({ id: value.id, title: value.title, updatedAt: value.updatedAt }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

// The binding belongs to one DSH session and one workspace, independently of
// the folder's legacy default_project_id. Never put session ids in path names.
export async function selectProject(scope, instance, sessionId, mode, explicitId, preference, openIds) {
  const folder = path.join(scope.dataDir, '.dsh-sessions');
  const hash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const filename = path.join(folder, hash + '.json');
  const backend = instance.workspaceId || (instance.backend === 'external' ? instance.url : 'local');
  let saved;
  try { saved = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (mode === 'resume' && !explicitId && saved?.backend === backend && saved.projectId === null) return null;
  let id = explicitId || (mode === 'resume' && saved?.backend === backend ? saved.projectId : null);
  if (mode === 'resume' && !id) {
    if (preference === 'open' && openIds.length === 1) id = openIds[0];
    else if (preference === 'choose' || preference === 'open') mode = 'choose';
  }
  if (id && !/^[\w-]+$/.test(id)) throw new Error('Invalid canvas id.');
  if (id && !(await storageRequest(instance, '/' + id))?.value) {
    if (explicitId) throw new Error('The selected canvas no longer exists.');
    id = null;
  }
  if (!id && mode === 'recent') id = (await listProjects(instance))[0]?.id;
  if (!id && mode !== 'choose') {
    id = crypto.randomUUID();
    const now = new Date().toISOString();
    const value = { schemaVersion: 1, id, title: '画布 ' + id.slice(0, 6), nodes: [], connections: [], createdAt: now, updatedAt: now };
    await storageRequest(instance, '/' + id, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, clientId: sessionId }),
    });
  }
  if (saved?.projectId !== id || saved?.backend !== backend) {
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(folder, '.gitignore'), '*\n', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const tmp = filename + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify({ backend, projectId: id }), { mode: 0o600 });
    await fs.rename(tmp, filename);
  }
  return id;
}
