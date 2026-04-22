# Research

This document captures the initial research pass behind the `pi-phone-3gs` concept.

## Research question

How do we build a **fully capable coding-agent harness for phone-based remote use** without falling into either of these traps?

1. reducing the system into a generic messaging bot
2. rebuilding the entire harness from scratch when Pi already provides strong primitives

## Inputs reviewed

### 1. Current repo seed

- Existing local `README.md` in this repo
- User-provided setup notes: home Mac mini, Jump Desktop, portrait display, phone-first use

### 2. Visual reference

- Screenshot copied into this repo at `docs/images/phone-touch-reference.png`

### 3. `pi-personal-package`

Repo reference:

- `https://github.com/xXJSONDeruloXx/pi-personal-package`

Reviewed locally from:

- `README.md`
- `package.json`
- `extensions/pi-touch.md`
- `extensions/pi-touch.ts`
- extension inventory in `extensions/`

Key findings from that package:

- it already acts as a curated personal Pi distro
- it bundles a useful capability stack instead of relying only on stock Pi
- it proves that significant TUI customization is possible without forking Pi core
- it already contains an experimental `pi-touch` extension aimed at phone / remote-desktop use

### 4. Pi / pi-mono docs

Public references:

- `https://github.com/badlogic/pi-mono`
- `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent`

Reviewed locally from installed docs:

- Pi `README.md`
- `docs/extensions.md`
- `docs/skills.md`
- `docs/tui.md`
- `badlogic/pi-mono` top-level `README.md`

### 5. GSD-2

Public reference:

- `https://github.com/gsd-build/gsd-2`

Reviewed from public GitHub docs:

- `README.md`
- `docs/dev/architecture.md`
- `docs/user-docs/auto-mode.md`

### 6. OpenClaw

Public reference:

- `https://github.com/openclaw/openclaw`

Reviewed from public GitHub docs:

- `README.md`
- `VISION.md`
- `docs/concepts/architecture.md`

## Findings

## A. The screenshot already demonstrates the right interaction direction

The screenshot shows a surprisingly strong shape for a phone-first terminal UI.

Observed traits:

- large rectangular touch targets
- top utility row for high-frequency slash commands
- explicit navigation controls for paging long chat histories
- a dedicated model-cycle button
- bottom-row arrow / enter / slash controls
- visible provider/quota widgets and current model information
- a prompt mirror / prompt area that keeps the typing surface legible
- a portrait layout that accepts narrow width as the default

Why this matters:

- it looks like a **tool console**, not just a terminal with bigger font
- it treats tap targets as first-class UI elements
- it accepts that the operator often needs to steer, inspect, page, and recover faster than they need free-form typing

## B. `pi-personal-package` is already the prototype lab for this project

The current personal package is more than just configuration. It is a practical proof that a Pi-based distro can be composed from local extensions plus bundled third-party packages.

### Especially relevant local assets

From the package README and extension inventory:

- `extensions/pi-touch.ts`
- `extensions/diff.ts`
- `extensions/upstream-master-diff-footer.ts`
- `extensions/provider-widget-controls.ts`
- provider usage widgets
- notifications / TTS

### Especially relevant bundled capabilities

From `package.json` descriptions and package selection:

- `@aliou/pi-processes` — background process management
- `@ifi/pi-extension-subagents` — richer subagent orchestration
- `@tmustier/pi-files-widget` — in-terminal file browser/viewer
- `@tmustier/pi-ralph-wiggum` — long-running loops
- `pi-codex-web-search` — web search through Codex CLI
- `pi-command-center` — command discovery widget
- `pi-continuous-learning` — learned instincts / reusable behaviors
- `pi-interactive-shell` — supervised delegation to other coding-agent CLIs
- `pi-tool-display` — compact tool rendering in the TUI
- `pi-computer-use` — macOS GUI computer use
- `pi-stash` — quick draft capture

### What `pi-touch` specifically proves

From `extensions/pi-touch.md` and the implementation:

- Pi can render custom widgets and overlays in the TUI
- mouse/tap hit-testing can drive custom controls
- the chat viewport can be wrapped in a custom scroll controller
- touch mode can persist across sessions
- the system can expose explicit escape hatches so a broken touch mode does not break startup
- layout groups and wrapped button rows can be computed dynamically for narrow widths

That is a big deal: it means the phone-first layer does **not** require a hard fork of Pi just to prove the concept.

## C. Pi is the right substrate because it is intentionally extensible

The Pi docs make the architecture explicit:

- extensions can register tools, commands, shortcuts, widgets, overlays, and event hooks
- skills are loaded on demand and fit specialized workflows
- the TUI library is exposed and reusable
- Pi packages bundle extensions, skills, prompts, and themes together
- Pi also exposes an SDK / embedding path for custom harnesses

This matters because `pi-phone-3gs` does not need to choose between:

- "just ship a few extensions"
- "rewrite everything from scratch"

There is a middle path:

- use Pi as the base runtime and TUI platform
- treat this repo as a dedicated harness package and eventually a standalone wrapper
- move from extension-led experiments toward a harness with opinionated layout and workflow surfaces

## D. GSD-2 is the clearest proof that a serious custom harness can be built on Pi

GSD-2 is important here not because it is phone-first, but because it validates the architectural move.

Key takeaways from its docs:

- it is a standalone CLI built on the Pi SDK
- it uses Pi as a runtime foundation, then adds its own workflow engine
- it introduces auto mode, disk-backed state, fresh session per work unit, verification gates, routing, recovery, and orchestration
- it proves a project can be much more than "a pile of prompts" once it owns the harness logic directly

Implication for this repo:

`pi-phone-3gs` should likely be thought of as **"a custom Pi harness for phone-first operation"**, not merely "a touch extension pack."

That is the GSD-2 lesson worth borrowing.

## E. OpenClaw is useful prior art mostly as a contrast case

OpenClaw is impressive and highly relevant, but mostly as an example of a different product bet.

Its emphasis includes:

- a long-lived gateway
- many messaging channels
- clients and nodes connecting over WebSocket
- the assistant living across Telegram, WhatsApp, Slack, Discord, etc.
- companion apps and web surfaces

That is valuable prior art for:

- local-first control planes
- device connectivity
- remote access patterns
- security and pairing concerns

But it also highlights what `pi-phone-3gs` should avoid as a primary interaction model.

### The key difference

OpenClaw makes the assistant available **through many channels**.

`pi-phone-3gs` should instead make the agent available **through the actual terminal harness itself**.

Why that difference matters:

- channel abstractions flatten rich session affordances
- they reduce visibility into tool use and context state
- they make model switching and steering clumsier
- they weaken the sense that you are operating a powerful machine directly

For this project, that directness is the point.

## F. The winning product shape is likely "dedicated shell over rich substrate"

Putting the above together suggests this product shape:

### Base substrate

Use Pi / pi-mono primitives for:

- model/runtime integration
- tools
- session handling
- extension system
- skills
- TUI components
- packaging

### Dedicated shell

Build a custom shell that specializes in:

- portrait layout
- touch targets
- narrow-width readability
- scroll / page / model / session controls
- glanceable status
- recovery surfaces
- remote-desktop ergonomics

### Curated capability stack

Bundle the table stakes that make it feel like a modern harness:

- files widget
- diff views
- process management
- subagents
- loops
- browser / GUI tools
- command center
- tool-output compaction
- instinct / learning systems
- interactive delegation to other agent CLIs

## Product implications

## 1. The repo should frame itself as a harness, not an app wrapper

That framing affects naming, architecture, and implementation choices.

## 2. Touch mode should be a first-class shell concern

Not just a cosmetic theme. It affects:

- layout
- scroll model
- widgets
- viewport sizing
- prompts
- overlay behavior
- interruption / recovery flows

## 3. Recovery matters more on phone than desktop

The operator needs obvious ways to:

- stop a run
- compact
- reload
- reattach to background work
- inspect status
- return to a safe layout

## 4. Narrow-screen information design is a core problem

This is not mostly about adding buttons.

It is about deciding what must always remain visible on a portrait screen with limited columns.

## 5. The system should preserve terminal sovereignty

The remote client is replaceable.

The terminal session, harness, and host machine are the durable product.

## Recommended framing for the repo

A concise framing based on the research would be:

> `pi-phone-3gs` is a dedicated phone-first coding harness built on Pi. It preserves the full power of a terminal-native agent while redesigning the TUI for portrait remote use, touch interaction, and fast recovery on a phone.

## Open questions still worth exploring later

- Should this stay as a Pi package for a while, or become a standalone CLI wrapper early?
- Which parts should remain extension-driven versus moving into a custom shell/runtime layer?
- What is the minimum narrow-screen status model that still feels fully capable?
- Should background work be represented more like jobs, tabs, or resumable sessions?
- How much of the layout should be user-configurable versus opinionated by default?
- Which remote desktop assumptions should be baked into the design versus documented as recommended setup?

## Bottom line

The research strongly supports a docs-first direction of:

- **build on Pi**
- **learn from `pi-touch`**
- **treat GSD-2 as proof that a custom harness is the right architectural level**
- **treat OpenClaw mainly as contrast and selective prior art, not as the target UX**
- **optimize around the real terminal as the phone UI**
