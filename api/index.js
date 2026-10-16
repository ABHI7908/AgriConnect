'use strict';

if (process.env.VERCEL && !process.env.UPLOAD_DIR) {
  process.env.UPLOAD_DIR = '/tmp/agriconnect-uploads';
}

const app = require('../src/app');
const { bootstrap } = require('../src/services/bootstrap');

let initialization;

module.exports = async function handler(req, res) {
  try {
    if (!initialization) initialization = bootstrap();
    await initialization;
  } catch (err) {
    initialization = undefined; // retry on the next request
    console.error('Bootstrap failed:', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: { code: 'STARTING', message: 'Service is starting, please retry.' } }));
  }
  return app(req, res);
};
