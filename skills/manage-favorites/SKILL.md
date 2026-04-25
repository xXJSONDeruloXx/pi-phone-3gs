---
name: manage-favorites
description: Add, remove, or list commands in the pi-phone-3gs favorites rail. Use when the user asks to add a skill, prompt, slash command, action key, raw input, or anything else to their phone favorites, or to remove or clear favorites.
---

# Manage pi-phone-3gs Favorites Rail

## What is the favorites rail?

The pi-phone-3gs extension shows a horizontally-scrollable strip of tap buttons at the bottom of the screen. Each button can do one of four things when tapped: send a slash command, perform a shell action, send raw terminal bytes, or send an editor-aware key sequence. This strip is populated from a user-owned JSON file. You can add, remove, or reorder entries by editing that file, then reloading the config — no restart required.

## Favorites file location

```
~/.pi/agent/pi-phone-3gs/phone-shell.favorites.json
```

Confirm the exact path at any time with `/phone-shell paths` — look for the `favorites:` line.

## File schema

The file is a JSON array of objects. Each object is one rail button with exactly **one** of `command`, `action`, or `data`:

```json
[
  { "label": "NEW",   "command": "/new",                  "palette": "warning" },
  { "label": "ESC",   "action": "sendEscape",             "palette": "warning" },
  { "label": "^C",    "data": "\u0003",                   "palette": "warning" },
  { "label": "/",     "action": "openSlash" },
  { "label": "↑",     "action": "arrowUp" },
  { "label": "↵",     "action": "sendEnter" },
  { "label": "CMPT",  "command": "/compact",              "palette": "warning" },
  { "label": "RLPH",  "command": "/skill:ralph-wiggum" },
  { "label": "CI",    "command": "/skill:ci-fix-watch" },
  { "label": "LTCH",  "command": "/skill:latchkey" }
]
```

### Fields

| Field       | Required                 | Description |
|-------------|--------------------------|-------------|
| `label`     | yes                      | Short text shown on the button. **Keep to 6 characters or fewer** — longer labels still work but may feel cramped. Uppercase looks best. Unicode arrows/symbols are fine. |
| `command`   | one of command/action/data | Full slash command sent when tapped. Must start with `/`. Any valid Pi command works. |
| `action`    | one of command/action/data | A named shell action. See the action reference below. |
| `data`      | one of command/action/data | Raw terminal bytes to inject, e.g. `"\u0003"` for ctrl+c, `"\u001b[A"` for arrow up. |
| `kind`      | no                       | Only used with `data`. `"input"` (default) sends raw bytes; `"editorKey"` sends bytes through the editor layer with optional clear/setText. |
| `clearFirst`| no                       | (editorKey only) Clear the editor before sending `data`. |
| `setText`   | no                       | (editorKey only) Set editor text before sending `data`. |
| `palette`   | no                       | `"accent"` (default, teal), `"warning"` (amber), or `"muted"` (dim). Use `"warning"` for destructive or session-changing buttons. |

### Action reference

These are the valid `action` values and what they do:

**Keys & input:**
| Action          | What it does                                    |
|-----------------|-------------------------------------------------|
| `sendEscape`    | Sends Escape (or aborts if agent is running)    |
| `sendInterrupt` | Sends ctrl+c (interrupt)                        |
| `sendEnter`     | Sends Enter/Return                              |
| `sendFollowUp`  | Sends the follow-up key (option+enter)          |
| `openSlash`     | Clears the editor and types `/`                 |
| `arrowLeft`     | Sends ←                                         |
| `arrowUp`       | Sends ↑                                         |
| `arrowDown`     | Sends ↓                                         |
| `arrowRight`    | Sends →                                         |

**Scroll & navigation:**
| Action          | What it does                                    |
|-----------------|-------------------------------------------------|
| `scrollTop`     | Scrolls the viewport to the top                 |
| `pageUp`        | Scrolls the viewport up one page                |
| `pageDown`      | Scrolls the viewport down one page              |
| `scrollBottom`  | Scrolls the viewport to the bottom              |

**Toggles & menus:**
| Action                       | What it does                               |
|------------------------------|--------------------------------------------|
| `toggleUtilities`            | Opens/closes the utility overlay           |
| `toggleViewMenu`             | Opens/closes the view menu                 |
| `toggleSkillsMenu`           | Opens/closes the skills menu               |
| `toggleBottomBar`            | Shows/hides the favorites rail itself      |
| `toggleEditorPosition`       | Switches editor between top and bottom     |
| `toggleNavPad`               | Shows/hides the arrow/nav key pad          |
| `toggleViewportJumpButtons`  | Shows/hides viewport jump buttons          |
| `toggleTopEditorSendButton`  | Shows/hides the top editor send button     |
| `toggleTopEditorStashButton` | Shows/hides the top editor stash button    |

**Other:**
| Action              | What it does                                  |
|---------------------|-----------------------------------------------|
| `selectModel`       | Opens the model selection overlay             |
| `cycleThinkingLevel`| Cycles through thinking levels                |
| `stashEditor`       | Stashes the current editor content            |

### Common raw `data` values

For buttons using `data` instead of `action`:

| Label | data          | What it sends   |
|-------|---------------|-----------------|
| `^C`  | `"\u0003"`    | ctrl+c (interrupt) |
| `Tab` | `"\t"`        | Tab             |
| `BS`  | `"\u007f"`    | Backspace       |
| `↑`   | `"\u001b[A"`  | Arrow up (raw)  |
| `↓`   | `"\u001b[B"`  | Arrow down (raw)|
| `←`   | `"\u001b[D"`  | Arrow left (raw)|
| `→`   | `"\u001b[C"`  | Arrow right (raw)|

**Prefer `action` over `data` when an action exists** — actions have built-in smart behavior (e.g. `sendEscape` aborts when agent is running). Use `data` only when no action covers what you need.

## Deriving a short label

When the user doesn't specify a label, derive one:

1. Strip the leading `/`
2. Strip the `skill:` prefix if present
3. Take the first 4–5 meaningful characters, uppercase
4. For keys and arrows, use the natural symbol: `ESC`, `/`, `↑`, `↓`, `←`, `→`, `↵`, `^C`
5. Avoid generic abbreviations — prefer something recognizable

Examples:
- `/skill:ralph-wiggum` → `RLPH` or `RALPH`
- `/skill:ci-fix-watch` → `CI`
- `/skill:latchkey` → `LTCH`
- `/compact` → `CMPT`
- `/new` → `NEW`
- `/resume` → `RSME`
- `/skill:gamenative-discord-research` → `GN-D` or `DISC`
- action `sendEscape` → `ESC`
- action `openSlash` → `/`
- action `sendEnter` → `↵`
- action `arrowUp` → `↑`
- action `sendInterrupt` → `^C`

## What commands can be added

Anything that works as a slash command in Pi:

- **Built-ins**: `/new`, `/compact`, `/reload`, `/resume`, `/tree`
- **Model switching**: `/model <provider/id>` — e.g. `/model zai/glm-5.1`, `/model github-copilot/claude-sonnet-4.6`
- **Skills**: `/skill:<name>` — use `pi.getCommands()` or look at installed packages
- **Prompt templates**: `/<template-name>`
- **Extension commands**: e.g. `/phone-shell`, `/touch`

Plus any **action** or **raw key** as described above.

## Interpreting natural language requests

When the user asks to add something to favorites in casual language, map it to the right type:

| User says                              | Add this                                                       |
|----------------------------------------|----------------------------------------------------------------|
| "add escape" / "the escape key"        | `{ "label": "ESC", "action": "sendEscape", "palette": "warning" }` |
| "add a slash key" / "the slash button" | `{ "label": "/", "action": "openSlash" }`                     |
| "add enter" / "return key"             | `{ "label": "↵", "action": "sendEnter" }`                     |
| "add the arrow keys" / "arrow buttons" | Add all four: ↑↓←→ as `arrowUp`, `arrowDown`, `arrowLeft`, `arrowRight` |
| "add ctrl+c" / "interrupt"             | `{ "label": "^C", "action": "sendInterrupt", "palette": "warning" }` or `{ "label": "^C", "data": "\u0003", "palette": "warning" }` |
| "add compact"                          | `{ "label": "CMPT", "command": "/compact", "palette": "warning" }` |
| "add [any slash command]"              | `{ "label": "<derived>", "command": "/<the-command>" }`        |
| "add [skill name] skill"               | `{ "label": "<derived>", "command": "/skill:<name>" }`         |
| "add scroll to top" / "scroll top"     | `{ "label": "TOP", "action": "scrollTop" }`                    |
| "add page down"                        | `{ "label": "PG↓", "action": "pageDown" }`                     |
| "add model picker" / "model selector"  | `{ "label": "MODEL", "action": "selectModel" }`               |
| "add a tab key"                        | `{ "label": "TAB", "data": "\t" }`                             |

When in doubt, prefer `action` over `data`, and `command` for anything that's a slash command.

## Workflow

### Add one or more favorites

1. Read the current file (if it doesn't exist, start with `[]`)
2. Append the new entry or entries
3. Write the updated array back to the file
4. Run `/phone-shell reload-config` — the rail updates immediately, no restart needed
5. Confirm to the user what was added

### Remove a favorite

1. Read the current file
2. Filter out entries where `label`, `command`, or `action` matches what the user asked to remove
3. Write the updated array back
4. Run `/phone-shell reload-config`

### Reorder favorites

1. Read the current file
2. Re-sort or move entries as requested
3. Write back and reload

### Clear all favorites

1. Write `[]` to the file
2. Run `/phone-shell reload-config`

### List current favorites

1. Read the file
2. Format as a readable list showing label, type (command/action/data), and value — no reload needed

## Getting a favorites template

Run `/phone-shell favorites-template` to paste a starter template into the editor. The user can edit it directly and save it to the favorites path.

## Example exchanges

**User:** "add the latchkey skill to my favorites"
→ Append `{ "label": "LTCH", "command": "/skill:latchkey" }`, write, reload.

**User:** "add escape and the arrow keys to favorites"
→ Append 5 entries: ESC (sendEscape, warning), ↑ (arrowUp), ↓ (arrowDown), ← (arrowLeft), → (arrowRight), write, reload.

**User:** "add compact to favorites with a warning color"
→ Append `{ "label": "CMPT", "command": "/compact", "palette": "warning" }`, write, reload.

**User:** "remove ralph from my favorites"
→ Filter out entries where command is `/skill:ralph-wiggum` (or matches "ralph"), write, reload.

**User:** "what's in my favorites?"
→ Read file, list each entry with its label, type, and value.

**User:** "clear my favorites"
→ Write `[]`, reload.
