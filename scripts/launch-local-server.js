'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const logDirectory = path.join(projectRoot, 'data', 'logs');
const logPath = path.join(logDirectory, 'local-server.log');

fs.mkdirSync(logDirectory, { recursive: true });
fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] Launching detached AgriConnect server on localhost:3000\n`);

const logFd = fs.openSync(logPath, 'a');
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: projectRoot,
  detached: true,
  env: process.env,
  stdio: ['ignore', logFd, logFd],
});

server.once('error', (error) => {
  fs.closeSync(logFd);
  console.error('Could not launch the AgriConnect server:', error.message);
  process.exitCode = 1;
});

server.once('spawn', () => {
  server.unref();
  fs.closeSync(logFd);
  console.log(`Started detached AgriConnect server (PID ${server.pid}).`);
});
