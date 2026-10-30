// Generate disposable fixtures only; never uses the user's Noted workspace.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fixture, workloads, imageData, imageId, gifBytes, gifId } from '../experiments/editor-comparison/fixtures.ts';

const root = fileURLToPath(new URL(`../output/native-component-benchmark-${Date.now()}/`, import.meta.url));
await mkdir(path.join(root, 'notes'), { recursive: true });
const manifest = [];
for (const workload of workloads) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const note = { formatVersion: 1, id, title: workload.name, folderId: null, tags: ['benchmark'], revision: 1,
    createdAt: now, updatedAt: now, content: fixture(workload), presentation: { schemaId: 'default' } };
  await writeFile(path.join(root, 'notes', `${id}.json`), JSON.stringify(note, null, 2), { flag: 'wx' });
  if (workload.images) {
    const folder = path.join(root, 'assets', id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, `${imageId}.image`), Buffer.from(imageData, 'base64'), { flag: 'wx' });
    if (workload.animated) await writeFile(path.join(folder, `${gifId}.image`), gifBytes, { flag: 'wx' });
  }
  manifest.push({ id, workload });
}
await writeFile(path.join(root, 'benchmark-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(root);
