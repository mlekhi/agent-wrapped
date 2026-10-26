import type { UsageSummary } from '../src/types.js';

/** entirely synthetic; not derived from a user's session logs. */
export function posterFixture(): UsageSummary {
  const hours = [120, 80, 40, 20, 10, 20, 90, 220, 520, 800, 1040, 860,
    760, 940, 1080, 1200, 1120, 940, 620, 480, 420, 380, 260, 160];
  const totalCalls = hours.reduce((sum, count) => sum + count, 0);
  return {
    period: { from: '2026-01-01', to: '2026-12-31' }, timezone: 'America/Toronto',
    totalCalls, observedFiles: 386,
    tools: { read: 4200, edit: 3100, shell: 2200, search: 1200, write: 800, web: 300, agent: 200, other: totalCalls - 12000 },
    sources: { claude: 8200, codex: totalCalls - 8200 }, hours,
    diagnostics: { filesRead: 42, malformedRecords: 0, ignoredRecords: 75, duplicateCalls: 4, oversizedRecords: 0 },
  };
}
