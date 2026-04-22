# pi-phone-3gs

> A touch-optimized coding agent harness that still runs in your real terminal on your real computer.

![Reference screenshot of the early portrait touch UI](docs/images/phone-touch-reference.png)

`pi-phone-3gs` is an early vision repo for a phone-first, portrait-friendly coding harness built on top of the Pi ecosystem.

The bet is simple:

- the **computer stays the real computer**
- the **terminal stays the real interface**
- the **phone is just how you remote into it**
- the UI is redesigned so that terminal-native agent work is actually comfortable to drive by touch

## Thesis

A lot of "personal agent" systems move the agent behind a chat abstraction: Telegram, Discord, WhatsApp, Slack, or a web dashboard.

That makes access easy, but it usually waters down the best parts of a serious coding harness:

- direct model control
- rich session state
- tool visibility
- prompt and context steering
- compaction / resume / branch navigation
- the whole moment-to-moment gameplay loop of agentic work

`pi-phone-3gs` takes the opposite approach. The product is the **remote terminal itself**, full-screened on a phone, with large touch targets and a layout tuned for narrow portrait displays.

## What this project is aiming to be

A dedicated harness, built off Pi in the same spirit that **GSD-2** builds a custom workflow system on top of the Pi SDK, but focused on a different problem:

**make a fully capable coding agent feel good on a phone without giving up terminal-native power.**

Target capabilities include:

- skills
- prompts and prompt templates
- tools
- loops / autonomy modes
- subagents
- browser use
- computer use / GUI automation
- process supervision
- session tree navigation
- compaction / resume
- self-heal and recovery surfaces
- model switching and multi-provider workflows
- dense but touchable status / observability widgets

## What this is not

This repo is explicitly **not** trying to become:

- a web UI
- a proxy to an iPhone app
- a Telegram-bot-first coding agent
- a watered-down remote shell with only a few approved commands
- a chat layer that hides the harness behind another transport abstraction

The core UX is:

1. a home Mac mini or similar machine stays on
2. the machine runs the actual harness in Terminal/iTerm/Ghostty/etc.
3. the display is configured for a portrait-ish phone-friendly viewport
4. you remote in from your phone
5. you operate the harness mostly through a touch-optimized TUI
6. you occasionally pop out to other apps on the host when needed

## Current inspiration sources

This repo is grounded in four concrete references:

1. **Your `pi-personal-package`**
   - especially the experimental `pi-touch` extension and the curated package stack
2. **The current screenshot / prototype direction**
   - large command buttons, viewport controls, model tap target, visible provider usage, prompt mirror
3. **`badlogic/pi-mono` and Pi docs**
   - proves the base system is intentionally extensible: SDK, TUI components, skills, extensions, packages, themes
4. **Prior-art harnesses like GSD-2 and OpenClaw**
   - useful examples of what to borrow and what to avoid

## Docs in this repo

- [docs/vision.md](docs/vision.md) — product vision, design principles, gameplay loop, non-goals
- [docs/research.md](docs/research.md) — research notes from Pi, `pi-personal-package`, the screenshot, GSD-2, and OpenClaw
- [docs/architecture.md](docs/architecture.md) — core components, layers, and their roles
- [docs/prior-art.md](docs/prior-art.md) — comparison against Pi, GSD-2, OpenClaw, and adjacent tools
- [docs/assets.md](docs/assets.md) — current assets, references, and reusable building blocks
- [docs/roadmap.md](docs/roadmap.md) — phased build order for turning the vision into a real harness

## Current status

This initial commit is intentionally **docs-first**.

The goal is to pin down:

- the vision
- the constraints
- the reusable assets already available
- the architectural shape of the harness
- the ways this should differ from adjacent projects

Once that is stable, the next logical step is to scaffold the actual harness code on top of Pi.
