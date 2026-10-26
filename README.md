# agent-wrapped

local-only coding agent usage summaries: tool calls, observed files, and busiest hours. no model calls, telemetry, or uploads; summaries exclude transcript text and file paths.

## supported sessions

- claude code: jsonl logs in `~/.claude/projects` (`assistant` tool-use blocks).
- codex: jsonl logs in `~/.codex/sessions` (`response_item` function, custom, and native tool calls).

## recognized tool calls

| source | tools |
| --- | --- |
| claude code | `Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Task`, `Agent` |
| codex | `exec_command`, `shell`, `shell_command`, `write_stdin`, `apply_patch`, `view_image`, `spawn_agent`, `send_input`; native web search, local shell, tool search, and image generation |

unknown tools and native image generation count as `other`. file counts cover explicit file references and patch headers, including attempted operations. shell commands are never executed or inspected for file effects; nested calls inside code wrappers are not inferred.

## commands

parsing and png rendering are available as apis; the cli is coming next. development requires node 22+:

```sh
npm ci
npm test
npm run build
```

render locally after building:

```js
import { writeFile } from 'node:fs/promises';
import { collectUsage } from './dist/src/index.js';
import { renderPoster } from './dist/src/poster.js';

const png = await renderPoster(await collectUsage());
await writeFile('wrapped.png', png, { flag: 'wx' });
```

outputs a 1200 × 1500 png with bundled ibm plex sans fonts ([license](assets/fonts/license.txt)). no browser, system fonts, or runtime downloads. large counts use compact notation; tied busiest hours are highlighted together. rendering uses the native `@resvg/resvg-js` package.

planned cli (not available yet):

```sh
agent-wrapped                         # both agents, current year → wrapped.png
agent-wrapped 2025
agent-wrapped --source claude
agent-wrapped --save my-poster.png
```
