# Prior Art

This document compares `pi-phone-3gs` to the projects and patterns that most directly inform it.

## Summary table

| Reference | What it is | What to borrow | What to avoid / not copy wholesale |
|---|---|---|---|
| **Pi / pi-mono** | Extensible terminal coding-agent stack, SDK, TUI, packages | Base runtime, extensions, skills, TUI components, packaging, session model | Treating the default desktop-oriented layout as sufficient for phone use |
| **`pi-personal-package`** | Curated personal Pi distro with custom extensions | `pi-touch`, widgets, package curation, personal ergonomics, proof-of-concept touch UI | Keeping the phone UX as only an experimental sidecar forever |
| **GSD-2** | Standalone workflow-heavy harness built on Pi SDK | The architectural move: build a dedicated harness on Pi instead of only prompts/extensions | Copying its product goal; `pi-phone-3gs` is about phone-first operation, not milestone automation as the primary identity |
| **OpenClaw** | Local-first personal assistant across many channels and devices | Ambition, local-first stance, capability breadth, security awareness | Channel-first abstraction as the primary UX |
| **Aider / Claude Code / Codex CLI class** | Modern coding harnesses / agent CLIs | Table stakes: strong file/tool loop, fast steerability, model choice, practical workflows | Keyboard-assumed interaction models as the only interface |
| **Remote terminal / remote desktop workflows** | Jump Desktop, Tailscale, portrait terminal sessions, etc. | Real-world transport and operator setup patterns | Letting transport constraints dictate a weaker harness |

## Pi / pi-mono

### Why it matters

Pi is the fundamental substrate that makes this project plausible without a full reinvention.

From Pi and pi-mono, this project inherits:

- a tool-calling coding-agent runtime
- a reusable TUI library
- extensions
- skills
- prompt templates
- packages
- session persistence
- an SDK / embedding path

### The key lesson

Pi is opinionated about being extensible rather than forcing a single product shape.

That means `pi-phone-3gs` can be more than a theme, but less than a total rewrite.

### What `pi-phone-3gs` adds

- portrait-first layout
- touch-target-first ergonomics
- phone recovery surfaces
- a custom shell identity focused on remote use from a phone

## `pi-personal-package`

### Why it matters

This is the closest existing prototype environment for the vision.

It already demonstrates:

- curation of a modern Pi capability stack
- custom widgets and status surfaces
- experimental touch mode
- personal UX iteration without forking Pi core

### Most relevant contribution

The `pi-touch` extension is the clearest proof that the interface can become meaningfully more phone-friendly inside Pi's extension model.

That proof is important because it changes the project from "wild idea" to "already partially working interaction pattern."

### Limitation

As long as it remains just an experimental extension in a personal package, the concept can stay fragmented.

`pi-phone-3gs` gives that direction a dedicated home and a stronger architectural identity.

## GSD-2

### Why it matters

GSD-2 proves a crucial point:

> a serious product can be built *on top of* Pi, not just *inside* Pi.

Its docs describe a standalone CLI using the Pi SDK, with its own workflow engine, auto mode, orchestration, routing, verification, and crash recovery.

### What to borrow

- treat the harness as a product in its own right
- own workflow and orchestration where it matters
- avoid prompt-only hacks when direct harness control is better
- use Pi as a foundation, not a cage

### What not to copy blindly

GSD-2's center of gravity is autonomous milestone execution.

`pi-phone-3gs` has a different center of gravity:

- interactive steering from a phone
- touch-first terminal ergonomics
- remote-desktop comfort
- preserving the operator's feel for the live harness

## OpenClaw

### Why it matters

OpenClaw is one of the clearest examples of a local-first, ambitious personal-agent system.

It shows how far an agent can go in terms of:

- channels
- nodes
- devices
- remote access
- control planes
- tool breadth
- local ownership

### Why it is also the contrast case

OpenClaw's product stance is heavily about the assistant living in many communication surfaces.

That is almost the opposite of the core bet for this repo.

`pi-phone-3gs` should say:

- not "talk to your agent from anywhere through any chat surface"
- but rather "operate your real coding harness directly from your phone"

### The deeper distinction

OpenClaw optimizes for **ubiquity of access**.

`pi-phone-3gs` should optimize for **fidelity of control**.

That means preserving:

- tool visibility
- session navigation
- model selection
- recovery controls
- prompt steering
- compact but real TUI state

## The broader class of coding harnesses

Even without going deep on each project, there is a general baseline now for what users expect from a modern coding harness:

- reliable file operations
- shell integration
- model switching
- compact tool rendering
- delegation / subagents
- session persistence
- autonomy modes
- browser and GUI workflows in stronger systems

This repo should meet those expectations, but in a form that is usable from a phone.

That is why the project should be judged less against "mobile apps" and more against "serious coding harnesses with a radically different ergonomic target."

## Remote-terminal prior art

There is also non-agent prior art worth respecting:

- remote desktop sessions to a home machine
- persistent terminal workflows
- tmux/screen style resumability
- operator habits built around couch / commute / away-from-desk access

The lesson here is simple:

people already remote into real machines from phones.

The missing piece is not transport. The missing piece is a terminal harness designed for that mode instead of merely tolerated by it.

## The synthesis

If you reduce the prior art to the most useful takeaways:

- **Pi / pi-mono** says: the substrate is extensible enough
- **`pi-personal-package`** says: touch-first ideas already work in prototype form
- **GSD-2** says: building a dedicated harness on Pi is a legitimate architectural move
- **OpenClaw** says: local-first capability breadth is compelling, but channel-first abstraction is not the right primary UX for this project

## Positioning statement

A concise way to position the repo relative to prior art:

> `pi-phone-3gs` sits between a Pi package and a standalone Pi-derived product. It borrows Pi's extensibility, borrows GSD-2's confidence in owning the harness layer, and deliberately rejects the idea that the best phone interface for a coding agent is a chat channel or web dashboard.
