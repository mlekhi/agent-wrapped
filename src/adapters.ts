import { parseTimestamp } from './dates.js';
import type { ParsedRecord, Source, ToolCategory, ToolEvent } from './types.js';

type ObjectRecord = Record<string, unknown>;
const object = (value: unknown): value is ObjectRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
const ignored = (): ParsedRecord => ({ events: [], malformed: 0, ignored: 1 });
const malformed = (): ParsedRecord => ({ events: [], malformed: 1, ignored: 0 });

const categories = new Map<string, ToolCategory>([
  ['Read', 'read'], ['Write', 'write'], ['Edit', 'edit'], ['MultiEdit', 'edit'], ['NotebookEdit', 'edit'],
  ['Bash', 'shell'], ['Glob', 'search'], ['Grep', 'search'], ['WebFetch', 'web'], ['WebSearch', 'web'],
  ['Task', 'agent'], ['Agent', 'agent'], ['exec_command', 'shell'], ['shell', 'shell'],
  ['shell_command', 'shell'], ['write_stdin', 'shell'], ['apply_patch', 'edit'],
  ['view_image', 'read'], ['spawn_agent', 'agent'], ['send_input', 'agent'],
]);

const nativeCategories = new Map<string, ToolCategory>([
  ['web_search_call', 'web'], ['local_shell_call', 'shell'],
  ['tool_search_call', 'search'], ['image_generation_call', 'other'],
]);

function fileReferences(name: string, input: ObjectRecord | string): string[] {
  if (name === 'apply_patch') {
    const patch = typeof input === 'string' ? input : text(input.patch);
    if (!patch || !patch.startsWith('*** Begin Patch\n') || !patch.trimEnd().endsWith('*** End Patch')) return [];
    return [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)]
      .map(match => match[1]!.trim()).filter(Boolean);
  }
  if (typeof input === 'string') return [];
  const key = ['Read', 'Write', 'Edit', 'MultiEdit'].includes(name) ? 'file_path' :
    name === 'NotebookEdit' ? 'notebook_path' : name === 'view_image' ? 'path' : undefined;
  const path = key ? text(input[key]) : undefined;
  return path ? [path] : [];
}

/** consumes local records; arbitrary text is deliberately absent from normalized events. */
export function createAdapter(source: Source, fallbackSession: string): (record: unknown) => ParsedRecord {
  let session = fallbackSession;
  let cwd: string | undefined;

  function event(name: string, input: ObjectRecord | string, timestamp: number, callId: unknown): ToolEvent {
    return { source, session, timestamp, tool: categories.get(name) ?? 'other', files: fileReferences(name, input),
      ...(text(callId) ? { callId: text(callId)! } : {}), ...(cwd ? { cwd } : {}) };
  }

  return record => {
    if (!object(record) || typeof record.type !== 'string') return malformed();
    if (source === 'claude') {
      if (record.type !== 'assistant') return ignored();
      if (!object(record.message) || !Array.isArray(record.message.content)) return malformed();
      session = text(record.sessionId) ?? fallbackSession;
      cwd = text(record.cwd);
      const result: ParsedRecord = { events: [], malformed: 0, ignored: 0 };
      for (const block of record.message.content) {
        if (!object(block) || block.type !== 'tool_use') continue;
        const timestamp = parseTimestamp(record.timestamp);
        if (!text(block.name) || !object(block.input) || timestamp === undefined) {
          result.malformed = 1;
          continue;
        }
        result.events.push(event(block.name as string, block.input, timestamp, block.id));
      }
      if (!result.events.length && !result.malformed) result.ignored = 1;
      return result;
    }

    if (record.type === 'session_meta' || record.type === 'turn_context') {
      if (!object(record.payload)) return malformed();
      if (record.type === 'session_meta') session = text(record.payload.id) ?? text(record.payload.session_id) ?? fallbackSession;
      cwd = text(record.payload.cwd) ?? cwd;
      return ignored();
    }
    if (record.type !== 'response_item') return ignored();
    const payload = record.payload;
    if (!object(payload)) return malformed();
    const nativeCategory = typeof payload.type === 'string' ? nativeCategories.get(payload.type) : undefined;
    if (nativeCategory) {
      const timestamp = parseTimestamp(record.timestamp);
      if (timestamp === undefined) return malformed();
      const nativeEvent = event('', {}, timestamp, payload.call_id ?? payload.id);
      nativeEvent.tool = nativeCategory;
      return { events: [nativeEvent], malformed: 0, ignored: 0 };
    }
    if (payload.type !== 'function_call' && payload.type !== 'custom_tool_call') return ignored();
    const timestamp = parseTimestamp(record.timestamp);
    if (!text(payload.name) || timestamp === undefined) return malformed();
    let input: ObjectRecord | string;
    if (payload.type === 'custom_tool_call') {
      if (typeof payload.input !== 'string') return malformed();
      input = payload.input;
    } else {
      if (typeof payload.arguments !== 'string') return malformed();
      try {
        const parsed: unknown = JSON.parse(payload.arguments);
        if (!object(parsed)) return malformed();
        input = parsed;
      } catch { return malformed(); }
    }
    return { events: [event(payload.name as string, input, timestamp, payload.call_id)], malformed: 0, ignored: 0 };
  };
}
