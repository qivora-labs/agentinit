---
'@agentinit/cli': patch
---

Tolerate unknown manifest keys (and preserve them on rewrite) so mixed CLI versions stay compatible. Older major/minor CLIs refuse to rewrite a newer project unless `--force`.
