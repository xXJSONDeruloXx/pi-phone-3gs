---
name: manage-favorites
description: Add, remove, or list commands in the pi-phone-3gs favorites rail. Use when the user asks to add a skill, prompt, slash command, or anything else to their phone favorites, or to remove or clear favorites.
---

# Manage pi-phone-3gs Favorites Rail

## What is the favorites rail?

The pi-phone-3gs extension shows a horizontally-scrollable strip of tap buttons at the bottom of the screen. Each button sends a slash command when tapped. This strip is populated from a user-owned JSON file called **favorites**. You can add, remove, or reorder entries by editing that file, then reloading the config — no restart required.

## Favorites file location

```
~/.pi/agent/pi-phone-3gs/phone-shell.favorites.json
```

Confirm the exact path at any time with `/phone-shell paths` — look for the `favorites:` line.

## File schema

The file is a JSON array of objects. Each object is one rail button:

```json
[
  { "label": "NEW",  "command": "/new",                  "palette": "warning" },
  { "label": "CMPT", "command": "/compact",              "palette": "warning" },
  { "label": "RLPH", "command": "/skill:ralph-wiggum" },
  { "label": "CI",   "command": "/skill:ci-fix-watch"  },
  { "label": "LTCH", "command": "/skill:latchkey"       }
]
```

### Fields

| Field     | Required | Description |
|-----------|----------|-------------|
| `label`   | yes      | Short text shown on the button. **Keep to 6 characters or fewer** — longer labels still work but may feel cramped. Uppercase looks best. |
| `command` | yes      | The full slash command sent when tapped. Must start with `/`. Any valid Pi command works: builtins, skills, prompts, extension commands. |
| `palette` | no       | `"accent"` (default, teal), `"warning"` (amber), or `"muted"` (dim). Use `"warning"` for destructive or session-changing commands like `/new` and `/compact`. |

## Deriving a short label

When the user doesn't specify a label, derive one:

1. Strip the leading `/`
2. Strip the `skill:` prefix if present
3. Take the first 4–5 meaningful characters, uppercase
4. Avoid generic abbreviations — prefer something recognizable

Examples:
- `/skill:ralph-wiggum` → `RLPH` or `RALPH`
- `/skill:ci-fix-watch` → `CI`
- `/skill:latchkey` → `LTCH`
- `/compact` → `CMPT`
- `/new` → `NEW`
- `/resume` → `RSME`
- `/skill:gamenative-discord-research` → `GN-D` or `DISC`

## What commands can be added

Anything that works as a slash command in Pi:

- **Built-ins**: `/new`, `/compact`, `/reload`, `/resume`, `/tree`
- **Skills**: `/skill:<name>` — use `pi.getCommands()` or look at installed packages
- **Prompt templates**: `/<template-name>`
- **Extension commands**: e.g. `/phone-shell`, `/touch`

If the user is unsure what's available, suggest they type `/` in the editor to browse the dropdown, then come back and tell you what they want added.

## Workflow

### Add one or more favorites

1. Read the current file (if it doesn't exist, start with `[]`)
2. Append the new entry or entries
3. Write the updated array back to the file
4. Run `/phone-shell reload-config` — the rail updates immediately, no restart needed
5. Confirm to the user what was added

### Remove a favorite

1. Read the current file
2. Filter out entries where `command` matches what the user asked to remove
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
2. Format as a readable list for the user — no reload needed

## Getting a favorites template

Run `/phone-shell favorites-template` to paste a starter template into the editor. The user can edit it directly and save it to the favorites path.

## Example exchanges

**User:** "add the latchkey skill to my favorites"
→ Read file, append `{ "label": "LTCH", "command": "/skill:latchkey" }`, write, reload.

**User:** "add compact to favorites with a warning color"
→ Append `{ "label": "CMPT", "command": "/compact", "palette": "warning" }`, write, reload.

**User:** "remove ralph from my favorites"
→ Filter out entries where command is `/skill:ralph-wiggum` (or matches "ralph"), write, reload.

**User:** "what's in my favorites?"
→ Read file, list the entries with their labels and commands.

**User:** "clear my favorites"
→ Write `[]`, reload.
