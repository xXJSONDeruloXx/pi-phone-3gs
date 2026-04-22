# Assets and Building Blocks

This document records the concrete assets already available for `pi-phone-3gs`.

## 1. Visual reference asset

### `docs/images/phone-touch-reference.png`

This screenshot is the clearest current visual artifact for the project direction.

It shows:

- a portrait-oriented terminal layout
- large top-row utility buttons
- a stable prompt / prompt mirror area
- big bottom controls for paging, movement, and input
- explicit model-switch affordance
- visible provider/quota widgets
- a footer that still exposes model and runtime information

This should be treated as the first visual reference for the shell.

## 2. Prototype code assets from `pi-personal-package`

The strongest current code assets live in `xXJSONDeruloXx/pi-personal-package`.

### Local extensions worth carrying forward conceptually

- `extensions/pi-touch.ts`
  - phone/touch mode
  - viewport control
  - tap hit-testing
  - top and bottom touch rails
  - startup persistence and kill-switches
- `extensions/pi-touch.md`
  - maintenance notes and learned constraints
- `extensions/diff.ts`
  - full-screen diff viewer pattern
- `extensions/upstream-master-diff-footer.ts`
  - compact branch/diff status surface
- `extensions/provider-widget-controls.ts`
  - ordering/visibility controls for status widgets
- provider usage widgets
  - compact observability for model/provider quotas
- `extensions/notifications.ts`
  - audible feedback / TTS hooks

### Bundled third-party capabilities already selected there

- `@aliou/pi-processes`
- `@ifi/pi-extension-subagents`
- `@tmustier/pi-files-widget`
- `@tmustier/pi-ralph-wiggum`
- `latchkey`
- `pi-codex-web-search`
- `pi-command-center`
- `pi-continuous-learning`
- `pi-hide-messages`
- `pi-interactive-shell`
- `pi-stash`
- `pi-tool-display`
- `pi-computer-use`

This package stack is effectively a shortlist of the capabilities that already feel useful enough to keep around on a personal machine.

## 3. Pi ecosystem assets

From Pi / pi-mono, the project can rely on:

- **Pi runtime** — tool-calling agent harness
- **Pi SDK** — path toward a dedicated standalone wrapper
- **Pi TUI** — custom components, widgets, overlays, layout primitives
- **Extensions API** — commands, tools, events, widgets, status lines, shortcuts
- **Skills** — progressive capability loading
- **Packages** — bundle prompts/extensions/skills/themes together
- **Themes** — visual customization without core forks
- **Session model** — saved sessions, resume, compaction, branch/tree workflows

## 4. Operational assets from the target environment

The product vision also depends on non-code assets:

### Hardware / host assumptions

- an always-on home Mac mini or equivalent machine
- stable local toolchain and credentials
- browser and desktop apps available for computer-use tasks
- enough reliability that reconnecting from a phone is normal

### Display / ergonomics assumptions

- portrait-friendly display profile
- coarse touch targets
- narrow terminal width accepted as normal
- remote access that can tolerate tapping and scrolling

### Transport assumptions

- Jump Desktop or similar remote desktop path
- optional VPN / Tailscale layer
- the operator reconnects to the same long-lived machine rather than spawning disposable mobile sessions

## 5. Conceptual assets from prior art

These are not code assets, but they are still reusable design assets.

### From GSD-2

- confidence that Pi can be the foundation of a new harness
- owning orchestration directly instead of via prompts alone
- treating recovery and session boundaries as product features

### From OpenClaw

- local-first ambition
- broad capability horizon
- remote access and device thinking
- caution around security and trust boundaries

## 6. Assets this repo should probably create next

The repo now has the core written vision, but several assets would make the concept much easier to build and discuss.

### Design assets

- portrait layout wireframes
- narrow-width state hierarchy diagrams
- touch target map with thumb-reach zones
- visual states for safe mode / busy mode / recovery mode

### Technical assets

- scaffold for a package or wrapper CLI
- architecture diagram for the runtime stack
- settings schema for phone mode
- shell state model for widgets, jobs, and overlays

### Demo assets

- additional screenshots
- short screen recordings
- before/after comparisons versus stock Pi on a phone

## 7. Bottom line

The repo is not starting from zero.

It already has:

- a convincing visual direction
- a prototype touch implementation in another repo
- a mature extensible substrate in Pi
- a curated package stack of useful capabilities
- prior art showing both the right architectural moves and the wrong abstractions for this specific product vision
