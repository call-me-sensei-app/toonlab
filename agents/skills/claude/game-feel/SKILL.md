---
name: game-feel
description: Keep project-owned game-feel behavior separate from the ToonLab anime-game style contract.
---

# Game-Feel Boundary

Game-feel behavior is not a stable ToonLab package entry point or
style-bundle slot. Do not import `@call-me-sensei/toonlab/game-feel`.

Read `agents/references/runtime-entry-points.md` and
`agents/references/custom-gap-report.md` first. The host game owns hit-stop,
camera impulses, squash, flashes, audio, haptics, cooldowns, and gameplay
timing. Stable ToonLab post settings may present supported screen treatment,
but they do not own gameplay-event scheduling.

If a project-local effect requires a custom shader, material, or adapter to
match the selected anime art direction, record that decision in the custom
integration note before treating it as reusable ToonLab behavior.
