---
'@agentinit/cli': minor
---

BREAKING CHANGE: JavaScript-only projects exit `0` and write rules instead of exiting `1`. `selections.language` may be `javascript` or `javascript-jsdoc`. Detection records `allowJs`, `checkJs`, and module-system facts on the profile each run (not in the manifest).
