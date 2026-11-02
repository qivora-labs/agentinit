# Record the README demo GIF.
# Prerequisites: https://github.com/charmbracelet/vhs
# From the repo root (after pnpm install):
#   vhs docs/demo.tape
# Output: docs/demo.gif

Output docs/demo.gif

Require node
Require pnpm

Set Shell "bash"
Set FontSize 16
Set Width 1000
Set Height 900
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"
Set Padding 20
Set WaitTimeout 90s

# Build the CLI, copy next15-src, and shim `npx @agentinit/cli` → local dist.
Hide
Type "source docs/demo-setup.sh"
Enter
Wait
Show

Type "npx @agentinit/cli init --yes"
Sleep 300ms
Enter
Wait+Screen /Always-on tokens/
Sleep 4s
