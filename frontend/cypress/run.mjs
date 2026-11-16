// Launches the Cypress CLI without ELECTRON_RUN_AS_NODE.
// VS Code (and other Electron-based tools) export ELECTRON_RUN_AS_NODE=1 to their terminals; Cypress is an
// Electron app, and with that variable set it fails with "bad option: --smoke-test".
// Usage: node cypress/run.mjs <run|open> [cypress args…]
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('cypress', process.argv.slice(2), { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 1))
