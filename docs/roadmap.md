# Initial Roadmap

This roadmap translates the vision docs into an initial execution order.

## Phase 0 — Establish the repo as the source of truth

Goal: lock the vision and architecture before building a pile of one-off experiments.

Deliverables:

- docs for vision, research, architecture, prior art, and assets
- screenshot and reference artifacts checked into the repo
- clear positioning relative to Pi, GSD-2, and OpenClaw

## Phase 1 — Prove the shell

Goal: make the phone-first shell usable every day, even if the rest of the harness is still mostly stock Pi underneath.

Likely work:

- stabilize portrait layout assumptions
- harden top/bottom touch rails
- make the prompt mirror reliable
- improve page-up/page-down/top/bottom ergonomics
- expose safe abort / reload / compact / resume flows
- ensure failure cannot brick startup

Success criteria:

- comfortable to reconnect from a phone and steer a session
- basic recovery is one or two taps away
- shell survives repeated daily use

## Phase 2 — Curate the table stakes

Goal: bundle the capability set that makes the shell feel like a serious modern harness rather than a cute terminal skin.

Likely work:

- file browsing and diff surfaces
- background process supervision
- subagents
- loops / iterative execution
- browser / GUI automation
- compact tool rendering
- command discovery
- model/provider observability widgets

Success criteria:

- the phone shell still exposes the important power-user workflows
- tool-heavy sessions remain readable on a narrow screen

## Phase 3 — Own the harness layer

Goal: move from package experiment toward a dedicated product wrapper in the style of a custom Pi-derived harness.

Likely work:

- dedicated CLI entrypoint
- opinionated startup mode for phone use
- default package stack and settings
- shell-specific commands and settings schema
- first-class layout / recovery behavior

Success criteria:

- `pi-phone-3gs` feels like a product, not just a bag of extensions

## Phase 4 — Add resilience and self-heal

Goal: make long-running phone-driven agent work realistic.

Likely work:

- better background job reattachment
- crash and recovery surfaces
- safe mode / minimal mode
- log inspection helpers
- recovery prompts and state repair
- stronger cues for provider failure, stuck runs, and resumability

Success criteria:

- leaving and re-entering the system later feels normal
- recovery overhead is low enough to stay in the phone workflow

## Phase 5 — Polish the phone appliance feel

Goal: make the harness feel intentional and pleasant, not merely functional.

Likely work:

- visual theme polish
- thumb-zone layout refinement
- animation or transition restraint for remote latency
- better screenshot and recording assets
- a documented recommended hardware/software setup

Success criteria:

- someone can reproduce the setup and immediately understand why this product exists

## Deferred / optional later directions

These may become interesting later, but should not distract from the main shell:

- lightweight notification or out-of-band alert channels
- companion utilities for setup and troubleshooting
- richer job dashboards
- optional alternate layouts for tablet or landscape use

## Guiding rule

Do not trade away harness power for convenience.

If a feature makes phone operation easier by hiding or weakening core agent control, it is probably the wrong move for this repo.
