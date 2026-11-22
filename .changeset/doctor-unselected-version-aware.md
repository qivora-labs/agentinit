---
'@agentinit/cli': minor
---

`doctor` reports `unselected` as a warning when the manifest was written by a different CLI version, so new coverage does not fail unpinned CI. Same-version mismatches stay errors. When the running CLI is older than the manifest, the fix asks to upgrade doctor; when it is newer, the fix is re-init with the running version. BREAKING CHANGE: `--json` `severity` for `unselected` can be `warning` when CLI versions differ.
