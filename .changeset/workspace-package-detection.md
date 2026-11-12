---
'@agentinit/cli': patch
---

Resolve installed package versions and the package manager from the workspace lookup root when running inside a workspace package. If you previously initialized inside a monorepo package, re-run `init` — `doctor` may now report a different framework fragment for the version that is really installed.
