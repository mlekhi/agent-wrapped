import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePoster } from '../src/save-poster.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'agent-wrapped-save-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, destination: join(root, 'poster.png') };
}

test('lets exactly one concurrent writer save without temporary leftovers', async t => {
  const { root, destination } = await fixture(t);
  const results = await Promise.allSettled([
    savePoster(Buffer.from('one'), destination),
    savePoster(Buffer.from('two'), destination),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.ok(['one', 'two'].includes((await readFile(destination)).toString()));
  assert.deepEqual(await readdir(root), ['poster.png']);
});

test('never replaces an existing file and cleans up after failure', async t => {
  const { root, destination } = await fixture(t);
  await writeFile(destination, 'keep');
  await assert.rejects(savePoster(Buffer.from('new'), destination), { message: 'cannot write poster' });
  assert.equal(await readFile(destination, 'utf8'), 'keep');
  assert.deepEqual(await readdir(root), ['poster.png']);
});

test('refuses existing directories and missing parents without leaks', async t => {
  const { root, destination } = await fixture(t);
  const directory = join(root, 'existing'); await mkdir(directory);
  await assert.rejects(savePoster(Buffer.from('new'), directory), { message: 'cannot write poster' });
  assert.deepEqual(await readdir(root), ['existing']);
  await assert.rejects(savePoster(Buffer.from('new'), join(root, 'missing', 'poster.png')),
    { message: 'cannot write poster' });
  assert.deepEqual(await readdir(root), ['existing']);
});

test('writes complete bytes to a new destination', async t => {
  const { destination } = await fixture(t);
  await savePoster(Buffer.from('complete'), destination);
  assert.equal(await readFile(destination, 'utf8'), 'complete');
});
