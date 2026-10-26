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

currently the parsing api only; the poster and cli are coming next. development requires node 22+:

```sh
npm ci
npm test
npm run build
```

planned cli (not available yet):

```sh
agent-wrapped                         # both agents, current year → wrapped.png
agent-wrapped 2025
agent-wrapped --source claude
agent-wrapped --save my-poster.png
```
