import { isCalendarDay } from './dates.js';
import type { ToolCategory, UsageSummary } from './types.js';

const categories: ToolCategory[] = ['read', 'write', 'edit', 'shell', 'search', 'web', 'agent', 'other'];
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', value < 1_000_000 ? {} : {
    notation: 'compact', maximumSignificantDigits: 4,
  }).format(value).toLowerCase();
}

/** project only validated, fixed-label values into the rendering layer. */
export function posterModel(summary: UsageSummary) {
  const fail = () => { throw new Error('invalid usage summary'); };
  if (!object(summary) || !count(summary.totalCalls) || !summary.totalCalls || !count(summary.observedFiles) ||
    !object(summary.period) || typeof summary.period.from !== 'string' || typeof summary.period.to !== 'string' ||
    !isCalendarDay(summary.period.from) || !isCalendarDay(summary.period.to) || summary.period.from > summary.period.to ||
    !object(summary.tools) || !object(summary.sources) || !Array.isArray(summary.hours) || summary.hours.length !== 24 ||
    !Array.from(summary.hours).every(count) || !categories.every(key => count(summary.tools[key])) ||
    !count(summary.sources.claude) || !count(summary.sources.codex) ||
    sum(summary.hours) !== summary.totalCalls || sum(categories.map(key => summary.tools[key])) !== summary.totalCalls ||
    summary.sources.claude + summary.sources.codex !== summary.totalCalls) return fail();
  let timezone: string;
  try {
    if (typeof summary.timezone !== 'string' || summary.timezone.length > 100) return fail();
    timezone = new Intl.DateTimeFormat('en-US', { timeZone: summary.timezone }).resolvedOptions().timeZone.toLowerCase();
  } catch { return fail(); }
  // canonical zones are labels, never arbitrary caller-provided svg text.
  if (!/^[a-z0-9_+\-/:]+$/.test(timezone)) return fail();
  const dates = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const dateLabel = (value: string) => `${dates.format(new Date(`${value}T00:00:00Z`)).toLowerCase()}, ${value.slice(0, 4)}`;
  const maximum = Math.max(...summary.hours);
  const peaks = summary.hours.flatMap((value, hour) => value === maximum ? [hour] : []);
  const peak = peaks.length === 24 ? 'all hours tied' : peaks.length === 1 ?
    `${hourLabel(peaks[0]!)}–${hourLabel((peaks[0]! + 1) % 24)}` : `${peaks.length} hours tied for busiest`;
  return {
    period: `${dateLabel(summary.period.from)} — ${dateLabel(summary.period.to)}`,
    timezone, total: formatCount(summary.totalCalls), files: formatCount(summary.observedFiles),
    sources: [
      ...(summary.sources.claude ? [`claude code ${formatCount(summary.sources.claude)}`] : []),
      ...(summary.sources.codex ? [`codex ${formatCount(summary.sources.codex)}`] : []),
    ].join('  /  '),
    tools: categories.map(label => ({ label, count: summary.tools[label] }))
      .filter(tool => tool.count > 0).sort((a, b) => b.count - a.count),
    hours: summary.hours.map((value, hour) => ({ hour, ratio: value / maximum, peak: value === maximum })),
    peak,
  };
}
