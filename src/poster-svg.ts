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
    return text(x, 482, stat.value, Math.min(68, 440 / stat.value.length), i === 0 ? color.coral : color.paper, 700) +
      text(x, 528, stat.label, 25, color.muted);
  }).join('');
  let splitOffset = 0;
  const split = model.lineup.map(agent => {
    const width = 1072 * agent.calls / summary.totalCalls;
    const rect = `<rect x="${64 + splitOffset}" y="642" width="${width}" height="72" fill="${agent.color}"/>`;
    splitOffset += width;
    return rect;
  }).join('');
  // split labels are also the color key for the monthly bars below.
  const splitLabels = model.lineup.map((agent, index) =>
    text(index === 0 ? 64 : 1136, 754, `${agent.label} ${agent.share}`, 26, agent.color, 700,
      `text-anchor="${index === 0 ? 'start' : 'end'}" data-agent="${agent.id}"`)).join('');
  const timeline = model.timeline.map((month, index) => {
    const columns = Math.min(model.timeline.length, 12);
    const columnWidth = 1072 / columns;
    const barHeight = model.timeline.length > 12 ? 190 : 400;
    const x = 64 + (index % 12) * columnWidth;
    const y = 842 + Math.floor(index / 12) * (barHeight + 57);
    const width = columnWidth - 12;
    let offset = 0;
    const segments = month.segments.map(segment => {
      const height = segment.ratio * barHeight;
      const rect = `<rect x="${x}" y="${y + offset}" width="${width}" height="${height}" fill="${segment.color}"/>`;
      offset += height;
      return rect;
    }).join('');
    const frame = month.empty
      ? `<rect x="${x}" y="${y + barHeight - 2}" width="${width}" height="2" fill="${color.track}"/>`
      : `<rect x="${x}" y="${y}" width="${width}" height="${barHeight}" fill="${color.track}"/>${segments}`;
    return `<g data-month="${month.month}">${frame}
      ${text(x + width / 2, y + barHeight + 31, month.label, 18, color.muted, 400, 'text-anchor="middle"')}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
    <rect width="1200" height="1500" fill="${color.ink}"/>
    <defs><clipPath id="split"><rect x="64" y="642" width="1072" height="72" rx="14"/></clipPath></defs>
    <g font-family="IBM Plex Sans">
      ${text(64, 70, 'agent wrapped', 38, color.lavender, 700)}
      ${text(64, 114, model.period, 25, color.muted)}
      ${text(58, 262, model.archetype.title, model.archetype.id === 'neutral' ? 85 : 99, color.paper, 700)}
      ${text(64, 322, model.archetype.evidence, 29, color.muted)}
      <rect x="64" y="382" width="1072" height="180" rx="18" fill="${color.track}"/>${stats}
      <g clip-path="url(#split)">${split}</g>${splitLabels}
      ${model.timelineNote ? text(1136, 806, model.timelineNote, 21, color.muted, 400, 'text-anchor="end"') : ''}
      ${timeline}
      ${text(64, 1382, model.timezone, 21, color.muted)}
      ${text(64, 1418, 'observed files = unique file references, including attempted operations.', 21, color.muted)}
    </g>
  </svg>`;
}
