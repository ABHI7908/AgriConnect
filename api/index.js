'use strict';

if (process.env.VERCEL && !process.env.UPLOAD_DIR) {
  process.env.UPLOAD_DIR = '/tmp/agriconnect-uploads';
}

const app = require('../src/app');
const { bootstrap } = require('../src/services/bootstrap');

let initialization;

module.exports = async function handler(req, res) {
  if (!initialization) initialization = bootstrap();
  await initialization;
  return app(req, res);
};
