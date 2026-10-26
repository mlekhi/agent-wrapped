import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Source } from './types.js';

export async function* discover(root: string, source: Source, explicit: boolean): AsyncGenerator<string> {
  const failure = () => new Error(`cannot read ${source} session directory`);
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure();
  } catch (error) {
    if (!explicit && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw failure();
  }
  async function* walk(directory: string): AsyncGenerator<string> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { throw failure(); }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) yield* walk(path);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) yield path;
    }
  }
  yield* walk(root);
}

type ReadRecord = { kind: 'record'; value: unknown } | { kind: 'malformed' | 'oversized' };
const maxRecordBytes = 8 * 1024 * 1024;

/** bound memory per line, even for a truncated record with no newline. */
export async function* readRecords(path: string): AsyncGenerator<ReadRecord> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    if (!(await handle.stat()).isFile()) throw new Error();
    const stream = handle.createReadStream({ autoClose: false });
    let fragments: Buffer[] = [];
    let size = 0;
    let oversized = false;
    function append(part: Buffer) {
      size += part.length;
      if (size > maxRecordBytes) { oversized = true; fragments = []; }
      else if (!oversized) fragments.push(part);
    }
    function finish(): ReadRecord | undefined {
      let result: ReadRecord | undefined;
      if (oversized) result = { kind: 'oversized' };
      else {
        const line = Buffer.concat(fragments).toString('utf8').trim();
        if (line) {
          try { result = { kind: 'record', value: JSON.parse(line) as unknown }; }
          catch { result = { kind: 'malformed' }; }
        }
      }
      fragments = []; size = 0; oversized = false;
      return result;
    }
    for await (const chunk of stream) {
      const buffer = chunk as Buffer;
      let offset = 0;
      let newline: number;
      while ((newline = buffer.indexOf(10, offset)) !== -1) {
        append(buffer.subarray(offset, newline));
        const record = finish();
        if (record) yield record;
        offset = newline + 1;
      }
      if (offset < buffer.length) append(buffer.subarray(offset));
    }
    if (size) { const record = finish(); if (record) yield record; }
  } catch { throw new Error('cannot read session log'); }
  finally { await handle?.close().catch(() => {}); }
}
