// Registration verifies a new mobile before creating the account. Existing users can sign in by OTP or password.
import { api } from './lib/api.js';
import { initPage, resetUser, homeFor } from './lib/session.js';
import { $, $$, withBusy } from './lib/dom.js';

const params = new URLSearchParams(location.search);
let role = params.get('role') === 'owner' ? 'owner' : 'farmer';
let loginPhone = '';
let registration = null;
let loginOtp = '';
let resetDetails = null;

function destinationFor(user) {
  if (user.role === 'admin') return '/admin';

  const requested = params.get('next');
  if (requested) {
    try {
      const destination = new URL(requested, location.origin);
      const allowed = destination.origin === location.origin &&
        (destination.pathname === '/' || destination.pathname === '/calculator' ||
          (user.role === 'farmer' && destination.pathname === '/farmer') ||
          (user.role === 'owner' && destination.pathname === '/owner'));
      if (allowed) return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
      // Ignore malformed return paths and use the user's normal dashboard.
    }
  }
  return homeFor(user.role);
}

function fieldError(id, message = '') {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

function showScreen(name) {
  $$('[data-screen]').forEach((section) => section.classList.toggle('hidden', section.dataset.screen !== name));
  $$('[data-screen-button]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.screenButton === name));
  });
  const roleLocked = name === 'login-otp' || name === 'register-otp' || name === 'registration-complete' ||
    name === 'password-reset-otp' || name === 'password-reset-complete';
  $$('[data-role]').forEach((button) => { button.disabled = roleLocked; });
  const focusTarget = {
    login: '#login-phone',
    register: '#register-name',
    'login-otp': '#login-otp-code',
    'register-otp': '#register-otp-code',
    'registration-complete': '#go-to-login',
    'password-reset-otp': '#reset-otp-code',
    'password-reset-complete': '#reset-go-to-login',
  }[name];
  $(focusTarget)?.focus();
}

function setRole(nextRole) {
  role = nextRole;
  $$('[data-role]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.role === role));
  });
}

function normalizePhone(value) {
  return value.replace(/[\s-]/g, '');
}

function validPhone(value) {
  return /^(\+?91)?0?[6-9]\d{9}$/.test(value);
}

function finish(user) {
  resetUser();
  const destination = destinationFor(user);
  location.href = user.role === 'owner' && !user.profileComplete ? '/owner#profile' : destination;
}

function setDevOtp(target, response) {
  const element = $(target);
  if (response.devOtp) {
    element.textContent = `Development mode: your OTP is ${response.devOtp}`;
    element.classList.remove('hidden');
  } else {
    element.textContent = '';
    element.classList.add('hidden');
  }
}

$$('[data-role]').forEach((button) => button.addEventListener('click', () => setRole(button.dataset.role)));
$$('[data-screen-button]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screenButton)));
$$('[data-login-method]').forEach((button) => button.addEventListener('click', () => {
  const isOtp = button.dataset.loginMethod === 'otp';
  $$('[data-login-method]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice === button)));
  $('#login-otp-panel').classList.toggle('hidden', !isOtp);
  $('#password-form').classList.toggle('hidden', isOtp);
}));
$$('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => {
  const input = button.parentElement.querySelector('input');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(visible));
  const label = visible ? 'Hide password' : 'Show password';
  button.setAttribute('aria-label', label);
  button.setAttribute('data-original-aria-label', label);
}));

$('#send-login-otp').addEventListener('click', async (event) => {
  loginPhone = normalizePhone($('#login-phone').value);
  if (!validPhone(loginPhone)) {
    fieldError('#login-otp-error', 'Enter a valid 10-digit mobile number');
    return;
  }
  fieldError('#login-otp-error');
  try {
    const response = await withBusy(event.currentTarget, () => api.post('/auth/otp/request', { phone: loginPhone, role }));
    $('#login-otp-phone').textContent = loginPhone;
    setDevOtp('#login-dev-otp', response);
    $('#login-otp-code').value = '';
    fieldError('#login-otp-verify-error');
    loginOtp = role;
    showScreen('login-otp');
  } catch (error) {
    fieldError('#login-otp-error', error.message);
  }
});

$('#resend-login-otp').addEventListener('click', async (event) => {
  fieldError('#login-otp-verify-error');
  try {
    const response = await withBusy(event.currentTarget, () =>
      api.post('/auth/otp/request', { phone: loginPhone, role: loginOtp }));
    setDevOtp('#login-dev-otp', response);
  } catch (error) {
    fieldError('#login-otp-verify-error', error.message);
  }
});

$('#login-otp-code').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 8);
});

$('#login-otp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#login-otp-code').value.trim();
  if (!code) {
    fieldError('#login-otp-verify-error', 'Enter the one-time password');
    return;
  }
  try {
    const response = await withBusy(event.currentTarget.querySelector('[type=submit]'), () =>
      api.post('/auth/otp/verify', { phone: loginPhone, role: loginOtp, code }));
    finish(response.user);
  } catch (error) {
    fieldError('#login-otp-verify-error', error.message);
  }
});

$('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = normalizePhone($('#login-phone').value);
  const password = $('#login-password').value;
  if (!validPhone(phone)) {
    fieldError('#password-error', 'Enter a valid 10-digit mobile number');
    return;
  }
  fieldError('#password-error');
  try {
    const response = await withBusy(event.currentTarget.querySelector('[type=submit]'), () =>
      api.post('/auth/password/login', { phone, role, password }));
    finish(response.user);
  } catch (error) {
    fieldError('#password-error', error.message);
  }
});

$('#forgot-password').addEventListener('click', async (event) => {
  const phone = normalizePhone($('#login-phone').value);
  if (!validPhone(phone)) {
    fieldError('#password-error', 'Enter your registered mobile number first');
    return;
  }
  fieldError('#password-error');
  try {
    const response = await withBusy(event.currentTarget, () =>
      api.post('/auth/otp/request', { phone, role }));
    resetDetails = { phone, role };
    $('#reset-otp-phone').textContent = phone;
    $('#reset-otp-code').value = '';
    $('#reset-password').value = '';
    $('#reset-confirm-password').value = '';
    setDevOtp('#reset-dev-otp', response);
    fieldError('#reset-password-error');
    showScreen('password-reset-otp');
  } catch (error) {
    fieldError('#password-error', error.message);
  }
});

$('#reset-otp-code').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 8);
});

$('#password-reset-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!resetDetails) {
    showScreen('login');
    fieldError('#password-error', 'Please request a password reset again.');
    return;
  }
  const password = $('#reset-password').value;
  if (password.length < 8) {
    fieldError('#reset-password-error', 'Password must contain at least 8 characters');
    return;
  }
  if (password !== $('#reset-confirm-password').value) {
    fieldError('#reset-password-error', 'The passwords do not match');
    return;
  }
  const code = $('#reset-otp-code').value.trim();
  if (!code) {
    fieldError('#reset-password-error', 'Enter the one-time password');
    return;
  }
  try {
    await withBusy(event.currentTarget.querySelector('[type=submit]'), () =>
      api.post('/auth/password/reset', { ...resetDetails, code, password }));
    resetDetails = null;
    showScreen('password-reset-complete');
  } catch (error) {
    fieldError('#reset-password-error', error.message);
  }
});

$('#resend-reset-otp').addEventListener('click', async (event) => {
  if (!resetDetails) return;
  fieldError('#reset-password-error');
  try {
    const response = await withBusy(event.currentTarget, () => api.post('/auth/otp/request', resetDetails));
    setDevOtp('#reset-dev-otp', response);
  } catch (error) {
    fieldError('#reset-password-error', error.message);
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  fieldError('#register-error');
  const phone = normalizePhone(form.phone.value);
  const values = {
    role,
    name: form.name.value.trim(),
    email: form.email.value.trim().toLowerCase(),
    phone,
    password: form.password.value,
  };
  if (values.name.length < 2) {
    fieldError('#register-error', 'Enter your name');
    return;
  }
  if (!validPhone(phone)) {
    fieldError('#register-error', 'Enter a valid 10-digit mobile number');
    return;
  }
  if (values.password.length < 8) {
    fieldError('#register-error', 'Password must contain at least 8 characters');
    return;
  }
  if (values.password !== form.confirmPassword.value) {
    fieldError('#register-error', 'The passwords do not match');
    return;
  }

  try {
    const response = await withBusy(form.querySelector('[type=submit]'), () =>
      api.post('/auth/register/otp/request', values));
    registration = values;
    $('#register-otp-phone').textContent = phone;
    $('#register-otp-code').value = '';
    setDevOtp('#register-dev-otp', response);
    fieldError('#register-otp-error');
    showScreen('register-otp');
  } catch (error) {
    fieldError('#register-error', error.message);
  }
});

$('#register-otp-code').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 8);
});

$('#register-otp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!registration) {
    showScreen('register');
    fieldError('#register-error', 'Please enter your registration details again.');
    return;
  }
  const code = $('#register-otp-code').value.trim();
  if (!code) {
    fieldError('#register-otp-error', 'Enter the verification code');
    return;
  }
  try {
    await withBusy(event.currentTarget.querySelector('[type=submit]'), () =>
      api.post('/auth/register/verify', { ...registration, code }));
    $('#login-phone').value = registration.phone;
    $('#register-password').value = '';
    $('#register-confirm-password').value = '';
    registration = null;
    showScreen('registration-complete');
  } catch (error) {
    fieldError('#register-otp-error', error.message);
  }
});

$('#resend-register-otp').addEventListener('click', async (event) => {
  if (!registration) return;
  fieldError('#register-otp-error');
  try {
    const response = await withBusy(event.currentTarget, () =>
      api.post('/auth/register/otp/request', registration));
    setDevOtp('#register-dev-otp', response);
  } catch (error) {
    fieldError('#register-otp-error', error.message);
  }
});

$('#back-to-login').addEventListener('click', () => showScreen('login'));
$('#back-to-register').addEventListener('click', () => showScreen('register'));
$('#back-from-reset').addEventListener('click', () => {
  resetDetails = null;
  showScreen('login');
});
$('#go-to-login').addEventListener('click', () => {
  showScreen('login');
  $('[data-login-method="otp"]').click();
});
$('#reset-go-to-login').addEventListener('click', () => {
  $('#login-phone').value = resetDetails?.phone || $('#login-phone').value;
  resetDetails = null;
  $('[data-login-method="password"]').click();
  showScreen('login');
});

setRole(role);
initPage('login').then((user) => {
  if (!user) return;
  if (user.role === 'admin') { location.replace(destinationFor(user)); return; }
  setRole(user.role);
  location.replace(destinationFor(user));
});
