import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { renderPoster } from '../src/poster.js';
import { renderPosterSvg } from '../src/poster-svg.js';
import { posterFixture } from './poster-fixture.js';

function pngChunks(png: Buffer) {
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks: { type: string; data: Buffer }[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    assert.ok(offset + size + 12 <= png.length);
    chunks.push({ type: png.toString('ascii', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + size) });
    offset += size + 12;
  }
  return chunks;
}

test('renders a complete 1200 by 1500 png without embedded text metadata', async () => {
  const png = await renderPoster(posterFixture());
  const chunks = pngChunks(png);
  assert.equal(chunks[0]?.type, 'IHDR');
  assert.equal(chunks[0]?.data.readUInt32BE(0), 1200);
  assert.equal(chunks[0]?.data.readUInt32BE(4), 1500);
  assert.equal(chunks.at(-1)?.type, 'IEND');
  assert.ok(chunks.every(chunk => ['IHDR', 'IDAT', 'IEND'].includes(chunk.type)));
  const pixels = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  assert.ok(pixels.length > 1200 * 1500 * 3);
  assert.ok(new Set(pixels).size > 64);
});

test('shows selected dates, counts, tool rankings, source labels, and local hourly peak', () => {
  const summary = posterFixture();
  const svg = renderPosterSvg(summary);
  for (const label of ['agent', 'wrapped', '2026', 'jan 1', 'dec 31', '386', 'observed files',
    'claude code', 'codex', '4,200', '3,100', 'america/toronto', '15:00', '16:00']) assert.ok(svg.includes(label), label);
  assert.ok(svg.indexOf('>read<') < svg.indexOf('>edit<'));
  assert.equal((svg.match(/data-hour="\d+"/g) ?? []).length, 24);
  assert.match(svg, /referenced files/);
  assert.match(svg, /tool calls by local hour/);
});

test('unknown fields and diagnostics cannot change the shared image', async () => {
  const clean = posterFixture();
  const poisoned = structuredClone(clean);
  Object.assign(poisoned, { prompt: '<image href="file:///secret"/>', filename: '/private/token', token: 'secret-token' });
  Object.assign(poisoned.tools, { 'secret-token': 123 });
  Object.assign(poisoned.sources, { 'secret-service': 123 });
  Object.assign(poisoned.diagnostics, { token: 'secret-token' });
  assert.equal(renderPosterSvg(poisoned), renderPosterSvg(clean));
  assert.deepEqual(await renderPoster(poisoned), await renderPoster(clean));
});

test('rejects injected fields and invalid summaries with a fixed safe error', async () => {
  const invalid = [
    { timezone: '<image href="https://secret"/>' }, { timezone: 'private-token' },
    { period: { from: 'private-token', to: '2026-12-31' } },
    { period: { from: '2026-12-31', to: '2026-01-01' } },
    { period: { from: '2026-02-30', to: '2026-12-31' } },
    { totalCalls: 0 }, { totalCalls: Infinity }, { totalCalls: 'private-token' },
    { observedFiles: -1 }, { observedFiles: 0.5 }, { observedFiles: Number.MAX_SAFE_INTEGER + 1 },
    { hours: [1, 2] }, { hours: Array(24).fill(-1) }, { tools: null }, { sources: { claude: 1 } },
  ];
  for (const change of invalid) {
    const summary = Object.assign(posterFixture(), change);
    assert.throws(() => renderPosterSvg(summary), { message: 'invalid usage summary' });
    await assert.rejects(renderPoster(summary), { message: 'invalid usage summary' });
  }
});

test('single-source sparse activity renders only used categories and wraps midnight', async () => {
  const summary = posterFixture();
  summary.totalCalls = 1;
  summary.sources = { claude: 0, codex: 1 };
  summary.tools = { read: 0, write: 0, edit: 0, shell: 0, search: 0, web: 0, agent: 0, other: 1 };
  summary.hours = Array<number>(24).fill(0); summary.hours[23] = 1;
  summary.observedFiles = 0;
  const svg = renderPosterSvg(summary);
  assert.ok(svg.includes('codex'));
  assert.ok(!svg.includes('claude code'));
  assert.match(svg, /23:00.*00:00/);
  assert.match(svg, />other</);
  assert.doesNotMatch(svg, />read</);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  pngChunks(await renderPoster(summary));
});

test('ties do not claim a single busiest hour and large counts stay bounded', async () => {
  const summary = posterFixture();
  summary.totalCalls = 24;
  summary.sources = { claude: 24, codex: 0 };
  summary.tools = { read: 12, write: 0, edit: 12, shell: 0, search: 0, web: 0, agent: 0, other: 0 };
  summary.hours = Array<number>(24).fill(1);
  const svg = renderPosterSvg(summary);
  assert.match(svg, /all hours tied/);
  summary.totalCalls = 1_000_000_000_000;
  summary.sources.claude = summary.totalCalls;
  summary.tools.read = summary.totalCalls; summary.tools.edit = 0;
  summary.hours = Array<number>(24).fill(0); summary.hours[0] = summary.totalCalls;
  summary.observedFiles = Number.MAX_SAFE_INTEGER;
  const large = renderPosterSvg(summary);
  assert.doesNotMatch(large, /NaN|Infinity/);
  pngChunks(await renderPoster(summary));
});

test('renders with bundled assets from another cwd and with networking disabled', () => {
  const moduleUrl = new URL('../src/poster.js', import.meta.url).href;
  const fixtureUrl = new URL('./poster-fixture.js', import.meta.url).href;
  const script = `import net from 'node:net'; import tls from 'node:tls';
    const denied = () => { throw new Error('network unavailable'); };
    globalThis.fetch = denied; net.Socket.prototype.connect = denied; tls.connect = denied;
    const { renderPoster } = await import(${JSON.stringify(moduleUrl)});
    const { posterFixture } = await import(${JSON.stringify(fixtureUrl)});
    process.stdout.write(await renderPoster(posterFixture()));`;
  const png = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: tmpdir(), maxBuffer: 10 * 1024 * 1024 });
  assert.equal(pngChunks(png)[0]?.data.readUInt32BE(0), 1200);
});

test('rejects missing hourly buckets instead of drawing invalid geometry', () => {
  const summary = posterFixture();
  const hours = Array<number>(24);
  hours[0] = summary.totalCalls;
  summary.hours = hours;
  assert.throws(() => renderPosterSvg(summary), { message: 'invalid usage summary' });
});
