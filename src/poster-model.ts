import { calendarMonths, dayOrdinal, isCalendarDay } from './dates.js';
import type { Source, ToolCategory, UsageSummary } from './types.js';

const categories: ToolCategory[] = ['read', 'write', 'edit', 'shell', 'search', 'web', 'agent', 'other'];
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const agents: { id: Source; label: string; color: string }[] = [
  { id: 'claude', label: 'claude code', color: '#ff947c' },
  { id: 'codex', label: 'codex', color: '#c2a0ff' },
];
const percent = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;

function archetype(summary: UsageSummary) {
  if (summary.totalCalls >= 100 && summary.activeDays >= 7) {
    const night = [22, 23, 0, 1, 2, 3, 4].reduce((total, hour) => total + summary.hours[hour]!, 0) / summary.totalCalls;
    const morning = summary.hours.slice(5, 10).reduce((a, b) => a + b, 0) / summary.totalCalls;
    if (night >= 0.4) return { id: 'night-owl', title: 'the night owl', evidence: `${percent(night)} of calls after 10pm` };
    if (morning >= 0.4) return { id: 'early-bird', title: 'the early bird', evidence: `${percent(morning)} of calls before 10am` };
    if (summary.longestStreakDays >= 14) return { id: 'streak-master', title: 'the streak master', evidence: `${summary.longestStreakDays} days in a row` };
    const regular = categories.filter(key => key !== 'other' && summary.tools[key] / summary.totalCalls >= 0.01).length;
    if (regular >= 6) return { id: 'tool-master', title: 'the tool master', evidence: `${regular} tool categories used` };
  }
  return { id: 'neutral', title: 'your time with agents', evidence: `${summary.activeDays} active ${summary.activeDays === 1 ? 'day' : 'days'}` };
}

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
  if (!count(summary.activeDays) || summary.activeDays < 1 || summary.activeDays > summary.totalCalls ||
    summary.activeDays > dayOrdinal(summary.period.to) - dayOrdinal(summary.period.from) + 1 ||
    !count(summary.longestStreakDays) || summary.longestStreakDays < 1 || summary.longestStreakDays > summary.activeDays ||
    !Array.isArray(summary.months)) return fail();
  const expectedMonths = calendarMonths(summary.period.from, summary.period.to);
  if (summary.months.length !== expectedMonths.length) return fail();
  const totals = { claude: 0, codex: 0 };
  for (let i = 0; i < expectedMonths.length; i++) {
    const entry = summary.months[i];
    if (!object(entry) || entry.month !== expectedMonths[i] || !object(entry.sources) ||
      !agents.every(agent => count(entry.sources[agent.id]))) return fail();
    for (const agent of agents) totals[agent.id] += entry.sources[agent.id];
  }
  if (!agents.every(agent => totals[agent.id] === summary.sources[agent.id])) return fail();
  const lineup = agents.map(agent => ({ ...agent, calls: summary.sources[agent.id],
    count: formatCount(summary.sources[agent.id]), share: percent(summary.sources[agent.id] / summary.totalCalls),
  })).filter(agent => agent.calls > 0).sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id));
  const visibleMonths = summary.months.slice(-24);
  const timeline = visibleMonths.map(entry => {
    const total = sum(agents.map(agent => entry.sources[agent.id]));
    return {
      month: entry.month,
      label: `${dates.format(new Date(`${entry.month}-01T00:00:00Z`)).split(' ')[0]!.toLowerCase()}${summary.period.from.slice(0, 4) !== summary.period.to.slice(0, 4) ? ` '${entry.month.slice(2, 4)}` : ''}`,
      empty: total === 0,
      segments: agents.map(agent => ({ id: agent.id, color: agent.color, ratio: total ? entry.sources[agent.id] / total : 0 })),
    };
  });
  return {
    period: `${dateLabel(summary.period.from)} — ${dateLabel(summary.period.to)}`,
    timezone, total: formatCount(summary.totalCalls), files: formatCount(summary.observedFiles),
    activeDays: formatCount(summary.activeDays), archetype: archetype(summary), lineup, timeline,
    timelineNote: summary.months.length > 24 ? `latest 24 months: ${visibleMonths[0]!.month} — ${visibleMonths.at(-1)!.month}` : '',
  };
}
