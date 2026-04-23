# Roadmap

This roadmap translates the vision docs into an execution order and now marks rough implementation status so the docs reflect reality.

## Phase 0 — Establish the repo as the source of truth

Goal: lock the vision and architecture before building a pile of one-off experiments.

Deliverables:

- docs for vision, research, architecture, prior art, and assets
- screenshot and reference artifacts checked into the repo
- clear positioning relative to Pi, GSD-2, and OpenClaw

## Phase 1 — Prove the shell *(mostly in progress / partially achieved)*

Goal: make the phone-first shell usable every day, even if the rest of the harness is still mostly stock Pi underneath.

Work completed or underway:

- stabilize portrait layout assumptions
- harden the touch shell around a sticky header, viewport, favorites rail, overlays, and optional nav pad
- improve page-up/page-down/top/bottom ergonomics
- expose safe reload / compact / resume / tree flows
- add safe teardown so touch mode cannot brick the session
- bootstrap starter config/layout/favorites/state files so new installs come up usable

Still worth improving:

- prompt/editor ergonomics on very narrow screens
- better first-run guidance and command discovery
- more polish around panel placement and recovery affordances

Success criteria:

- comfortable to reconnect from a phone and steer a session
- basic recovery is one or two taps away
- shell survives repeated daily use
- a fresh `pi install` / `pi update` user gets a sane out-of-box setup

## Phase 2 — Curate the table stakes *(active next focus)*

Goal: bundle the capability set that makes the shell feel like a serious modern harness rather than a cute terminal skin.

Likely work:

- file browsing and diff surfaces tuned for narrow screens
- background process supervision surfaces that are easy to monitor from the phone UI
- subagents and loops presented in a way that does not overwhelm the viewport
- browser / GUI automation affordances that remain touch-friendly
- compact tool rendering and better command discovery
- model/provider observability widgets that fit the shell cleanly

Success criteria:

- the phone shell still exposes the important power-user workflows
- tool-heavy sessions remain readable on a narrow screen

## Phase 3 — Own the harness layer *(future)*

Goal: move from package experiment toward a dedicated product wrapper in the style of a custom Pi-derived harness.

Likely work:

- dedicated CLI entrypoint
- opinionated startup mode for phone use
- default package stack and settings
- shell-specific commands and settings schema
- first-class layout / recovery behavior

Success criteria:

- `pi-phone-3gs` feels like a product, not just a bag of extensions

## Phase 4 — Add resilience and self-heal *(future)*

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

## Phase 5 — Polish the phone appliance feel *(future)*

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
