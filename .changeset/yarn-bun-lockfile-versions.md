---
'@agentinit/cli': patch
---

Read locked package versions from `yarn.lock` (classic and berry) and text `bun.lock` when `node_modules` is absent, so `doctor` in CI selects the same fragments as a local `init`. Binary `bun.lockb` is still not parsed.
