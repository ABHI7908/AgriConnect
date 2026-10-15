'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const logDirectory = path.join(projectRoot, 'data', 'logs');
const logPath = path.join(logDirectory, 'local-server.log');
const pidPath = path.join(projectRoot, 'data', 'agriconnect-server.pid');
const lockPath = path.join(projectRoot, 'data', 'agriconnect-server-launch.lock');
const forceRestart = process.argv.includes('--force');

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function serverIsHealthy() {
  try {
    const response = await fetch('http://127.0.0.1:3000/healthz', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const health = await response.json();
    return health.status === 'ok';
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(logDirectory, { recursive: true });

  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') return;
    throw error;
  }

  try {
    if (await serverIsHealthy()) {
      fs.rmSync(pidPath, { force: true });
      return;
    }

    if (fs.existsSync(pidPath)) {
      const pid = Number(fs.readFileSync(pidPath, 'utf8'));
      if (Number.isInteger(pid) && pid > 0 && processExists(pid)) {
        if (!forceRestart) return;
        process.kill(pid, 'SIGTERM');
        for (let attempt = 0; attempt < 20 && processExists(pid); attempt += 1) {
          // Allow Windows to release the server port before starting its replacement.
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (processExists(pid)) process.kill(pid, 'SIGKILL');
      }
      fs.rmSync(pidPath, { force: true });
    }

    fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] Launching detached AgriConnect server on localhost:3000\n`);
    const logFd = fs.openSync(logPath, 'a');
    const server = spawn(process.execPath, ['src/server.js'], {
      cwd: projectRoot,
      detached: true,
      env: process.env,
      stdio: ['ignore', logFd, logFd],
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('spawn', () => {
        fs.writeFileSync(pidPath, String(server.pid));
        server.unref();
        resolve();
      });
    }).finally(() => fs.closeSync(logFd));
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockPath, { force: true });
  }
}

main().catch((error) => {
  console.error('Could not launch the AgriConnect server:', error.message);
  process.exitCode = 1;
});
