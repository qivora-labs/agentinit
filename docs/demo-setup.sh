#!/usr/bin/env bash
# Sourced by docs/demo.tape (Hide) so the marketed `npx @agentinit/cli`
# command works against a local build + next15-src fixture.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
(cd "$ROOT" && pnpm build)

DEMO="$(mktemp -d "${TMPDIR:-/tmp}/agentinit-demo.XXXXXX")"
cp -R "$ROOT/tests/fixtures/next15-src/." "$DEMO/"

# First-run demo: drop any leftover generated files (never commit these into
# the fixture; strip them here so a dirty checkout still records cleanly).
rm -rf \
  "$DEMO/.agentinit" \
  "$DEMO/.claude" \
  "$DEMO/.cursor" \
  "$DEMO/.github" \
  "$DEMO/.windsurf"
rm -f \
  "$DEMO/AGENTS.md" \
  "$DEMO/ARCHITECTURE.md" \
  "$DEMO/CLAUDE.md"

mkdir -p "$DEMO/.bin"
ln -sfn "$ROOT/dist/cli.js" "$DEMO/.bin/agentinit"

REAL_NPX="$(command -v npx)"
cat >"$DEMO/.bin/npx" <<EOF
#!/usr/bin/env bash
set -euo pipefail
REAL_NPX=$(printf '%q' "$REAL_NPX")
if [ "\${1:-}" = "--yes" ] || [ "\${1:-}" = "-y" ]; then shift; fi
if [ "\${1:-}" = "@agentinit/cli" ]; then
  shift
  exec agentinit "\$@"
fi
exec "\$REAL_NPX" "\$@"
EOF
chmod +x "$DEMO/.bin/npx"

export PATH="$DEMO/.bin:$PATH"
# Short prompt matching VHS's default WaitPattern (/>$/); hide the temp path.
export PS1='> '
cd "$DEMO"
clear
