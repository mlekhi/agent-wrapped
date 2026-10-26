import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdapter } from '../src/adapters.js';

const timestamp = '2026-05-06T14:30:00.000Z';
const claude = (name: string, input: unknown, extra = {}) => ({
  type: 'assistant', sessionId: 'session-a', cwd: '/project', timestamp,
  message: { content: [{ type: 'tool_use', id: 'call-a', name, input }] }, ...extra,
});
const codex = (payload: unknown) => ({ type: 'response_item', timestamp, payload });

test('claude extracts tool blocks and discards text and results', () => {
  const parse = createAdapter('claude', 'fallback');
  const record = claude('Read', { file_path: 'src/main.ts', secret: 'private-input' });
  const result = parse(record);
  assert.deepEqual(result.events, [{ source: 'claude', session: 'session-a', callId: 'call-a',
    timestamp: Date.parse(timestamp), tool: 'read', files: ['src/main.ts'], cwd: '/project' }]);
  assert.equal(parse({ type: 'user', message: { content: [{ type: 'tool_result', content: 'private' }] } }).ignored, 1);
  assert.equal(parse({ ...record, message: { content: [{ type: 'text', text: 'private' }] } }).ignored, 1);
});

test('claude recognizes file operations but never guesses shell effects', () => {
  for (const [name, key, tool] of [['Write', 'file_path', 'write'], ['Edit', 'file_path', 'edit'],
    ['MultiEdit', 'file_path', 'edit'], ['NotebookEdit', 'notebook_path', 'edit']] as const) {
    assert.deepEqual(createAdapter('claude', 'fallback')(claude(name, { [key]: '/project/a' })).events[0]?.files, ['/project/a']);
    assert.equal(createAdapter('claude', 'fallback')(claude(name, { [key]: '/project/a' })).events[0]?.tool, tool);
  }
  const event = createAdapter('claude', 'fallback')(claude('Bash', { command: 'cat secret.txt' })).events[0];
  assert.equal(event?.tool, 'shell');
  assert.deepEqual(event?.files, []);
});

test('codex session and turn context supply identity and updated cwd', () => {
  const parse = createAdapter('codex', 'fallback');
  parse({ type: 'session_meta', payload: { id: 'codex-session', cwd: '/old' } });
  parse({ type: 'turn_context', payload: { cwd: '/new' } });
  const result = parse(codex({ type: 'function_call', name: 'exec_command', call_id: 'call-c', arguments: '{"cmd":"cat private.txt"}' }));
  assert.deepEqual(result.events, [{ source: 'codex', session: 'codex-session', callId: 'call-c',
    timestamp: Date.parse(timestamp), tool: 'shell', files: [], cwd: '/new' }]);
  assert.equal(parse(codex({ type: 'function_call_output', call_id: 'call-c', output: 'private' })).ignored, 1);
  assert.equal(parse({ type: 'event_msg', payload: { type: 'exec_command_begin' } }).ignored, 1);
});

test('codex patch headers include moves but ignore patch content', () => {
  const patch = '*** Begin Patch\n*** Add File: a.ts\n+secret\n*** Update File: b.ts\n*** Move to: c.ts\n@@\n-*** Delete File: decoy.ts\n+ok\n*** Delete File: d.ts\n*** End Patch';
  for (const payload of [
    { type: 'custom_tool_call', name: 'apply_patch', call_id: 'patch', input: patch },
    { type: 'function_call', name: 'apply_patch', call_id: 'patch', arguments: JSON.stringify({ patch }) },
  ]) {
    const event = createAdapter('codex', 'fallback')(codex(payload)).events[0];
    assert.equal(event?.tool, 'edit');
    assert.deepEqual(event?.files, ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  }
});

test('untrusted names become other, including prototype property names', () => {
  for (const name of ['mcp__private_customer__token', '__proto__', 'constructor', 'toString']) {
    const result = createAdapter('claude', 'fallback')(claude(name, { file_path: '/private' }));
    assert.equal(result.events[0]?.tool, 'other');
    assert.deepEqual(result.events[0]?.files, []);
  }
});

test('malformed records and arguments are counted without throwing or leaking', () => {
  const parse = createAdapter('codex', 'fallback');
  for (const value of [null, [], 'secret', { type: 'response_item' },
    codex({ type: 'function_call', name: 'shell', arguments: '{secret' }),
    codex({ type: 'function_call', name: 'shell', arguments: '[]' }),
    { ...codex({ type: 'function_call', name: 'shell', arguments: '{}' }), timestamp: 'bad-secret' },
  ]) {
    assert.deepEqual(parse(value), { events: [], malformed: 1, ignored: 0 });
  }
  assert.equal(createAdapter('claude', 'fallback')(claude('Read', {}, { timestamp: '2026-02-30T00:00:00Z' })).malformed, 1);
});

test('missing call ids remain countable and invalid siblings do not discard good calls', () => {
  const record = claude('Read', { file_path: '/a' });
  const result = createAdapter('claude', 'fallback')({ ...record, sessionId: undefined, message: { content: [
    { type: 'tool_use', name: 'Read', input: { file_path: '/a' } },
    { type: 'tool_use', name: 12, input: {} },
  ] } });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.session, 'fallback');
  assert.equal(result.events[0]?.callId, undefined);
  assert.equal(result.malformed, 1);
});

test('codex native calls count without function-style names or arguments', () => {
  const parse = createAdapter('codex', 'fallback');
  for (const [type, tool] of [['web_search_call', 'web'], ['local_shell_call', 'shell'],
    ['tool_search_call', 'search'], ['image_generation_call', 'other']] as const) {
    const result = parse(codex({ type, id: 'native-call', status: 'completed', action: { type: 'search', query: 'private query' } }));
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.tool, tool);
    assert.equal(result.events[0]?.callId, 'native-call');
    assert.deepEqual(result.events[0]?.files, []);
    assert.doesNotMatch(JSON.stringify(result), /private query/);
  }
  const withoutId = parse(codex({ type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://example.test' } }));
  assert.equal(withoutId.events.length, 1);
  assert.equal(withoutId.events[0]?.callId, undefined);
});
