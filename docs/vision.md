# Vision

## One-line pitch

`pi-phone-3gs` is a **phone-first terminal coding harness**: a touch-optimized TUI for a fully capable agent running on your own always-on machine.

## Core idea

If Pi is the engine, and `pi-personal-package` is the proving ground for custom ergonomics, then `pi-phone-3gs` is the dedicated vehicle:

- tuned for portrait remote access
- optimized for tap targets instead of keyboard density
- still fully terminal-native
- still fully hackable
- still able to expose the real model / prompt / tool / session surfaces

The central belief is that **the terminal itself can be the mobile UI**.

Not a web dashboard.
Not a chatbot shell.
Not an iOS wrapper.
A real terminal, redesigned so it feels like a purpose-built handheld agent console.

## Product thesis

The strongest coding harnesses are powerful because they expose the real loop:

- write or steer a prompt
- inspect tool calls and outputs
- switch models when needed
- compact context
- page through history
- branch or resume a session
- run delegated agents
- inspect files and diffs
- intervene quickly when the model stalls or drifts

Channel-first assistants often erase or flatten that loop. They are great at ubiquity, but weaker at craft.

`pi-phone-3gs` exists to preserve the craft.

## Primary user scenario

A likely default setup:

- **host machine:** home Mac mini or similar always-on Mac
- **display:** dummy display plug set to a phone-friendly portrait resolution
- **transport:** Jump Desktop, Tailscale + remote desktop, or similar
- **runtime:** Pi-based harness running in a full-screen terminal
- **operator device:** iPhone or other phone used mostly in portrait

In use, the phone should feel like a dedicated agent appliance:

- big controls at the edges
- stable prompt area
- obvious scroll / page / model affordances
- enough status to understand what the agent is doing
- no need to pinch-zoom tiny terminal text constantly

## The desired gameplay loop

This repo should optimize the moment-to-moment loop of agentic work on a phone.

### 1. Re-enter quickly

You reconnect to the running terminal and immediately see:

- current model
- current task state
- queued follow-ups
- where you are in the chat/history
- whether background jobs or loops are still active

### 2. Steer with big, reliable controls

Without needing a hardware keyboard, you should be able to:

- start a new session
- reload extensions
- compact context
- resume another session
- inspect the session tree
- jump to top / bottom
- page up / down
- open slash-command mode
- send escape / enter / ctrl-c style controls
- cycle model selection

### 3. Keep the full harness available

Touch optimization must not mean capability loss.

The operator should still be able to use:

- prompts and prompt templates
- skills
- project tools
- subagents
- browser / GUI automation
- loops and autonomous runs
- process watchers
- file browsers and diffs
- compaction, resume, and forking

### 4. Watch and intervene

When the agent is working:

- the viewport should stay readable on a narrow screen
- important status should remain visible
- tool output should be compact enough to scan
- interrupt / follow-up / steering actions should be easy to reach

### 5. Recover gracefully

If something goes wrong, the harness should make recovery obvious:

- abort
- compact
- reload
- resume a prior branch
- reattach to a background task
- inspect logs
- drop into a safe layout if the touch shell misbehaves

## Design principles

### 1. Terminal-first, not app-first

The terminal session is the primary product surface.

A phone is just the viewport and input device.

### 2. Preserve real harness power

Do not flatten the system into a text-only chat transport.

Expose the real features that matter:

- model control
- tools
- session tree
- compaction
- context steering
- widgets
- background work
- file/diff/navigation surfaces

### 3. Touch-first does not mean dumbed down

Controls can be larger, simpler, and safer without reducing the ceiling.

The UI should offer high-power workflows through touch-friendly affordances rather than removing them.

### 4. Extensible from day one

This project should inherit Pi's philosophy:

- extensions
- skills
- prompt templates
- themes
- packages
- SDK-driven custom harness logic

The harness should feel like a composition of replaceable parts, not a monolith.

### 5. Narrow-screen layouts are a first-class constraint

Many terminal tools assume a wide laptop.

This repo should assume something closer to:

- portrait orientation
- limited horizontal space
- thumb reach as a real ergonomic constraint
- intermittent remote-desktop latency

### 6. Safe failure modes matter

A broken touch layer should never brick the harness.

There should always be a path back to:

- plain Pi behavior
- keyboard fallback
- safe mode / minimal layout
- visible logs and recovery commands

### 7. The computer remains local and sovereign

The agent should run on your own box with your tools, files, credentials, and local state.

Remote access is transport, not product abstraction.

## Non-goals

These are explicitly out of scope for the core vision.

### Not a web dashboard

A browser UI may be useful for some ecosystems, but it is not the point here.

### Not a Telegram/Discord-first bot shell

Messaging channels are useful for alerts or lightweight control, but they should not replace the primary operating surface.

### Not a thin mobile companion app

The phone should not need a custom native app to unlock the experience.

### Not a stripped-down terminal toy

This should still be a serious harness with modern coding-agent table stakes.

## Success criteria

A successful `pi-phone-3gs` experience should make this sentence true:

> "I can lie on the couch, remote into my home machine from my phone, and drive a real coding agent comfortably enough that I do not feel forced back to a laptop for normal steering, inspection, and recovery work."

## Near-term direction

The first implementation should likely focus on:

1. a solid portrait layout shell
2. touch-safe command rails and viewport controls
3. compact observability widgets
4. access to modern harness table stakes
5. robust recovery and escape hatches

Only after those are solid should the project expand into more ambitious orchestration and autonomy layers.
