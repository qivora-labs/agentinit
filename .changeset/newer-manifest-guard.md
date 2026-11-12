---
'@agentinit/cli': patch
---

When a manifest fails the schema but records a newer `cliVersion`, report an upgrade message instead of suggesting the file is corrupt or should be deleted.
