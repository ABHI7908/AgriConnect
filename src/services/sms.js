'use strict';

const config = require('../config');
const { AppError } = require('../utils/errors');
const { maskPhone } = require('../utils/phone');

const TIMEOUT_MS = 10000;

async function postWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const providers = {
  // Development only: prints the OTP to the server log. Refused by config.js in production.
  async console(phone, code) {
    // eslint-disable-next-line no-console
    console.log(`[sms:console] OTP for ${phone}: ${code}`);
  },

  async twilio(phone, code) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = config;
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `${code} is your AgriConnect verification code. It is valid for ${Math.round(config.OTP_TTL_SECONDS / 60)} minutes. Do not share it.`,
    });
    const res = await postWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Twilio responded ${res.status}: ${text.slice(0, 200)}`);
    }
  },

  async msg91(phone, code) {
    const mobile = phone.replace(/^\+/, '');
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', config.MSG91_TEMPLATE_ID);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', code);
    url.searchParams.set('otp_expiry', String(Math.max(1, Math.round(config.OTP_TTL_SECONDS / 60))));
    const res = await postWithTimeout(url, {
      method: 'POST',
      headers: { authkey: config.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.type === 'error') {
      throw new Error(`MSG91 responded ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
  },
};

async function sendOtpSms(phone, code) {
  const send = providers[config.SMS_PROVIDER];
  try {
    await send(phone, code);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`SMS delivery failed for ${maskPhone(phone)} via ${config.SMS_PROVIDER}:`, err.message);
    throw new AppError(502, 'We could not send the OTP right now. Please try again in a moment.', 'SMS_FAILED');
  }
}

module.exports = { sendOtpSms };
