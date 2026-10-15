'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');

function serverIsReady() {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: '127.0.0.1', port: 3000, path: '/healthz', timeout: 1500 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      }
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function main() {
  if (await serverIsReady()) {
    console.log('AgriConnect is already running at http://localhost:3000.');
    return;
  }

  const server = spawn(process.execPath, ['--watch', 'src/server.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  server.on('error', (error) => {
    console.error('Could not start the AgriConnect development server:', error.message);
    process.exitCode = 1;
  });
  server.on('exit', (code, signal) => {
    if (signal) {
      console.error(`AgriConnect development server stopped (${signal}).`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error('Could not check the AgriConnect server:', error.message);
  process.exitCode = 1;
});
