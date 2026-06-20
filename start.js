/**
 * Production entry point — runs both the Express server and Discord bot
 * in a single Node.js process.
 */

const { spawn } = require('child_process');
const path = require('path');

// Load .env from the app directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('[Prod] Starting Stream Bingo Bot...');
console.log(`[Prod] Node ${process.version} | PID ${process.pid}`);

const children = [];

function startProcess(name, script) {
  const child = spawn('node', [script], {
    stdio: 'inherit',
    env: process.env,
    cwd: __dirname,
  });

  child.on('exit', (code) => {
    console.error(`[Prod] ${name} exited with code ${code}`);
    // If a critical process dies, restart it after a delay
    if (code !== 0 && code !== null) {
      console.log(`[Prod] Restarting ${name} in 3s...`);
      setTimeout(() => startProcess(name, script), 3000);
    }
  });

  children.push(child);
  return child;
}

// Start the Express server (serves client + API + Socket.io)
startProcess('Server', path.join(__dirname, 'server', 'index.js'));

// Start the Discord bot
startProcess('Bot', path.join(__dirname, 'bot', 'index.js'));

// Graceful shutdown
function shutdown(signal) {
  console.log(`[Prod] Received ${signal}, shutting down...`);
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
