---
'@agentinit/cli': patch
---

`doctor` reports rule drift from another CLI version as a `rules-update` warning instead of failing CI. Same-version outdated files and hand edits stay errors.
