import { formatCount, posterModel } from './poster-model.js';
import type { UsageSummary } from './types.js';

const color = { ink: '#211638', paper: '#f7f2ff', lavender: '#c2a0ff', coral: '#ff947c', muted: '#b8accb', track: '#3a2a55' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const text = (x: number, y: number, value: string, size: number, fill = color.paper, weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${escape(value)}</text>`;

/** fixed svg template: no caller-provided markup, fonts, urls, or labels. */
export function renderPosterSvg(summary: UsageSummary): string {
  const model = posterModel(summary);
  const rows = model.tools.map((tool, index) => {
    const y = 716 + index * 40;
    const width = Math.max(2, tool.count / model.tools[0]!.count * 660);
    return `${text(64, y, tool.label, 25)}
      <rect x="240" y="${y - 18}" width="660" height="14" rx="7" fill="${color.track}"/>
      <rect x="240" y="${y - 18}" width="${width}" height="14" rx="7" fill="${index === 0 ? color.coral : color.lavender}"/>
      ${text(1136, y, formatCount(tool.count), 25, color.paper, 400, 'text-anchor="end"')}`;
  }).join('');
  const bars = model.hours.map(({ hour, ratio, peak }) => {
    const height = ratio * 160;
    const x = 64 + hour * 45;
    return `<g data-hour="${hour}"><rect x="${x}" y="${1296 - Math.max(2, height)}" width="29" height="${Math.max(2, height)}" rx="3" fill="${ratio === 0 ? color.track : peak ? color.coral : color.lavender}"/></g>`;
  }).join('');
  const hourLabels = [0, 6, 12, 18, 23].map(hour => text(64 + hour * 45 + 14.5, 1330,
    String(hour).padStart(2, '0'), 21, color.muted, 400, 'text-anchor="middle"')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
    <rect width="1200" height="1500" fill="${color.ink}"/>
    <g font-family="IBM Plex Sans">
      ${text(64, 66, model.period, 25, color.muted)}
      ${text(58, 185, 'agent', 144, color.paper, 700)}
      ${text(58, 316, 'wrapped', 144, color.lavender, 700)}
      ${text(64, 370, model.sources, 27)}
      <rect x="64" y="410" width="1072" height="192" rx="18" fill="${color.track}"/>
      ${text(94, 519, model.total, 92, color.paper, 700)}
      ${text(94, 564, 'tool calls', 27, color.muted)}
      ${text(750, 514, model.files, model.files.length > 7 ? 60 : 76, color.coral, 700)}
      ${text(750, 564, 'observed files', 27, color.muted)}
      ${text(64, 664, 'your tools', 34, color.paper, 700)}
      ${text(1136, 664, 'calls', 23, color.muted, 400, 'text-anchor="end"')}
      ${rows}
      ${text(64, 1076, 'your busiest hours', 34, color.paper, 700)}
      ${text(1136, 1076, model.peak, 26, color.coral, 700, 'text-anchor="end"')}
      ${text(64, 1114, 'tool calls by local hour', 23, color.muted)}
      ${bars}${hourLabels}
      ${text(64, 1378, model.timezone, 22, color.muted)}
      ${text(64, 1435, 'observed files = referenced files, including attempted operations.', 21, color.muted)}
      ${text(64, 1470, 'made locally. shared by you.', 21, color.muted)}
    </g>
  </svg>`;
}
