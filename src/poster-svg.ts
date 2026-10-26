import { posterModel } from './poster-model.js';
import type { UsageSummary } from './types.js';

const color = { ink: '#211638', paper: '#f7f2ff', lavender: '#c2a0ff', coral: '#ff947c', muted: '#b8accb', track: '#3a2a55' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const text = (x: number, y: number, value: string, size: number, fill = color.paper, weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${escape(value)}</text>`;

/** fixed svg template: no caller-provided markup, fonts, urls, or labels. */
export function renderPosterSvg(summary: UsageSummary): string {
  const model = posterModel(summary);
  const stats = [
    { value: model.total, label: 'tool calls' },
    { value: model.activeDays, label: 'active days' },
    { value: model.files, label: 'observed files' },
  ].map((stat, i) => {
    const x = 88 + i * 356;
    return text(x, 559, stat.value, Math.min(68, 440 / stat.value.length), i === 0 ? color.coral : color.paper, 700) + text(x, 605, stat.label, 25, color.muted);
  }).join('');
  const lineup = model.lineup.map((agent, index) => {
    const y = 754 + index * 97;
    return `${text(64, y, `0${index + 1}`, 25, color.muted)}
      ${text(120, y, agent.label, 32, agent.color, 700)}
      ${text(1136, y, `${agent.count} calls · ${agent.share}`, 27, color.paper, 400, 'text-anchor="end"')}
      <rect x="120" y="${y + 19}" width="1016" height="12" rx="6" fill="${color.track}"/>
      <rect x="120" y="${y + 19}" width="${1016 * agent.calls / summary.totalCalls}" height="12" rx="6" fill="${agent.color}"/>`;
  }).join('');
  const timeline = model.timeline.map((month, index) => {
    const columns = Math.min(model.timeline.length, 12);
    const columnWidth = 1072 / columns;
    const barHeight = model.timeline.length > 12 ? 88 : 220;
    const x = 64 + (index % 12) * columnWidth;
    const y = 1025 + Math.floor(index / 12) * (barHeight + 57);
    const width = columnWidth - 12;
    let offset = 0;
    const segments = month.segments.map(segment => {
      const height = segment.ratio * barHeight;
      const rect = `<rect x="${x}" y="${y + offset}" width="${width}" height="${height}" fill="${segment.color}"/>`;
      offset += height;
      return rect;
    }).join('');
    return `<g data-month="${month.month}"><rect x="${x}" y="${y}" width="${width}" height="${barHeight}" fill="${color.track}"/>${segments}
      ${text(x + width / 2, y + barHeight + 31, month.label, 18, color.muted, 400, 'text-anchor="middle"')}</g>`;
  }).join('');
  const legend = model.lineup.map((agent, index) => {
    const x = 64 + index * 260;
    return `<g data-legend="${agent.id}"><circle cx="${x + 6}" cy="984" r="7" fill="${agent.color}"/>${text(x + 22, 991, agent.label, 23, color.muted)}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
    <rect width="1200" height="1500" fill="${color.ink}"/>
    <g font-family="IBM Plex Sans">
      ${text(64, 70, 'agent wrapped', 38, color.lavender, 700)}
      ${text(64, 114, model.period, 25, color.muted)}
      ${text(64, 218, 'your coding personality', 24, color.coral)}
      ${text(58, 323, model.archetype.title, model.archetype.id === 'neutral' ? 85 : 99, color.paper, 700)}
      ${text(64, 383, model.archetype.evidence, 29, color.muted)}
      <rect x="64" y="458" width="1072" height="180" rx="18" fill="${color.track}"/>${stats}
      ${text(64, 699, 'your agents', 34, color.paper, 700)}${lineup}
      ${text(64, 938, 'your agent mix', 34, color.paper, 700)}
      ${text(1136, 938, model.timelineNote, 21, color.muted, 400, 'text-anchor="end"')}
      ${legend}${timeline}
      ${model.timeline.some(month => month.empty) ? text(64, 1330, 'empty bars = no activity', 21, color.muted) : ''}
      ${text(64, 1380, model.timezone, 21, color.muted)}
      ${text(64, 1415, 'observed files = unique file references, including attempted operations.', 21, color.muted)}
      ${text(64, 1450, 'agent shares reflect tool calls, not time or productivity.', 21, color.muted)}
    </g>
  </svg>`;
}
