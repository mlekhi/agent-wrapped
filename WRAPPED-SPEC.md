# wrapped v1 poster structure

status: integration spec; this pr changes documentation only. the png renderer is being developed in [pr #2](https://github.com/mlekhi/agent-wrapped/pull/2). this document defines the next content structure for that renderer, not functionality already available.

## intent

one shareable image about your coding-agent habits across all supported agents. familiar archetype names supply personality; the agent lineup and monthly mix supply the cross-agent story. v1 supports claude code and codex. adding other agents later must not require inventing a different poster structure.

## image structure

retain the fixed 1200 × 1500 portrait, dark background, bold accent, bundled local font, and lowercase copy. arrange these sections from top to bottom:

1. **header:** “your agent wrapped”, selected date range, and included agents.
2. **archetype:** one familiar name and one short, numeric explanation drawn from activity across all included agents. this is the main headline.
3. **three big stats:** total tool calls, active days, and observed files.
4. **agent lineup:** used agents ranked by tool calls, showing each agent's name, count, and share of total calls.
5. **agent-mix timeline:** monthly 100% stacked bars showing each agent's share of calls within that month. use stable colors per agent and a text legend shared with the lineup.
6. **footer:** local timezone, “observed files = unique files referenced by supported file tools”, and “agent shares reflect tool calls, not time or productivity”.

this replaces the earlier standalone tool ranking and 24-hour chart in the target v1 composition. retain their aggregate data for archetype selection. exact spacing, typography, colors, and any icons belong to the png implementation; no downloaded assets or system emoji fonts are required.

## archetypes

use fixed labels and fixed explanation templates, never generated personality text. these are initial product rules, not claims about productivity or intent. evaluate only when there are at least 100 calls across at least 7 active days. otherwise use the neutral headline “your year with coding agents” and explanation “{active days} active days”. for a period crossing calendar years, use “your time with coding agents”.

| priority | name | qualifying rule | explanation |
| --- | --- | --- | --- |
| 1 | the night owl | at least 40% of all calls occur from 22:00 inclusive to 05:00 exclusive | “{share}% of your tool calls happened between 10pm and 5am” |
| 2 | the early bird | at least 40% of all calls occur from 05:00 inclusive to 10:00 exclusive | “{share}% of your tool calls happened between 5am and 10am” |
| 3 | the streak master | longest consecutive run is at least 14 active calendar days | “you used coding agents {streak} days in a row” |
| 4 | the tool master | at least 6 of the 7 known tool categories each represent at least 1% of all calls | “you used {qualifying categories} tool categories regularly” |

select the first qualifying rule in priority order; show exactly one archetype. if none qualify, use the neutral headline above. use unrounded fractions to qualify and round displayed percentages to one decimal place, omitting trailing .0. the known categories are read, write, edit, shell, search, web, and agent; other contributes to the denominator but never counts toward tool master. all hours use the summary's local timezone.

builder, bug hunter, and marathoner are deferred: current tool records do not establish new-feature intent, bug-fixing intent, or focused elapsed time. no agent-specific personality names in v1.

## metric definitions and edge cases

- every metric uses the same selected, timestamp-valid, deduplicated tool events as the existing summary. retain the existing deduplication and observed-file identity rules.
- an active day is a distinct local calendar date with at least one counted call, across all agents. two agents used on the same day still count as one active day.
- the longest streak counts consecutive local calendar dates within the selected period. missing days break it; use calendar arithmetic rather than elapsed 24-hour durations so daylight-saving changes do not break a streak.
- observed files remain distinct recognized file references, including attempted operations, rather than confirmed file edits. do not infer file effects from shell text.
- lineup shares use total calls as the denominator. omit agents with zero calls. sort by descending count, then fixed source id for ties. show percentages to one decimal place; rounding may mean displayed shares do not total exactly 100%.
- timeline buckets use local calendar months, in chronological order, including zero-activity months within the selected range. partial boundary months contain only selected events. label months with the year when the range crosses years.
- each nonempty monthly bar totals 100% using exact counts for segment geometry. zero-activity months show an empty track labeled “no activity”; never imply an even split. the timeline shows composition, not volume.
- a single agent still gets a lineup and timeline, with 100% for every active month. a single selected month produces one bar. for more than 12 months, wrap into rows of at most 12; for more than 24 months, show the latest 24 intersecting months and explicitly label that narrower timeline range. headline stats and lineup still cover the full selected period.
- no usable activity retains the existing error behavior; do not produce an empty poster.

## integration contract

keep collection, display projection, and png rendering separate. extend the existing aggregate summary before adopting this composition; the current summary cannot supply active days, streaks, or month-by-agent counts.

| aggregate field | definition | availability |
| --- | --- | --- |
| period, timezone | selected dates and local timezone | existing |
| totalCalls, observedFiles | existing total and unique referenced-file count | existing |
| sources | fixed source id → counted calls | existing |
| tools, hours | category counts and 24 local-hour counts across agents | existing |
| activeDays | distinct counted local dates | new nonnegative integer |
| longestStreakDays | longest consecutive run of counted local dates | new nonnegative integer |
| months | ordered entries with month in yyyy-mm form and sources mapping every supported source id to its monthly count | new aggregate array |

collect all months in the selected period; apply the 24-month display limit only in the display projection. monthly totals per source must reconcile to the corresponding full-period source total. source, tool, and hour totals must each reconcile to totalCalls. activeDays must be no larger than totalCalls or the selected calendar-day count; longestStreakDays must be between 1 and activeDays for nonempty activity. all counts must be safe nonnegative integers.

the display projection returns only fixed labels, validated dates/timezone, formatted counts, a selected archetype id with numeric evidence, lineup entries, and timeline segments. preserve the existing renderer's validation and privacy boundary. resolve agent names and colors from an explicit supported-source registry, never from arbitrary log labels. extend that registry when implementing an additional adapter; this spec does not add agent support.

the png work can land independently with its current input. integrate this spec in a follow-up by adding the new aggregates, projecting this structure, then replacing the poster sections. do not silently substitute zero for missing new fields or fabricate a timeline from full-period counts. existing callers of the current rendering api remain on its current composition until an explicit versioned input or coordinated api migration is implemented and documented.

## integration acceptance checks

- synthetic multi-agent activity produces the section order and all three stats above; one-agent, sparse, zero-month, tied-lineup, and multi-year cases remain readable.
- fixtures exercise exact archetype thresholds, insufficient data, multiple qualifying rules, other-category exclusion, and the neutral fallback.
- date fixtures exercise deduplication across metrics, same-day activity across agents, month boundaries, partial months, and streaks spanning daylight-saving changes.
- monthly counts reconcile with source totals before timeline truncation; timeline labels disclose any truncation.
- render at 1200 × 1500 using bundled assets offline. inspect long ranges and large numbers for overflow. retain existing png validation and privacy checks.
- no prompts, responses, commands, code, paths, project names, usernames, raw tool names, or session ids enter display data or the image. no model calls, uploads, or telemetry.
