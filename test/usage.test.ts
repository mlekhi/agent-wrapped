import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectUsage } from '../src/index.js';

const timestamp = '2026-05-06T14:30:00.000Z';
const call = (id: string | undefined, file = 'a.ts', extra = {}) => ({ type: 'assistant', timestamp,
  sessionId: 's1', cwd: '/project', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: file } }] }, ...extra });
const meta = { type: 'session_meta', payload: { id: 's2', cwd: '/project' } };
const patch = { type: 'response_item', timestamp, payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'patch',
  input: '*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** Add File: b.ts\n+new\n*** End Patch' } };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'agent-wrapped-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const claudeDir = join(root, 'claude');
  const codexDir = join(root, 'codex');
  await mkdir(claudeDir); await mkdir(codexDir);
  return { root, claudeDir, codexDir };
}
async function logs(dir: string, name: string, records: unknown[]) {
  await writeFile(join(dir, name), records.map(record => JSON.stringify(record)).join('\n') + '\n');
}

test('collects both sources and deduplicates calls and files across log copies', async t => {
  const dirs = await fixture(t);
  await logs(dirs.claudeDir, 'a.jsonl', [call('read'), call('read'), call('read', 'a.ts', { sessionId: 'another' }), call(undefined), call(undefined)]);
  await logs(dirs.codexDir, 'a.jsonl', [meta, patch, patch, { type: 'event_msg', payload: { type: 'token_count' } }]);
  await logs(dirs.codexDir, 'copy.jsonl', [meta, patch]);
  const summary = await collectUsage({ ...dirs, year: 2026 });
  assert.equal(summary.totalCalls, 5);
  assert.equal(summary.sources.claude, 4);
  assert.equal(summary.sources.codex, 1);
  assert.equal(summary.tools.read, 4);
  assert.equal(summary.tools.edit, 1);
  assert.equal(summary.observedFiles, 2);
  assert.equal(summary.hours[new Date(timestamp).getHours()], 5);
  assert.equal(summary.hours.reduce((a, b) => a + b), 5);
  assert.equal(summary.hours.length, 24);
  assert.equal(summary.diagnostics.duplicateCalls, 3);
});

test('resolves relative paths without merging unrelated projects or sessions', async t => {
  const dirs = await fixture(t);
  await logs(dirs.claudeDir, 'a.jsonl', [call('1', './src/../a.ts'), call('2', '/project/a.ts'),
    call('3', 'a.ts', { cwd: '/other' }), call('4', 'a.ts', { cwd: undefined }),
    call('5', 'a.ts', { cwd: undefined, sessionId: 'another' }),
    call('6', 'C:\\project\\a.ts'), call('7', '.\\a.ts', { cwd: 'C:\\project' })]);
  const summary = await collectUsage({ source: 'claude', claudeDir: dirs.claudeDir, year: 2026 });
  assert.equal(summary.observedFiles, 5);
});

test('includes both boundary dates and respects source selection', async t => {
  const dirs = await fixture(t);
  const local = (year: number, month: number, day: number, hour: number) => new Date(year, month - 1, day, hour).toISOString();
  await logs(dirs.claudeDir, 'a.jsonl', [
    call('1', 'a', { timestamp: local(2026, 5, 5, 23) }), call('2', 'b', { timestamp: local(2026, 5, 6, 0) }),
    call('3', 'c', { timestamp: local(2026, 5, 7, 23) }), call('4', 'd', { timestamp: local(2026, 5, 8, 0) }),
  ]);
  await logs(dirs.codexDir, 'a.jsonl', [meta, patch]);
  const summary = await collectUsage({ ...dirs, source: 'claude', from: '2026-05-06', to: '2026-05-07' });
  assert.equal(summary.totalCalls, 2);
  assert.equal(summary.sources.codex, 0);
  assert.equal(summary.hours[0], 1);
  assert.equal(summary.hours[23], 1);
  assert.deepEqual(summary.period, { from: '2026-05-06', to: '2026-05-07' });
});

test('defaults to the current local year', async t => {
  const dirs = await fixture(t);
  const year = new Date().getFullYear();
  await logs(dirs.claudeDir, 'a.jsonl', [call('current', 'a', { timestamp: new Date(year, 5, 1).toISOString() }),
    call('old', 'b', { timestamp: new Date(year - 1, 5, 1).toISOString() })]);
  const summary = await collectUsage({ source: 'claude', claudeDir: dirs.claudeDir });
  assert.equal(summary.totalCalls, 1);
  assert.deepEqual(summary.period, { from: `${year}-01-01`, to: `${year}-12-31` });
});

test('recovers after malformed and oversized records without exposing private text', async t => {
  const dirs = await fixture(t);
  const privateCall = { ...call('1', '/secret-file'), message: { content: [{ type: 'tool_use', id: 'private-id',
    name: 'mcp__secret-service', input: { token: 'private-token' } }] } };
  await writeFile(join(dirs.claudeDir, 'a.jsonl'), '\n{private-token\n' + JSON.stringify({ type: 'user', text: 'private-token' }) + '\n' +
    'x'.repeat(9 * 1024 * 1024) + '\n' + JSON.stringify(privateCall) + '\n' + JSON.stringify(call('2')));
  const summary = await collectUsage({ source: 'claude', claudeDir: dirs.claudeDir, year: 2026 });
  assert.equal(summary.totalCalls, 2);
  assert.equal(summary.tools.other, 1);
  assert.equal(summary.diagnostics.malformedRecords, 1);
  assert.equal(summary.diagnostics.oversizedRecords, 1);
  assert.equal(summary.diagnostics.ignoredRecords, 1);
  assert.doesNotMatch(JSON.stringify(summary), /secret|private|project|session|call-a/);
});

test('discovers nested files while ignoring symlinks and non-jsonl files', { skip: process.platform === 'win32' }, async t => {
  const dirs = await fixture(t);
  const nested = join(dirs.claudeDir, 'nested'); await mkdir(nested);
  await logs(nested, 'a.jsonl', [call('1')]);
  await logs(dirs.root, 'outside.jsonl', [call('2')]);
  await logs(dirs.claudeDir, 'ignore.json', [call('3')]);
  await symlink(join(dirs.root, 'outside.jsonl'), join(dirs.claudeDir, 'link.jsonl'));
  await symlink(dirs.root, join(nested, 'cycle'));
  const before = await readFile(join(nested, 'a.jsonl'), 'utf8');
  const summary = await collectUsage({ source: 'claude', claudeDir: dirs.claudeDir, year: 2026 });
  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.diagnostics.filesRead, 1);
  assert.equal(await readFile(join(nested, 'a.jsonl'), 'utf8'), before);
});

test('rejects explicit missing roots and symlink roots with path-free errors', { skip: process.platform === 'win32' }, async t => {
  const dirs = await fixture(t);
  await symlink(dirs.claudeDir, join(dirs.root, 'private-link'));
  for (const claudeDir of [join(dirs.root, 'private-missing'), join(dirs.root, 'private-link')]) {
    await assert.rejects(collectUsage({ source: 'claude', claudeDir }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /cannot read claude session directory/);
      assert.doesNotMatch(error.message, /private|agent-wrapped-/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('rejects empty activity and invalid filters before scanning', async t => {
  const dirs = await fixture(t);
  await assert.rejects(collectUsage({ ...dirs, year: 2026 }), /no usable activity/);
  for (const options of [{ year: 2026.5 }, { year: 0 }, { from: '2026-02-30' },
    { from: '2026-10-01', to: '2026-01-01' }, { year: 2026, from: '2026-01-01' }]) {
    await assert.rejects(collectUsage({ ...dirs, ...options }), /invalid date selection/);
  }
});

test('default discovery tolerates a missing assistant root and uses no network', async t => {
  const dirs = await fixture(t);
  const root = join(dirs.root, '.claude', 'projects'); await mkdir(root, { recursive: true });
  await logs(root, 'a.jsonl', [call('1')]);
  const script = `import { collectUsage } from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    import net from 'node:net'; import tls from 'node:tls';
    const denied = () => { throw new Error('network unavailable'); };
    globalThis.fetch = denied; net.Socket.prototype.connect = denied; tls.connect = denied;
    console.log(JSON.stringify(await collectUsage({ year: 2026 })));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: resolve('.'), env: { ...process.env, HOME: dirs.root, USERPROFILE: dirs.root, TZ: 'America/Toronto' }, encoding: 'utf8',
  });
  const summary = JSON.parse(output);
  assert.equal(summary.totalCalls, 1);
  // node ignores TZ on windows, so only timezone-independent checks run there.
  if (process.platform !== 'win32') {
    assert.equal(summary.hours[10], 1);
    assert.equal(summary.timezone, 'America/Toronto');
  }
});
