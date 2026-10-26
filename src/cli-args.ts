import { isCalendarDay } from './dates.js';
import type { Source } from './types.js';

export interface CliOptions {
  year?: number;
  source?: Source | 'all';
  save?: string;
  from?: string;
  to?: string;
  claudeDir?: string;
  codexDir?: string;
}

export interface ParsedArgs { help: boolean; options: CliOptions; }

export const defaultSavePath = 'wrapped.png';

export const helpText = [
  'usage: agent-wrapped [year] [options]',
  '',
  'render a local wrapped.png poster from coding agent session logs.',
  '',
  'options:',
  '  --source <all|claude|codex>   include sources (default: all)',
  '  --save <path>                 write the poster to this path (default: wrapped.png)',
  '  --from <YYYY-MM-DD>           include activity from this date',
  '  --to <YYYY-MM-DD>             include activity through this date',
  '  --claude-dir <path>           override the claude session root',
  '  --codex-dir <path>            override the codex session root',
  '  --help                        show this help',
  '',
  'arguments:',
  '  [year]                        calendar year to summarize (default: current year)',
  '',
  'examples:',
  '  agent-wrapped',
  '  agent-wrapped 2025',
  '  agent-wrapped --source claude',
  '  agent-wrapped --save my-poster.png',
  '',
  'the poster shows tool calls, observed files, and busiest hours.',
  'logs stay local and are never uploaded, executed, or stored.',
].join('\n');

const valueOptions = new Set(['--source', '--save', '--from', '--to', '--claude-dir', '--codex-dir']);
const sourceValues = new Set(['all', 'claude', 'codex']);

/** strict parse: no unknown, repeated, or incomplete options; fixed errors only. */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const values = new Map<string, string>();
  const seen = new Set<string>();
  const positional: string[] = [];
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--help') { help = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    if (!valueOptions.has(arg)) throw new Error('invalid arguments');
    const value = args[++index];
    if (value === undefined || seen.has(arg)) throw new Error('invalid arguments');
    seen.add(arg);
    values.set(arg, value);
  }
  const options: CliOptions = {};
  if (help) return { help: true, options };
  if (positional.length > 1) throw new Error('invalid arguments');
  if (positional.length === 1) {
    const year = Number(positional[0]!);
    if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('invalid date selection');
    options.year = year;
  }
  const source = values.get('--source');
  if (source !== undefined) {
    if (!sourceValues.has(source)) throw new Error('invalid source selection');
    options.source = source as Source | 'all';
  }
  const save = values.get('--save');
  if (save !== undefined) {
    if (save.length === 0) throw new Error('invalid arguments');
    options.save = save;
  }
  const from = values.get('--from');
  const to = values.get('--to');
  if (from !== undefined || to !== undefined) {
    if (options.year !== undefined) throw new Error('invalid date selection');
    if (!isCalendarDay(from ?? '') || !isCalendarDay(to ?? '') ||
      (from !== undefined && to !== undefined && from > to)) throw new Error('invalid date selection');
    if (from !== undefined) options.from = from;
    if (to !== undefined) options.to = to;
  }
  for (const name of ['--claude-dir', '--codex-dir'] as const) {
    const value = values.get(name);
    if (value === undefined) continue;
    if (value.length === 0) throw new Error('invalid arguments');
    if (name === '--claude-dir') options.claudeDir = value;
    else options.codexDir = value;
  }
  return { help: false, options };
}
