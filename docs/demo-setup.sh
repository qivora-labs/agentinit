#!/usr/bin/env bash
# Sourced by docs/demo.tape (Hide) so the marketed `npx @agentinit/cli`
# command works against a local build + next15-src fixture.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
(cd "$ROOT" && pnpm build)

DEMO="$(mktemp -d "${TMPDIR:-/tmp}/agentinit-demo.XXXXXX")"
cp -R "$ROOT/tests/fixtures/next15-src/." "$DEMO/"

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
cd "$DEMO"
clear
