import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { createAdapter } from './adapters.js';
import { dayOrdinal, isCalendarDay, localDay } from './dates.js';
import { discover, readRecords } from './reader.js';
import type { Source, ToolEvent, UsageOptions, UsageSummary } from './types.js';
export type { Source, ToolCategory, UsageOptions, UsageSummary } from './types.js';

function selection(options: UsageOptions): { from?: string; to?: string } {
  const hasDates = options.from !== undefined || options.to !== undefined;
  if (hasDates) {
    if (options.year !== undefined ||
      (options.from !== undefined && (typeof options.from !== 'string' || !isCalendarDay(options.from))) ||
      (options.to !== undefined && (typeof options.to !== 'string' || !isCalendarDay(options.to))) ||
      (options.from !== undefined && options.to !== undefined && options.from > options.to)) {
      throw new Error('invalid date selection');
    }
    return { ...(options.from !== undefined ? { from: options.from } : {}), ...(options.to !== undefined ? { to: options.to } : {}) };
  }
  const year = options.year ?? new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('invalid date selection');
  const label = String(year).padStart(4, '0');
  return { from: `${label}-01-01`, to: `${label}-12-31` };
}

function fileIdentity(file: string, event: ToolEvent): string {
  const paths = /^[a-z]:[\\/]|^\\\\/i.test(file) || (event.cwd && /^[a-z]:[\\/]|^\\\\/i.test(event.cwd)) ? win32 : posix;
  if (paths.isAbsolute(file)) return JSON.stringify(['absolute', paths.normalize(file)]);
  if (event.cwd && paths.isAbsolute(event.cwd)) return JSON.stringify(['absolute', paths.resolve(event.cwd, file)]);
  return JSON.stringify(['relative', event.source, event.session, paths.normalize(file)]);
}

/** reads logs without modifying them; returns only fixed labels, dates, and aggregate counts. */
export async function collectUsage(options: UsageOptions = {}): Promise<UsageSummary> {
  const range = selection(options);
  if (options.source !== undefined && !['all', 'claude', 'codex'].includes(options.source)) throw new Error('invalid source selection');
  const sources: Source[] = options.source && options.source !== 'all' ? [options.source] : ['claude', 'codex'];
  const summary: UsageSummary = {
    period: { from: '', to: '' }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    totalCalls: 0, observedFiles: 0, activeDays: 0, longestStreakDays: 0,
    tools: { read: 0, write: 0, edit: 0, shell: 0, search: 0, web: 0, agent: 0, other: 0 },
    sources: { claude: 0, codex: 0 }, hours: Array<number>(24).fill(0),
    diagnostics: { filesRead: 0, malformedRecords: 0, ignoredRecords: 0, duplicateCalls: 0, oversizedRecords: 0 },
  };
  const seenCalls = new Set<string>();
  const activeDays = new Set<string>();
  const files = new Set<string>();
  let firstDay = '9999-12-31';
  let lastDay = '0000-01-01';
  for (const source of sources) {
    const override = source === 'claude' ? options.claudeDir : options.codexDir;
    const root = override ?? (source === 'claude' ? join(homedir(), '.claude', 'projects') : join(homedir(), '.codex', 'sessions'));
    for await (const path of discover(root, source, override !== undefined)) {
      const parse = createAdapter(source, path);
      summary.diagnostics.filesRead++;
      for await (const record of readRecords(path)) {
        if (record.kind === 'malformed') { summary.diagnostics.malformedRecords++; continue; }
        if (record.kind === 'oversized') { summary.diagnostics.oversizedRecords++; continue; }
        if (record.kind !== 'record') continue;
        const parsed = parse(record.value);
        summary.diagnostics.malformedRecords += parsed.malformed;
        summary.diagnostics.ignoredRecords += parsed.ignored;
        for (const event of parsed.events) {
          const day = localDay(event.timestamp);
          if ((range.from && day < range.from) || (range.to && day > range.to)) continue;
          if (event.callId) {
            const identity = JSON.stringify([event.source, event.session, event.callId]);
            if (seenCalls.has(identity)) { summary.diagnostics.duplicateCalls++; continue; }
            seenCalls.add(identity);
          }
          activeDays.add(day);
          summary.totalCalls++;
          summary.sources[source]++;
          summary.tools[event.tool]++;
          const hour = new Date(event.timestamp).getHours();
          summary.hours[hour] = summary.hours[hour]! + 1;
          if (day < firstDay) firstDay = day;
          if (day > lastDay) lastDay = day;
          for (const file of event.files) files.add(fileIdentity(file, event));
        }
      }
    }
  }
  if (!summary.totalCalls) throw new Error('no usable activity in the selected period');
  summary.observedFiles = files.size;
  summary.period = { from: range.from ?? firstDay, to: range.to ?? lastDay };
  summary.activeDays = activeDays.size;
  let previous = Number.NEGATIVE_INFINITY;
  let streak = 0;
  for (const day of [...activeDays].sort()) {
    const ordinal = dayOrdinal(day);
    streak = ordinal === previous + 1 ? streak + 1 : 1;
    summary.longestStreakDays = Math.max(summary.longestStreakDays, streak);
    previous = ordinal;
  }
  return summary;
}
