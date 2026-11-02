# Record the README demo GIF.
# Prerequisites: https://github.com/charmbracelet/vhs
# From a temp directory with a small Next.js/TS fixture (or tests/fixtures/next15-src):
#   vhs docs/demo.tape
# Output: docs/demo.gif (commit after a human records it).

Output docs/demo.gif

Require node

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 700
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "npx @agentinit/cli init --yes" Sleep 300ms Enter

Sleep 8s
