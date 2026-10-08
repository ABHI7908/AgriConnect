'use strict';

const config = require('./config');
const db = require('./db');
const { bootstrap } = require('./services/bootstrap');
const { purgeOldOtps } = require('./services/otp');
const app = require('./app');

let server;
let purgeTimer;

async function start() {
  await bootstrap();
  server = app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`AgriConnect listening on ${config.APP_URL.replace(/\/$/, '')} (port ${config.PORT}, ${config.NODE_ENV})`);
    if (config.SMS_PROVIDER === 'console') {
      // eslint-disable-next-line no-console
      console.log('SMS_PROVIDER=console: OTPs are printed in this log. Configure Twilio or MSG91 before going live.');
    }
  });

  purgeTimer = setInterval(async () => {
    try {
      await purgeOldOtps();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('OTP purge failed', err.message);
    }
  }, 60 * 60 * 1000);
  purgeTimer.unref();
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Application startup failed', err);
  process.exitCode = 1;
  db.close().finally(() => process.exit(1));
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down...`);
  if (purgeTimer) clearInterval(purgeTimer);
  if (!server) {
    db.close().finally(() => process.exit(0));
    return;
  }
  server.close(() => {
    db.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection:', reason);
});
