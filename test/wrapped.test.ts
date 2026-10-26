import assert from 'node:assert/strict';
import { test } from 'node:test';
import { posterModel } from '../src/poster-model.js';
import { renderPosterSvg } from '../src/poster-svg.js';
import { posterFixture } from './poster-fixture.js';

function wrappedFixture() {
  const summary = posterFixture();
  return Object.assign(summary, {
    activeDays: 30, longestStreakDays: 14,
    months: Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      sources: i === 0 ? { ...summary.sources } : { claude: 0, codex: 0 },
    })),
  });
}

test('projects and renders the cross-agent structure', () => {
  const summary = wrappedFixture();
  const svg = renderPosterSvg(summary);
  for (const label of ['the streak master', '14 days in a row', 'active days', 'your agents', 'your agent mix', 'no activity']) {
    assert.ok(svg.includes(label), label);
  }
  assert.ok(svg.indexOf('the streak master') < svg.indexOf('active days'));
  assert.ok(svg.indexOf('active days') < svg.indexOf('your agents'));
  assert.equal((svg.match(/data-month=/g) ?? []).length, 12);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('archetypes use combined activity and deterministic priority with a sparse fallback', () => {
  const summary = wrappedFixture();
  summary.hours = Array<number>(24).fill(0);
  summary.hours[23] = summary.totalCalls;
  const archetype = () => Reflect.get(posterModel(summary), 'archetype');
  assert.equal(archetype()?.id, 'night-owl');
  summary.hours[23] = 0; summary.hours[7] = summary.totalCalls;
  assert.equal(archetype()?.id, 'early-bird');
  summary.hours[7] = 0; summary.hours[12] = summary.totalCalls;
  assert.equal(archetype()?.id, 'streak-master');
  summary.longestStreakDays = 1;
  assert.equal(archetype()?.id, 'tool-master');
  summary.activeDays = 1;
  assert.equal(archetype()?.id, 'neutral');
});

test('rejects inconsistent or injected new aggregate fields', () => {
  for (const change of [
    { activeDays: 0 }, { activeDays: 366 }, { longestStreakDays: 31 },
    { months: [] }, { months: Array(12) }, { months: [{ month: 'secret', sources: { claude: 1, codex: 0 } }] },
  ]) {
    assert.throws(() => posterModel(Object.assign(wrappedFixture(), change)), { message: 'invalid usage summary' });
  }
  const summary = wrappedFixture();
  summary.months[0]!.sources.claude++;
  assert.throws(() => posterModel(summary), { message: 'invalid usage summary' });
});
