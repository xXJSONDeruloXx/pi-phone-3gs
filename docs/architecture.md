# Architecture

This document describes the likely architectural shape of `pi-phone-3gs` based on the current research.

## High-level model

```text
Phone
  │
  │  remote desktop / remote access
  ▼
Home Mac mini (or similar always-on machine)
  │
  │  full-screen terminal in portrait-friendly layout
  ▼
pi-phone-3gs shell
  ├─ touch-first TUI chrome
  ├─ Pi runtime + session engine
  ├─ prompts / skills / extensions / themes
  ├─ orchestration + recovery layer
  └─ local + external tool surfaces
```

The key architectural decision is that the **terminal session is the primary runtime surface**.

There is no required web control plane between the phone and the harness.

## Layered view

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Operator layer                                            │
│    Phone + remote desktop client                             │
├──────────────────────────────────────────────────────────────┤
│ 2. Host environment                                          │
│    macOS, portrait display profile, terminal emulator        │
├──────────────────────────────────────────────────────────────┤
│ 3. Phone-first shell                                         │
│    touch rails, prompt mirror, viewport, status widgets      │
├──────────────────────────────────────────────────────────────┤
│ 4. Pi substrate                                              │
│    agent runtime, sessions, tools, extensions, skills, TUI   │
├──────────────────────────────────────────────────────────────┤
│ 5. Capability stack                                          │
│    processes, subagents, loops, files, browser, GUI, search  │
├──────────────────────────────────────────────────────────────┤
│ 6. Persistence + resilience                                  │
│    logs, sessions, settings, recovery, self-heal             │
└──────────────────────────────────────────────────────────────┘
```

## Core components and roles

| Component | Role | Why it matters here |
|---|---|---|
| **Host machine** | Runs the actual harness, tools, files, credentials, browsers, and local automation | Keeps the experience sovereign and fully capable |
| **Remote access transport** | Lets a phone attach to the host terminal | Transport only; should not redefine the product |
| **Terminal emulator** | Presents the actual TUI session | The terminal is the product surface |
| **Phone-first shell** | Adds touch controls, narrow layouts, prompt mirror, edge actions, paging, safe fallbacks | This is the project's most distinctive layer |
| **Pi runtime** | Provides tool-calling agent runtime, sessions, commands, model integration | Strong base instead of reinventing the harness |
| **Pi TUI layer** | Enables custom widgets, overlays, components, hit-testing, alternate views | Necessary for a serious portrait terminal UX |
| **Extensions** | Add commands, widgets, hooks, tools, layout behaviors, status surfaces | Fast path for product iteration |
| **Skills** | Inject specialized workflows only when needed | Keeps the harness capable without bloating constant context |
| **Prompt / agent definitions** | Shape how the system behaves across workflows and delegated roles | Needed for differentiated steering and orchestration |
| **Process supervision** | Run dev servers, watchers, log tails, and long tasks in the background | Essential for real coding work on a phone |
| **Subagents** | Offload bounded tasks into isolated contexts | Important for modern harness parity |
| **Loop / autonomy system** | Support iterative execution, long-running work, and recovery | Part of the table stakes for agentic work |
| **Browser / GUI / computer use** | Interact with websites and macOS applications | Needed for tasks that escape pure shell workflows |
| **File / diff / navigation surfaces** | Make inspection workable on a small portrait screen | Without this, the phone UX collapses quickly |
| **Observability widgets** | Show model, quota, cost, run state, branch/diff state, job status | The operator needs glanceable state at all times |
| **Persistence and self-heal** | Preserve sessions, survive crashes, recover from bad states | Recovery overhead is higher on phone, so resilience matters more |

## The most important subsystem: the phone-first shell

This is where `pi-phone-3gs` most clearly differentiates itself.

### Responsibilities

- reserve space for large tap targets
- control chat viewport scrolling explicitly
- keep the prompt readable on narrow screens
- expose critical commands without requiring slash-command memorization
- reduce the amount of precision pointing required
- keep recovery controls near-at-hand
- fail safely back to plain Pi behavior

### Likely shell features

Based on the current screenshot and `pi-touch` prototype:

- top utility buttons (`/new`, `/reload`, `/compact`, `/resume`, `/tree`)
- bottom navigation rail (`top`, `page up`, `model`, `page down`, `bottom`)
- tap-friendly raw-key controls (`esc`, arrows, enter, slash, ctrl-c)
- prompt mirror or stable editor strip
- compact but always-visible provider/model/usage status
- wrapping button groups for narrow widths
- persisted touch-mode state with explicit kill-switches

## Capability categories

These are the main capability buckets the harness should expose.

## 1. Core coding surfaces

- file reading and writing
- patch editing
- bash commands
- diff viewing
- file tree browsing
- session tree browsing
- stash / scratch surfaces

## 2. Long-running work

- background processes
- test/build watchers
- task reattachment
- log following
- bounded loops and reflective iteration

## 3. Delegation

- subagents
- interactive-shell delegation to other coding CLIs
- scoped helper agents / prompt packs

## 4. External knowledge and interaction

- web search
- browser automation
- GUI computer use
- HTTP/API integrations

## 5. Recovery and hygiene

- reload
- compact
- abort / interrupt
- safe mode
- resume / fork
- inspect logs
- status snapshots

## Gameplay loop as an architecture constraint

The UI and backend should both support this loop cleanly:

```text
Reconnect
  → understand current state quickly
  → steer or queue a task
  → observe execution compactly
  → intervene if needed
  → inspect files/diffs/results
  → dispatch follow-up / subagent / loop
  → recover or compact when state gets messy
  → leave and re-enter later without losing the thread
```

Any architectural choice that makes this loop slower on a phone is probably a bad fit.

## Reusable building blocks from today's ecosystem

## From Pi / pi-mono

- agent runtime
- TUI component system
- extensions API
- skills system
- packages system
- themes and widgets
- session persistence
- SDK embedding path

## From `pi-personal-package`

- touch shell ideas from `pi-touch`
- provider usage widgets
- diff/status surfaces
- notifications and TTS
- bundled third-party extensions that already solve real problems

## From GSD-2

- proof that a bespoke harness on Pi SDK is viable
- owning the workflow/orchestration layer directly
- treating sessions and execution control as first-class harness concerns

## From OpenClaw

Selective borrowing only:

- local-first control-plane thinking
- security / pairing / remote-access caution
- broad capability ambition

But not the core product abstraction of "the assistant lives in channels."

## Proposed implementation shape

A pragmatic implementation path would likely have three stages.

## Stage 1: Package-first shell

Build the first serious version mostly as a Pi package / extension stack:

- refine touch shell behaviors
- define a stable portrait layout
- add compact widgets and narrow-screen viewers
- prove the interaction model in daily use

## Stage 2: Dedicated wrapper / harness

Wrap Pi via SDK into a dedicated `pi-phone-3gs` CLI:

- own startup behavior
- own default package set
- own layout mode and settings
- own opinionated shell commands and recovery UX

This is the stage where the repo begins to feel more like GSD-2 structurally.

## Stage 3: Deeper orchestration and self-heal

Once the shell is solid:

- improve resumability and job visibility
- introduce stronger self-heal and state repair flows
- add phone-native control surfaces for long-running agent work
- refine how loops, subagents, and recovery present on a narrow screen

## Non-architectures to avoid

### 1. Chat-channel-first abstraction

Avoid making Telegram/Discord/etc. the primary operator surface.

That path weakens too many harness affordances.

### 2. Desktop-wide TUI with giant fonts

A phone-first harness is not just Pi with bigger text.

The layout itself has to change.

### 3. Forking Pi too early

The ecosystem is already extensible enough to get far without a hard fork.

A fork should be a last resort, not the opening move.

## Early success criteria for architecture

The architecture is on track if it enables all of the following without heroic hacks:

- touch-safe navigation of long chat sessions
- visible model and run state on narrow screens
- recovery actions reachable in one or two taps
- background job visibility
- access to subagents, loops, browser use, and GUI tools
- packageable customization instead of source forks everywhere
- safe fallback to plain terminal behavior when the shell layer fails

## Summary

The architecture should be read as:

- **Pi is the substrate**
- **the phone-first shell is the differentiator**
- **the curated capability stack makes it competitive with modern harnesses**
- **resilience and recovery are mandatory because the operator is on a phone**
