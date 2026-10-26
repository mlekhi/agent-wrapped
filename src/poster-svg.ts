import { posterModel } from './poster-model.js';
import type { UsageSummary } from './types.js';

const color = { ink: '#211638', paper: '#f7f2ff', lavender: '#c2a0ff', coral: '#ff947c', muted: '#b8accb', track: '#3a2a55' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const text = (x: number, y: number, value: string, size: number, fill = color.paper, weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${escape(value)}</text>`;
const icon = (name: string, path: string, x: number, y: number, size: number, stroke: string) =>
  `<g data-icon="${name}" transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</g>`;

const archetypeIcons: Record<string, string> = {
  'night-owl': '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  'early-bird': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'streak-master': '<path d="M12 2c1 4-3 5.5-3 9a3 3 0 0 0 6 0c0-1-.3-2-1-3 3 1.5 5 4.3 5 7a7 7 0 0 1-14 0c0-5 4-8.5 7-13z"/>',
  'tool-master': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  neutral: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
};
const statIcons = [
  '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
];

/** fixed svg template: no caller-provided markup, fonts, urls, or labels. */
export function renderPosterSvg(summary: UsageSummary): string {
  const model = posterModel(summary);
  const stats = [
    { value: model.total, label: 'tool calls' },
    { value: model.activeDays, label: 'active days' },
    { value: model.files, label: 'observed files' },
  ].map((stat, i) => {
    const x = 88 + i * 356;
    return icon(`stat-${i}`, statIcons[i]!, x, 590, 18, color.muted) +
      text(x, 566, stat.value, Math.min(68, 440 / stat.value.length), i === 0 ? color.coral : color.paper, 700) +
      text(x + 26, 612, stat.label, 25, color.muted);
  }).join('');
  // these labels are also the color key for the monthly bars.
  const legend = model.lineup.map((agent, index) =>
    text(index === 0 ? 64 : 1136, 722, `${agent.label} ${agent.share}`, 26, agent.color, 700,
      `text-anchor="${index === 0 ? 'start' : 'end'}" data-agent="${agent.id}"`)).join('');
  const timeline = model.timeline.map((month, index) => {
    const columns = Math.min(model.timeline.length, 12);
    const columnWidth = 1072 / columns;
    const barHeight = model.timeline.length > 12 ? 200 : 440;
    const x = 64 + (index % 12) * columnWidth;
    const y = 796 + Math.floor(index / 12) * (barHeight + 57);
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
    <g font-family="Space Grotesk">
      ${text(64, 70, 'agent wrapped', 38, color.lavender, 700)}
      ${text(64, 114, model.period, 25, color.muted)}
      <circle cx="104" cy="206" r="40" fill="${color.track}"/>
      ${icon('archetype', archetypeIcons[model.archetype.id] ?? archetypeIcons.neutral!, 77, 179, 54, color.coral)}
      ${text(64, 334, model.archetype.title, model.archetype.id === 'neutral' ? 78 : 92, color.paper, 700)}
      ${text(64, 394, model.archetype.evidence, 28, color.muted)}
      <rect x="64" y="464" width="1072" height="188" rx="18" fill="${color.track}"/>${stats}
      ${legend}
      ${model.timelineNote ? text(1136, 760, model.timelineNote, 21, color.muted, 400, 'text-anchor="end"') : ''}
      ${timeline}
      ${text(64, 1380, model.timezone, 21, color.muted)}
      ${text(64, 1416, 'observed files = unique file references, including attempted operations.', 21, color.muted)}
    </g>
  </svg>`;
}
