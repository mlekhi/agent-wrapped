import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const timestamp = '2026-05-06T14:30:00.000Z';
const call = (id: string, file = 'a.ts', extra = {}) => ({ type: 'assistant', timestamp,
  sessionId: 's1', cwd: '/project', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: file } }] }, ...extra });

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'agent-wrapped-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'); await mkdir(home);
  const claudeDir = join(root, 'claude'); await mkdir(claudeDir);
  return { root, home, claudeDir };
}
async function logs(dir: string, name: string, records: unknown[]) {
  await writeFile(join(dir, name), records.map(record => JSON.stringify(record)).join('\n') + '\n');
}
function run(args: string[], dirs: { home: string; root: string }, cwd = dirs.root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8',
    env: { ...process.env, HOME: dirs.home, USERPROFILE: dirs.home, TZ: 'America/Toronto' } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function pngSize(png: Buffer) {
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
const noTemporaryFiles = async (root: string) =>
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.agent-wrapped-')));

test('prints help for every option and exits zero', async t => {
  const dirs = await fixture(t);
  const result = run(['--help'], dirs);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  for (const label of ['usage: agent-wrapped', '--source', '--save', '--from', '--to',
    '--claude-dir', '--codex-dir', '--help', 'never uploaded']) assert.ok(result.stdout.includes(label), label);
});

test('renders both sources for the current year to wrapped.png by default', async t => {
  const dirs = await fixture(t);
  const year = new Date().getFullYear();
  const at = (month: number, day: number) => new Date(year, month - 1, day, 12).toISOString();
  const claudeDir = join(dirs.home, '.claude', 'projects'); await mkdir(claudeDir, { recursive: true });
  const codexDir = join(dirs.home, '.codex', 'sessions'); await mkdir(codexDir, { recursive: true });
  await logs(claudeDir, 'a.jsonl', [call('c1', 'a.ts', { timestamp: at(5, 1) })]);
  await logs(codexDir, 'a.jsonl', [
    { type: 'session_meta', payload: { id: 's2', cwd: '/project' } },
    { type: 'response_item', timestamp: at(5, 2),
      payload: { type: 'function_call', name: 'exec_command', call_id: 'c2', arguments: '{}' } },
  ]);
  const before = await readFile(join(claudeDir, 'a.jsonl'), 'utf8');
  const result = run([], dirs);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(pngSize(await readFile(join(dirs.root, 'wrapped.png'))), { width: 1200, height: 1500 });
  assert.equal(await readFile(join(claudeDir, 'a.jsonl'), 'utf8'), before);
  await noTemporaryFiles(dirs.root);
});

test('applies source, year, and date filters and refuses to overwrite', async t => {
  const dirs = await fixture(t);
  await logs(dirs.claudeDir, 'a.jsonl', [
    call('1', 'a.ts', { timestamp: new Date(2026, 4, 5, 12).toISOString() }),
    call('2', 'b.ts', { timestamp: new Date(2026, 4, 7, 12).toISOString() }),
  ]);
  const out = join(dirs.root, 'poster.png');
  const base = ['2026', '--source', 'claude', '--claude-dir', dirs.claudeDir];
  let result = run([...base, '--save', out], dirs);
  assert.equal(result.status, 0);
  const first = await readFile(out);
  assert.deepEqual(pngSize(first), { width: 1200, height: 1500 });
  result = run([...base, '--save', out], dirs);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'cannot write poster\n');
  assert.deepEqual(await readFile(out), first);
  await noTemporaryFiles(dirs.root);
  result = run(['--source', 'claude', '--claude-dir', dirs.claudeDir,
    '--from', '2026-05-05', '--to', '2026-05-05', '--save', join(dirs.root, 'range.png')], dirs);
  assert.equal(result.status, 0);
  assert.deepEqual(pngSize(await readFile(join(dirs.root, 'range.png'))), { width: 1200, height: 1500 });
  result = run([...base, '--save', join(dirs.root, 'missing', 'poster.png')], dirs);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'cannot write poster\n');
  await noTemporaryFiles(dirs.root);
});

test('rejects unknown, repeated, incomplete, and conflicting options', async t => {
  const dirs = await fixture(t);
  const cases: Array<[string[], string]> = [
    [['--bogus'], 'invalid arguments'],
    [['--source', 'claude', '--source', 'codex'], 'invalid arguments'],
    [['--save'], 'invalid arguments'],
    [['--save', ''], 'invalid arguments'],
    [['2026', '2025'], 'invalid arguments'],
    [['--source', 'everything'], 'invalid source selection'],
    [['2024.5'], 'invalid date selection'],
    [['--from', '2026-02-30'], 'invalid date selection'],
    [['--from', '2026-05-07', '--to', '2026-05-05'], 'invalid date selection'],
    [['2026', '--from', '2026-05-05'], 'invalid date selection'],
  ];
  for (const [args, message] of cases) {
    const result = run(args, dirs);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.stderr, `${message}\n`, args.join(' '));
  }
});

test('reports missing and empty logs with fixed errors', async t => {
  const dirs = await fixture(t);
  const out = join(dirs.root, 'poster.png');
  let result = run(['--source', 'claude', '--claude-dir', join(dirs.root, 'missing'), '--save', out], dirs);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'cannot read claude session directory\n');
  result = run(['--source', 'claude', '--claude-dir', dirs.claudeDir, '--save', out], dirs);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'no usable activity in the selected period\n');
  await assert.rejects(readFile(out), { code: 'ENOENT' });
});

test('tolerates malformed records without leaking transcript text', async t => {
  const dirs = await fixture(t);
  const textOnly = { ...call('1'), message: { content: [{ type: 'text', text: 'private-token' }] } };
  await writeFile(join(dirs.claudeDir, 'a.jsonl'),
    '\n{private-token\n' + JSON.stringify(textOnly) + '\n' + JSON.stringify(call('2')));
  const result = run(['2026', '--source', 'claude', '--claude-dir', dirs.claudeDir,
    '--save', join(dirs.root, 'poster.png')], dirs);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const png = await readFile(join(dirs.root, 'poster.png'));
  assert.ok(!png.includes('private-token'));
});

test('runs the complete cli with networking unavailable', async t => {
  const dirs = await fixture(t);
  const blocker = new URL('./no-network.js', import.meta.url).href;
  const env = { ...process.env, HOME: dirs.home, USERPROFILE: dirs.home, TZ: 'America/Toronto' };
  const probe = spawnSync(process.execPath, ['--import', blocker, '--input-type=module', '-e', `
    import net from 'node:net';
    const blocked = (label, run) => {
      try { run(); } catch (error) { if (error.message === 'network unavailable') return; throw error; }
      throw new Error(label + ' open');
    };
    blocked('socket', () => new net.Socket().connect(80, '127.0.0.1'));
    blocked('fetch', () => { void fetch('https://example.test'); });`], { cwd: dirs.root, encoding: 'utf8', env });
  assert.equal(probe.status, 0, probe.stderr);
  await logs(dirs.claudeDir, 'a.jsonl', [call('offline', 'a.ts', { timestamp: new Date(2026, 4, 6, 12).toISOString() })]);
  const result = spawnSync(process.execPath, ['--import', blocker, cli, '2026', '--source', 'claude',
    '--claude-dir', dirs.claudeDir, '--save', join(dirs.root, 'offline.png')], { cwd: dirs.root, encoding: 'utf8', env });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(pngSize(await readFile(join(dirs.root, 'offline.png'))), { width: 1200, height: 1500 });
});
