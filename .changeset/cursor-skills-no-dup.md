---
'@agentinit/cli': patch
---

Cursor workflows move from `.cursor/commands/<id>.md` to `.cursor/skills/<id>/SKILL.md`. When Claude Code is also selected, Cursor skips its own workflow files and uses `.claude/skills/` instead, so each workflow appears once in Cursor's slash menu. Re-running `init` removes unedited leftover `.cursor/commands` files from 0.1.0; edited ones are reported and kept. Cursor's documented minimum is now 2.4 (Agent Skills).
