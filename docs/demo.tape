# Record the README demo GIF.
# Prerequisites: https://github.com/charmbracelet/vhs
# From the repo root (after pnpm install):
#   vhs docs/demo.tape
# Output: docs/demo.gif
#
# Interactive init on next15-src (via docs/demo-setup.sh): detection card →
# agents → review → write. Prefer this over --yes so the GIF shows the UX.

Output docs/demo.gif

Require node
Require pnpm

Set Shell "bash"
Set FontSize 13
Set Columns 100
Set Rows 60
Set TypingSpeed 50ms
Set Theme "Catppuccin Mocha"
Set Padding 18
Set WaitTimeout 45s
Set Framerate 24

# Build the CLI, copy next15-src, and shim `npx @agentinit/cli` → local dist.
Hide
Type "source docs/demo-setup.sh"
Enter
Wait
Show

Type "npx @agentinit/cli init"
Sleep 400ms
Enter

# Detection card + confirm configuration
Wait+Screen /Use this configuration/
Sleep 1.6s
Enter

# Agent multi-select (all selected by default)
Wait+Screen /Which agents/
Sleep 1.2s
Enter

# Review card + write
Wait+Screen /What next/
Sleep 1.6s
Enter

# Final report (TTY uses "Context cost" / next steps; avoid /Done./ — it can
# race the shell prompt after exit).
Wait+Screen /Check for drift/
Sleep 4s
