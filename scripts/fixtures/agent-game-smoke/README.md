# Installed-package game smoke fixture

Install a freshly packed `@call-me-sensei/toonlab`, Three.js and Vite in an
isolated consumer directory. Copy `game.html` and `game-qa.mjs` here into that
directory. Run Vite from its real absolute path (resolve symlinks first), open
`/game.html`, wait for Ready, and click the gameplay checks button.

The fixture imports only the installed package's copyable game example. It
sends timed DOM keyboard events through the example's actual handlers, checks
movement against a static blocker, reaches the objective, restarts, clears
held input on focus loss and resizes. Inspect the rendered image and console,
then click Dispose to exercise idempotent teardown. The game can also be played
with WASD/arrows and R. It is a blockout, not finished game art or dynamic physics.

This fixture needs a real GPU-capable browser. A successful source import or
build alone cannot substitute for the render and gameplay checks.
