---
'@agentinit/cli': patch
---

Harden backup folder names with a random suffix, ignore managed-block markers inside fenced code, and report a corrupt manifest from `doctor` as `manifest-invalid` (exit 2) instead of a tool crash.
