'use strict';

/**
 * End-to-end smoke test. Boots the real app on a throw-away database and walks through
 * the main flows: OTP login, owner listing + photo upload, admin moderation, nearest search,
 * booking lifecycle + history, labour, calculator / GPS area, blocking.
 *
 *   npm test
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://agriconnect:agriconnect@localhost/agriconnect_test',
  SQLITE_SOURCE_PATH: path.join(tmp, 'test.db'),
  UPLOAD_DIR: path.join(tmp, 'uploads'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  OTP_PEPPER: crypto.randomBytes(16).toString('hex'),
  SMS_PROVIDER: 'console',
  OTP_RESEND_COOLDOWN_SECONDS: '0',
  OTP_GLOBAL_MAX_PER_HOUR: '1000',
  LISTINGS_REQUIRE_APPROVAL: 'true',
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: 'Sup3r-Secret-Admin!',
  DB_MANAGER_EMAIL: 'dbadmin@test.local',
  DB_MANAGER_PASSWORD: 'Database-Manager-Super-Secret!',
});

// Silence the console SMS provider's OTP line; the test reads the OTP from the API response instead.
const realLog = console.log;
console.log = (...a) => { if (!String(a[0]).startsWith('[sms:console]')) realLog(...a); };

const db = require('../src/db');
const { apiKey } = require('../src/middleware/rateLimit');
const { bootstrap } = require('../src/services/bootstrap');
const storage = require('../src/services/storage');
const app = require('../src/app');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    realLog(`  ok   ${name}`);
  } else {
    failed += 1;
    realLog(`  FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
  }
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function makeClient(base) {
  let cookie = '';
  async function request(method, url, { json, form, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    if (csrf) h['x-requested-with'] = 'agriconnect';
    if (cookie) h.cookie = cookie;
    let body;
    if (json !== undefined) {
      h['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const res = await fetch(base + url, { method, headers: h, body });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const pair = c.split(';')[0];
      if (pair.endsWith('=') || /Expires=Thu, 01 Jan 1970/i.test(c)) cookie = '';
      else cookie = pair;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u, o) => request('GET', u, o),
    post: (u, json, o) => request('POST', u, { json, ...o }),
    put: (u, json, o) => request('PUT', u, { json, ...o }),
    patch: (u, json, o) => request('PATCH', u, { json, ...o }),
    del: (u, o) => request('DELETE', u, o),
    send: request,
    reset: () => { cookie = ''; },
  };
}

async function loginWithOtp(c, phone, role) {
  const r = await c.post('/api/auth/otp/request', { phone, role });
  if (r.status !== 200 || !r.data.devOtp) throw new Error(`OTP request failed: ${JSON.stringify(r.data)}`);
  return { otp: r.data.devOtp, verify: (code) => c.post('/api/auth/otp/verify', { phone, role, code: code ?? r.data.devOtp }) };
}

async function registerWithOtp(c, phone, role, name, email, password = 'User-Password-123!') {
  const details = { phone, role, name, email, password };
  const response = await c.post('/api/auth/register/otp/request', details);
  if (response.status !== 200 || !response.data.devOtp) {
    throw new Error(`Registration OTP request failed: ${JSON.stringify(response.data)}`);
  }
  return {
    details,
    otp: response.data.devOtp,
    verify: (code) => c.post('/api/auth/register/verify', { ...details, code: code ?? response.data.devOtp }),
  };
}

function toolForm(over = {}, withImage = true) {
  const f = new FormData();
  const fields = {
    category: 'tractor', name: 'Mahindra 575 DI', brand: 'Mahindra', model: '575 DI', year: '2021',
    description: 'Well maintained 45 HP tractor', pricePerDay: '2500', pricePerHour: '400', pricePerAcre: '',
    withOperator: 'true', village: 'Shamirpet', district: 'Medchal', state: 'Telangana',
    lat: '17.5700', lng: '78.5700', serviceRadiusKm: '40', ...over,
  };
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  if (withImage) f.append('images', new Blob([PNG], { type: 'image/png' }), 'tractor.png');
  return f;
}

async function main() {
  await bootstrap();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = makeClient(base);
  const farmer = makeClient(base);
  const farmer2 = makeClient(base);
  const admin = makeClient(base);
  const anon = makeClient(base);

  realLog('\nBasics');
  const health = await anon.get('/healthz');
  check('health endpoint', health.status === 200 && health.data.status === 'ok');
  const meta = await anon.get('/api/meta');
  check('meta lists categories', meta.status === 200 && meta.data.categories.some((c) => c.id === 'drone'));
  check('map metadata includes key-free street and satellite tiles', !!meta.data.map?.street?.url && !!meta.data.map?.satellite?.url);
  const leafletScript = await anon.get('/vendor/leaflet/leaflet.js');
  const homePage = await anon.get('/');
  const homeHtml = Buffer.from(homePage.data).toString();
  check('Leaflet is served locally without a map API key', leafletScript.status === 200 && leafletScript.headers.get('content-type')?.includes('javascript') && homePage.status === 200 && homeHtml.includes('/vendor/leaflet/leaflet.js'));
  const noCsrf = await anon.send('POST', '/api/auth/otp/request', { json: { phone: '9876543210', role: 'farmer' }, csrf: false });
  check('state-changing request without CSRF header is rejected', noCsrf.status === 403);
  check('security headers present', !!health.headers.get('content-security-policy') && health.headers.get('x-powered-by') === null);
  check('street and satellite tile origins are permitted by the content security policy', /tile\.openstreetmap\.org/.test(health.headers.get('content-security-policy') || '') && /arcgisonline\.com/.test(health.headers.get('content-security-policy') || ''));
  check(
    'API rate limits are isolated per authenticated user',
    apiKey({ user: { id: 1 }, ip: '127.0.0.1' }) !== apiKey({ user: { id: 2 }, ip: '127.0.0.1' })
  );
  check(
    'anonymous API rate limits remain scoped to the client IP',
    apiKey({ ip: '127.0.0.1' }) === apiKey({ ip: '127.0.0.1' })
  );

  realLog('\nRegistration and sign-in (owner)');
  const badPhone = await anon.post('/api/auth/otp/request', { phone: '12345', role: 'owner' });
  check('invalid phone rejected', badPhone.status === 400);
  const unknownOtp = await anon.post('/api/auth/otp/request', { phone: '9000000001', role: 'owner' });
  check('unknown mobile must register before OTP login', unknownOtp.status === 404);
  const invalidRegistration = await anon.post('/api/auth/register/otp/request', {
    phone: '9000000001', role: 'owner', name: 'Ravi Kumar', email: 'not-an-email', password: 'User-Password-123!',
  });
  check('registration requires a valid email address', invalidRegistration.status === 400);
  const ownerReg = await registerWithOtp(owner, '9000000001', 'owner', 'Ravi Kumar', 'ravi.owner@test.local');
  const wrong = await owner.post('/api/auth/register/verify', {
    ...ownerReg.details,
    code: ownerReg.otp === '000000' ? '111111' : '000000',
  });
  check('wrong OTP rejected', wrong.status === 400);
  const ok = await ownerReg.verify();
  check('verified registration creates named email account without logging in', ok.status === 201 && ok.data.registered && ok.data.user.role === 'owner' && ok.data.user.name === 'Ravi Kumar' && ok.data.user.email === 'ravi.owner@test.local');
  const ownerCredential = await db.prepare('SELECT password_hash FROM users WHERE phone = ? AND role = ?').get('+919000000001', 'owner');
  check('account password is persisted only as a bcrypt hash', /^\$2[aby]\$/.test(ownerCredential.password_hash) && !ownerCredential.password_hash.includes(ownerReg.details.password));
  const noAutoLogin = await owner.get('/api/tools/mine/list');
  check('registration requires a separate login', noAutoLogin.status === 401);
  const wrongPassword = await anon.post('/api/auth/password/login', { phone: '9000000001', role: 'owner', password: 'wrong-password' });
  check('incorrect registered-user password rejected', wrongPassword.status === 401);
  const passwordLogin = await owner.post('/api/auth/password/login', { phone: '9000000001', role: 'owner', password: ownerReg.details.password });
  check('registered user can log in with mobile and password', passwordLogin.status === 200 && passwordLogin.data.user.email === 'ravi.owner@test.local');
  const resetSession = makeClient(base);
  await resetSession.post('/api/auth/password/login', { phone: '9000000001', role: 'owner', password: ownerReg.details.password });
  const resetOtp = await loginWithOtp(anon, '9000000001', 'owner');
  const invalidReset = await anon.post('/api/auth/password/reset', {
    phone: '9000000001', role: 'owner', code: resetOtp.otp === '000000' ? '111111' : '000000', password: 'Changed-Password-456!',
  });
  check('password reset rejects an incorrect OTP', invalidReset.status === 400);
  const changedPassword = await anon.post('/api/auth/password/reset', {
    phone: '9000000001', role: 'owner', code: resetOtp.otp, password: 'Changed-Password-456!',
  });
  check('verified OTP allows password reset', changedPassword.status === 200 && changedPassword.data.ok);
  const oldPasswordLogin = await anon.post('/api/auth/password/login', { phone: '9000000001', role: 'owner', password: ownerReg.details.password });
  const newPasswordLogin = await anon.post('/api/auth/password/login', { phone: '9000000001', role: 'owner', password: 'Changed-Password-456!' });
  check('password reset replaces the old password', oldPasswordLogin.status === 401 && newPasswordLogin.status === 200);
  check('password reset invalidates existing sessions', (await resetSession.get('/api/tools/mine/list')).status === 401);
  const duplicateRegistration = await anon.post('/api/auth/register/otp/request', ownerReg.details);
  check('existing mobile cannot register again', duplicateRegistration.status === 409);
  const duplicateEmail = await anon.post('/api/auth/register/otp/request', {
    phone: '9000000004', role: 'farmer', name: 'Duplicate Email', email: ownerReg.details.email, password: ownerReg.details.password,
  });
  check('existing email cannot register another account', duplicateEmail.status === 409);
  owner.reset();
  const ownerOtp = await loginWithOtp(owner, '9000000001', 'owner');
  const ownerOtpLogin = await ownerOtp.verify();
  check('registered user can also log in with mobile OTP', ownerOtpLogin.status === 200 && ownerOtpLogin.data.user.role === 'owner');
  const reuse = await owner.post('/api/auth/otp/verify', { phone: '9000000001', role: 'owner', code: ownerOtp.otp });
  check('OTP cannot be reused', reuse.status === 400);
  const noProfileTool = await owner.send('POST', '/api/tools', { form: toolForm() });
  check('owner must complete profile before listing', noProfileTool.status === 403 && noProfileTool.data.error.code === 'PROFILE_INCOMPLETE');
  const prof = await owner.put('/api/auth/me', {
    name: 'Ravi Kumar', businessName: 'Ravi Agro Rentals', village: 'Shamirpet', district: 'Medchal', state: 'Telangana',
    lat: 17.57, lng: 78.57,
  });
  check('owner profile saved', prof.status === 200 && prof.data.user.profileComplete === true);

  realLog('\nOwner lists a tractor with photo');
  const badImg = new FormData();
  Object.entries({ category: 'tractor', name: 'Fake', pricePerDay: '100', lat: '17.5', lng: '78.5' }).forEach(([k, v]) => badImg.append(k, v));
  badImg.append('images', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'evil.png');
  const rejected = await owner.send('POST', '/api/tools', { form: badImg });
  check('fake image (wrong magic bytes) rejected', rejected.status === 400, rejected.data);
  const noImg = await owner.send('POST', '/api/tools', { form: toolForm({}, false) });
  check('listing without photo rejected', noImg.status === 400);
  const noPrice = await owner.send('POST', '/api/tools', { form: toolForm({ pricePerDay: '', pricePerHour: '' }) });
  check('listing without any price rejected', noPrice.status === 400);
  const created = await owner.send('POST', '/api/tools', { form: toolForm() });
  check('tool created (pending approval)', created.status === 201 && created.data.tool.status === 'pending' && created.data.tool.images.length === 1, created.data);
  const toolId = created.data.tool.id;
  const imgUrl = created.data.tool.images[0].url;
  const img = await anon.get(imgUrl);
  const uploadedImageRow = await db.prepare('SELECT filename, data FROM tool_images WHERE tool_id = ?').get(toolId);
  check(
    'uploaded photo bytes are stored in PostgreSQL',
    uploadedImageRow.data instanceof Buffer && uploadedImageRow.data.equals(PNG) && uploadedImageRow.filename === imgUrl.split('/').pop()
  );
  check('PostgreSQL photo is served by its existing URL', img.status === 200 && img.headers.get('content-type') === 'image/png' && img.headers.get('x-content-type-options') === 'nosniff' && Buffer.from(img.data).equals(PNG));
  await db.prepare('UPDATE tool_images SET data = NULL WHERE tool_id = ?').run(toolId);
  fs.writeFileSync(path.join(tmp, 'uploads', uploadedImageRow.filename), PNG);
  const importedImages = await storage.migrateLegacyImages();
  const importedImageRow = await db.prepare('SELECT data FROM tool_images WHERE tool_id = ?').get(toolId);
  check(
    'legacy uploaded photos are migrated from disk into PostgreSQL',
    importedImages === 1 && importedImageRow.data instanceof Buffer && importedImageRow.data.equals(PNG) &&
      !fs.existsSync(path.join(tmp, 'uploads', uploadedImageRow.filename))
  );

  const pre = await anon.get('/api/tools?lat=17.5&lng=78.5&radiusKm=100');
  check('pending listing is not publicly visible', pre.status === 200 && pre.data.total === 0);
  const forbiddenCreate = await farmer.send('POST', '/api/tools', { form: toolForm() });
  check('anonymous cannot create tools', forbiddenCreate.status === 401);

  realLog('\nAdmin moderation');
  const badAdmin = await admin.post('/api/auth/admin/login', { email: 'admin@test.local', password: 'wrong-password' });
  check('wrong admin password rejected', badAdmin.status === 401);
  const adminLogin = await admin.post('/api/auth/admin/login', { email: 'admin@test.local', password: process.env.ADMIN_PASSWORD });
  check('admin logs in', adminLogin.status === 200 && adminLogin.data.user.role === 'admin');
  const repeatedAdminLogins = [];
  for (let attempt = 0; attempt < 11; attempt += 1) {
    repeatedAdminLogins.push(await admin.post('/api/auth/admin/login', {
      email: 'admin@test.local',
      password: process.env.ADMIN_PASSWORD,
    }));
  }
  check(
    'successful admin logins do not consume the failed-login rate limit',
    repeatedAdminLogins.every((response) => response.status === 200),
    repeatedAdminLogins.map((response) => response.status)
  );
  const asOwner = await owner.get('/api/admin/stats');
  check('non-admin cannot reach admin API', asOwner.status === 403);
  const pending = await admin.get('/api/admin/tools?status=pending');
  check('admin sees pending tool with owner phone', pending.status === 200 && pending.data.total === 1 && pending.data.items[0].ownerPhone === '+919000000001');
  const rejectNoNote = await admin.patch(`/api/admin/tools/${toolId}/status`, { status: 'rejected' });
  check('rejecting requires a reason', rejectNoNote.status === 400);
  const approve = await admin.patch(`/api/admin/tools/${toolId}/status`, { status: 'approved' });
  check('admin approves tool', approve.status === 200);

  realLog('\nFarmer: nearest search');
  const farmerOtp = await registerWithOtp(farmer, '9000000002', 'farmer', 'Suresh Reddy', 'suresh.farmer@test.local');
  const fv = await farmerOtp.verify();
  check('farmer completes required registration', fv.status === 201 && fv.data.registered && fv.data.user.profileComplete);
  await farmer.post('/api/auth/password/login', { phone: '9000000002', role: 'farmer', password: farmerOtp.details.password });
  await farmer.put('/api/auth/me', { name: 'Suresh Reddy', village: 'Kompally', district: 'Medchal', state: 'Telangana', lat: 17.54, lng: 78.49 });
  const near = await farmer.get('/api/tools?lat=17.54&lng=78.49&radiusKm=50&category=tractor');
  check('nearest search finds the tractor with distance', near.status === 200 && near.data.total === 1 && near.data.items[0].distanceKm > 5 && near.data.items[0].distanceKm < 15, near.data.items?.[0]?.distanceKm);
  const far = await farmer.get('/api/tools?lat=28.6139&lng=77.209&radiusKm=50');
  check('far-away search (Delhi) returns nothing', far.data.total === 0);
  const tight = await farmer.get('/api/tools?lat=17.54&lng=78.49&radiusKm=2');
  check('small radius excludes it', tight.data.total === 0);
  const detail = await anon.get(`/api/tools/${toolId}`);
  check('tool detail has no owner phone', detail.status === 200 && JSON.stringify(detail.data).includes('+919000000001') === false);

  realLog('\nBooking lifecycle & history');
  const farmerCannotList = await farmer.send('POST', '/api/tools', { form: toolForm() });
  check('farmer cannot create tools (role check)', farmerCannotList.status === 403);
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const book = await farmer.post('/api/bookings', { kind: 'tool', toolId, startDate: day(2), endDate: day(3), landAcres: 4, workAddress: 'Kompally farm', notes: 'Need ploughing' });
  check('farmer requests booking with quote', book.status === 201 && book.data.booking.quotedAmount === 5000 && book.data.booking.counterpart.phone === null, book.data);
  const bid = book.data.booking.id;
  const ownerNotifications = await owner.get('/api/communications/notifications');
  const bookingChat = await owner.get(`/api/communications/chats/booking/${bid}`);
  const farmerBookingChat = await farmer.get(`/api/communications/chats/booking/${bid}`);
  const requestChatMessages = bookingChat.status === 200
    ? await owner.get(`/api/communications/chats/${bookingChat.data.id}/messages`)
    : { status: 0, data: { items: [] } };
  check(
    'booking message entry resolves the same private chat for both participants',
    ownerNotifications.status === 200 && ownerNotifications.data.unreadCount === 1 &&
      ownerNotifications.data.items[0].kind === 'booking_request' &&
      ownerNotifications.data.items[0].booking_id === bid &&
      ownerNotifications.data.items[0].chat_id === bookingChat.data.id &&
      bookingChat.status === 200 && farmerBookingChat.status === 200 &&
      farmerBookingChat.data.id === bookingChat.data.id &&
      requestChatMessages.data.items.some((message) => message.isSystem && message.body.includes('Booking request raised'))
  );
  const dup = await farmer.post('/api/bookings', { kind: 'tool', toolId, startDate: day(2), endDate: day(3) });
  check('duplicate pending request blocked', dup.status === 409);
  const wrongFarmerCancel = await farmer2.patch(`/api/bookings/${bid}/status`, { status: 'cancelled' });
  check('other users cannot touch a booking', wrongFarmerCancel.status === 401);
  const ownerList = await owner.get('/api/bookings?status=requested');
  check('owner sees the request', ownerList.data.total === 1 && ownerList.data.items[0].counterpart.name === 'Suresh Reddy' && ownerList.data.items[0].counterpart.phone === null);
  const farmerActive = await farmer.get('/api/bookings?status=active');
  const farmerPast = await farmer.get('/api/bookings?status=history');
  const ownerActive = await owner.get('/api/bookings?status=active');
  check('active booking filter includes pending requests for both roles', farmerActive.data.total === 1 && ownerActive.data.total === 1);
  check('past booking filter excludes pending requests', farmerPast.data.total === 0);
  const badJump = await owner.patch(`/api/bookings/${bid}/status`, { status: 'completed' });
  check('invalid status jump blocked', badJump.status === 409);
  const accept = await owner.patch(`/api/bookings/${bid}/status`, { status: 'accepted' });
  const acceptedChatMessages = bookingChat.status === 200
    ? await farmer.get(`/api/communications/chats/${bookingChat.data.id}/messages`)
    : { status: 0, data: { items: [] } };
  check('owner accepts', accept.status === 200 && accept.data.booking.counterpart.phone === '+919000000002');
  const farmerNotifications = await farmer.get('/api/communications/notifications');
  check(
    'booking acceptance appears in the chat and notification with its type identified',
    farmerNotifications.status === 200 && farmerNotifications.data.unreadCount === 1 &&
      farmerNotifications.data.items[0].kind === 'booking_status' &&
      farmerNotifications.data.items[0].title === 'Booking accepted' &&
      farmerNotifications.data.items[0].chat_id === bookingChat.data.id &&
      acceptedChatMessages.status === 200 &&
      acceptedChatMessages.data.items.some((message) => message.isSystem && message.body.includes('Booking accepted'))
  );
  const fview = await farmer.get(`/api/bookings/${bid}`);
  check('farmer now sees owner contact', fview.data.booking.counterpart.phone === '+919000000001');

  const f2Otp = await registerWithOtp(farmer2, '9000000003', 'farmer', 'Anil Goud', 'anil.farmer@test.local');
  await f2Otp.verify();
  const f2LoginOtp = await loginWithOtp(farmer2, '9000000003', 'farmer');
  const f2OtpLogin = await f2LoginOtp.verify();
  check('registered secondary farmer signs in using OTP', f2OtpLogin.status === 200);
  const listingForChat = await farmer2.get(`/api/communications/chats/listing?kind=tool&listingId=${toolId}`);
  const inquiry = await farmer2.post('/api/communications/chats', {
    kind: 'tool',
    listingId: toolId,
    body: 'Is the tractor available next week, and can you discuss the final per-acre price?',
    language: 'te',
  });
  const serviceChatId = inquiry.status === 201 ? inquiry.data.id : null;
  const farmerInquiry = inquiry.status === 201
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: {} };
  check(
    'farmer can start a pre-booking chat from a machinery listing without exposing the provider phone',
    listingForChat.status === 200 && inquiry.status === 201 && farmerInquiry.status === 200 &&
      farmerInquiry.data.chat.callPhone === null && farmerInquiry.data.items.length === 2 &&
      farmerInquiry.data.items[0].isSystem && farmerInquiry.data.items[0].body.includes('Welcome to AgriConnect') &&
      farmerInquiry.data.items[1].body.includes('available next week') && farmerInquiry.data.items[1].language === 'te',
    { listing: listingForChat, inquiry, farmerInquiry }
  );
  const providerChats = await owner.get('/api/communications/chats');
  const providerNotifications = await owner.get('/api/communications/notifications');
  const providerRead = serviceChatId ? await owner.get(`/api/communications/chats/${serviceChatId}/messages`) : { status: 0, data: {} };
  const providerCleared = serviceChatId
    ? await owner.post(`/api/communications/chats/${serviceChatId}/messages/read`, {})
    : { status: 0, data: {} };
  check(
    'provider inbox shows the farmer enquiry and can clear its unread notification',
    providerChats.status === 200 && providerChats.data.items.some((chat) => chat.id === serviceChatId && chat.unread_count === 1) &&
      providerNotifications.data.items.some((notification) => notification.kind === 'service_message' && notification.chat_id === serviceChatId) &&
      providerRead.status === 200 && providerRead.data.items.length === 2 &&
      providerRead.data.chat.callPhone === null && providerCleared.data.updated === 1,
    { providerChats, providerNotifications, providerRead, providerCleared }
  );
  const foreignServiceChat = serviceChatId
    ? await farmer.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0 };
  check('service chats are private to the farmer and listing provider', foreignServiceChat.status === 403, foreignServiceChat);
  const voiceForm = new FormData();
  voiceForm.append('language', 'hi');
  voiceForm.append('voice', new Blob([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x01])], { type: 'audio/webm' }), 'voice.webm');
  const voiceSent = serviceChatId
    ? await farmer2.send('POST', `/api/communications/chats/${serviceChatId}/voice`, { form: voiceForm })
    : { status: 0 };
  const voiceMessages = serviceChatId
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: { items: [] } };
  const voiceMessage = voiceMessages.data.items.find((message) => message.hasAudio);
  const voiceAudio = voiceMessage
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages/${voiceMessage.id}/audio`)
    : { status: 0, data: new ArrayBuffer(0) };
  const outsiderAudio = voiceMessage
    ? await farmer.get(`/api/communications/chats/${serviceChatId}/messages/${voiceMessage.id}/audio`)
    : { status: 0 };
  const providerVoiceNotificationsRead = serviceChatId
    ? await owner.post(`/api/communications/chats/${serviceChatId}/messages/read`, {})
    : { status: 0 };
  check(
    'voice notes are stored with language metadata and playable only by chat participants',
    voiceSent.status === 201 && voiceMessage?.language === 'hi' &&
      voiceAudio.status === 200 && voiceAudio.headers.get('content-type') === 'audio/webm' &&
      Buffer.from(voiceAudio.data).subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      outsiderAudio.status === 403 && providerVoiceNotificationsRead.status === 200
  );
  const invalidVoiceForm = new FormData();
  invalidVoiceForm.append('voice', new Blob(['not audio'], { type: 'text/plain' }), 'voice.txt');
  const invalidVoice = serviceChatId
    ? await farmer2.send('POST', `/api/communications/chats/${serviceChatId}/voice`, { form: invalidVoiceForm })
    : { status: 0 };
  check('voice-note upload rejects unsupported MIME types', invalidVoice.status === 400, invalidVoice);
  const providerReply = serviceChatId ? await owner.post(`/api/communications/chats/${serviceChatId}/messages`, {
    body: 'It is available. We can discuss the final price based on your field size.',
    language: 'hi',
  }) : { status: 0 };
  const farmerInquiryReply = serviceChatId
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: { items: [] } };
  const messagesBeforeMarkRead = serviceChatId
    ? await db.prepare('SELECT COUNT(*) AS count FROM service_chat_messages WHERE chat_id = ?').get(serviceChatId)
    : { count: 0 };
  const markAllFarmerNotificationsRead = await farmer2.post('/api/communications/notifications/read-all', {});
  const farmerNotificationsAfterMarkAllRead = await farmer2.get('/api/communications/notifications');
  const messagesAfterMarkRead = serviceChatId
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: { items: [] } };
  const messagesAfterMarkReadCount = serviceChatId
    ? await db.prepare('SELECT COUNT(*) AS count FROM service_chat_messages WHERE chat_id = ?').get(serviceChatId)
    : { count: 0 };
  check(
    'farmer and provider can continue the pre-booking conversation',
    providerReply.status === 201 && farmerInquiryReply.status === 200 &&
      farmerInquiryReply.data.items.length === 4 && farmerInquiryReply.data.items[2].hasAudio &&
      farmerInquiryReply.data.items[3].isMine === false && farmerInquiryReply.data.items[3].language === 'hi',
    { providerReply, farmerInquiryReply }
  );
  check(
    'marking all notifications read keeps every text and voice message in the chat history',
    markAllFarmerNotificationsRead.status === 200 &&
      farmerNotificationsAfterMarkAllRead.status === 200 &&
      farmerNotificationsAfterMarkAllRead.data.unreadCount === 0 &&
      farmerNotificationsAfterMarkAllRead.data.items.every((notification) => notification.read_at) &&
      messagesAfterMarkRead.status === 200 && messagesAfterMarkRead.data.items.length === 4 &&
      messagesBeforeMarkRead.count === messagesAfterMarkReadCount.count &&
      messagesAfterMarkRead.data.items[1].language === 'te' &&
      messagesAfterMarkRead.data.items[2].hasAudio && messagesAfterMarkRead.data.items[2].language === 'hi' &&
      messagesAfterMarkRead.data.items[3].language === 'hi'
  );
  const outsiderMessages = await farmer2.get(`/api/communications/bookings/${bid}/messages`);
  check('booking messages are private to the booking participants', outsiderMessages.status === 403);
  const sentMessage = await farmer.post(`/api/communications/bookings/${bid}/messages`, { body: 'Please confirm the arrival time.' });
  const ownerMessages = await owner.get(`/api/communications/bookings/${bid}/messages`);
  const ownerMessageNotifications = await owner.get('/api/communications/notifications');
  check(
    'farmer and owner can exchange booking messages',
    sentMessage.status === 201 && ownerMessages.status === 200 && ownerMessages.data.items.length === 1 &&
      ownerMessages.data.items[0].body === 'Please confirm the arrival time.' &&
      ownerMessages.data.items[0].senderRole === 'farmer' && ownerMessageNotifications.data.unreadCount === 2
  );
  const markedMessageNotifications = await owner.post(`/api/communications/bookings/${bid}/messages/read`, {});
  const ownerNotificationsRead = await owner.get('/api/communications/notifications');
  check(
    'opening a conversation clears its message notification',
    markedMessageNotifications.status === 200 && ownerNotificationsRead.data.unreadCount === 1
  );
  const ownerReply = await owner.post(`/api/communications/bookings/${bid}/messages`, { body: 'I will arrive at 8 AM.' });
  const farmerMessages = await farmer.get(`/api/communications/bookings/${bid}/messages`);
  check(
    'owner reply is visible to the farmer',
    ownerReply.status === 201 && farmerMessages.data.items.length === 2 &&
      farmerMessages.data.items[1].isMine === false && farmerMessages.data.items[1].body === 'I will arrive at 8 AM.'
  );
  const unreadOwnerNotification = ownerNotificationsRead.data.items.find((item) => !item.read_at);
  const readOwnerNotification = await owner.post(`/api/communications/notifications/${unreadOwnerNotification.id}/read`, {});
  check('notification recipient can mark a notification read', readOwnerNotification.status === 200 && readOwnerNotification.data.updated === 1);
  const foreignNotificationRead = await farmer2.post(`/api/communications/notifications/${unreadOwnerNotification.id}/read`, {});
  check('users cannot mark another user notification as read', foreignNotificationRead.status === 200 && foreignNotificationRead.data.updated === 0);
  const clash = await farmer2.post('/api/bookings', { kind: 'tool', toolId, startDate: day(3), endDate: day(4) });
  check('double-booking of a confirmed tool blocked', clash.status === 409);
  const free = await farmer2.post('/api/bookings', { kind: 'tool', toolId, startDate: day(10), endDate: day(10) });
  check('non-overlapping dates are fine', free.status === 201);
  const rejectFree = await owner.patch(`/api/bookings/${free.data.booking.id}/status`, { status: 'rejected' });
  const rejectedFarmerNotifications = await farmer2.get('/api/communications/notifications');
  check(
    'farmer receives notification when owner rejects a request',
    rejectFree.status === 200 && rejectedFarmerNotifications.data.items[0].title === 'Booking rejected'
  );

  const start = await owner.patch(`/api/bookings/${bid}/status`, { status: 'in_progress' });
  const done = await owner.patch(`/api/bookings/${bid}/status`, { status: 'completed', finalAmount: 4800 });
  const completedChatMessages = await farmer.get(`/api/communications/chats/${bookingChat.data.id}/messages`);
  const completedNotifications = await farmer.get('/api/communications/notifications');
  const completedNotification = completedNotifications.data.items.find((item) => item.title === 'Work completed');
  const paymentNotification = completedNotifications.data.items.find((item) => item.title === 'Final payment recorded');
  check(
    'completion and final payment appear in chat and as distinct notifications',
    start.status === 200 && done.status === 200 && done.data.booking.finalAmount === 4800 &&
      completedChatMessages.status === 200 &&
      completedChatMessages.data.items.some((message) => message.isSystem && message.body.includes('Work completed')) &&
      completedChatMessages.data.items.some((message) => message.isSystem && message.body.includes('₹4,800')) &&
      completedNotification?.chat_id === bookingChat.data.id &&
      paymentNotification?.chat_id === bookingChat.data.id &&
      paymentNotification.body.includes('₹4,800')
  );
  const farmerPastAfterCompletion = await farmer.get('/api/bookings?status=history');
  check('past booking filter includes completed work', farmerPastAfterCompletion.data.items.some((booking) => booking.id === bid));
  const early = await farmer2.post(`/api/bookings/${free.data.booking.id}/review`, { rating: 5 });
  check('cannot review before completion', early.status === 409);
  const review = await farmer.post(`/api/bookings/${bid}/review`, { rating: 5, review: 'Great work, on time' });
  check('farmer reviews completed service', review.status === 200 && review.data.booking.rating === 5);
  const again = await farmer.post(`/api/bookings/${bid}/review`, { rating: 4 });
  check('only one review per service', again.status === 409);
  const fsum = await farmer.get('/api/bookings/summary');
  check('farmer history: services used & spent', fsum.data.totals.completed === 1 && fsum.data.totals.spent === 4800 && fsum.data.providers[0].services.includes('Mahindra 575 DI'), fsum.data);
  const osum = await owner.get('/api/bookings/summary');
  check('owner history: customers served & earned', osum.data.totals.earned === 4800 && osum.data.customers.length === 1 && osum.data.customers[0].name === 'Suresh Reddy', osum.data);
  const inquiryBooking = await farmer2.post('/api/bookings', {
    kind: 'tool', toolId, startDate: day(20), endDate: day(20),
  });
  const farmerChatBeforeAcceptance = serviceChatId
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: {} };
  check('call contact remains hidden while the related booking is only requested',
    inquiryBooking.status === 201 && farmerChatBeforeAcceptance.data.chat?.callPhone === null);
  const acceptedInquiryBooking = inquiryBooking.status === 201
    ? await owner.patch(`/api/bookings/${inquiryBooking.data.booking.id}/status`, { status: 'accepted' })
    : { status: 0 };
  const farmerChatAfterAcceptance = serviceChatId
    ? await farmer2.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: {} };
  const providerChatAfterAcceptance = serviceChatId
    ? await owner.get(`/api/communications/chats/${serviceChatId}/messages`)
    : { status: 0, data: {} };
  check(
    'direct call becomes available in chat only after provider accepts a booking',
    acceptedInquiryBooking.status === 200 && farmerChatAfterAcceptance.data.chat?.callPhone === '+919000000001' &&
      providerChatAfterAcceptance.data.chat?.callPhone === '+919000000003',
    { acceptedInquiryBooking, farmerChatAfterAcceptance, providerChatAfterAcceptance }
  );
  const withRating = await anon.get(`/api/tools/${toolId}`);
  check('rating is reflected on the listing', withRating.data.tool.rating.average === 5 && withRating.data.reviews.length === 1);

  realLog('\nLabour');
  const lab = await owner.post('/api/labour', { title: 'Harvesting team (10 people)', skill: 'harvesting', teamSize: 10, wagePerDay: 600, description: 'Experienced paddy harvesting team', village: 'Shamirpet', district: 'Medchal', state: 'Telangana', lat: 17.57, lng: 78.57 });
  check('owner posts labour team', lab.status === 201 && lab.data.labour.status === 'pending');
  await admin.patch(`/api/admin/labour/${lab.data.labour.id}/status`, { status: 'approved' });
  const labSearch = await farmer.get('/api/labour?lat=17.54&lng=78.49&radiusKm=50&skill=harvesting');
  check('farmer finds labour nearby', labSearch.data.total === 1 && labSearch.data.items[0].distanceKm > 0);
  const labBook = await farmer.post('/api/bookings', { kind: 'labour', labourId: lab.data.labour.id, startDate: day(5), endDate: day(6) });
  check('labour booking quote = wage x team x days', labBook.status === 201 && labBook.data.booking.quotedAmount === 12000, labBook.data);

  realLog('\nCalculator & GPS area');
  const crops = await anon.get('/api/calculator/crops');
  check('crop list available', crops.status === 200 && crops.data.items.length > 10);
  const calc = await anon.post('/api/calculator/calculate', { area: 20, unit: 'gunta', yieldPerAcreKg: 2400, bagWeightKg: 75, pricePerQuintal: 2300 });
  check('20 guntas of paddy @2400kg/acre = 1200 kg = 16 bags of 75 kg', calc.data.result.areaAcres === 0.5 && calc.data.result.totalKg === 1200 && calc.data.result.bags === 16 && calc.data.result.revenue === 27600, calc.data);
  const dLat = 63.6156 / 111195;
  const dLng = 63.6156 / (111195 * Math.cos((17 * Math.PI) / 180));
  const sq = [
    { lat: 17, lng: 78 }, { lat: 17 + dLat, lng: 78 }, { lat: 17 + dLat, lng: 78 + dLng }, { lat: 17, lng: 78 + dLng },
  ];
  const meas = await anon.post('/api/calculator/measure', { points: sq });
  check('GPS polygon ~ 1 acre measured accurately (±1%)', Math.abs(meas.data.areaAcres - 1) < 0.01 && Math.abs(meas.data.areaGuntas - 40) < 0.4, meas.data);
  const saved = await farmer.post('/api/calculator/saved', { label: 'North field', crop: 'Paddy (Rice)', area: 2, unit: 'acre', yieldPerAcreKg: 2400, bagWeightKg: 50, pricePerQuintal: 2300, polygon: sq });
  const savedList = await farmer.get('/api/calculator/saved');
  check('farmer can save & list calculations', saved.status === 201 && savedList.data.items.length === 1 && savedList.data.items[0].bags === 96);

  realLog('\nAdmin monitoring & blocking');
  const stats = await admin.get('/api/admin/stats');
  check('admin stats', stats.status === 200 && stats.data.users.farmers.total === 2 && stats.data.users.owners.total === 1 && stats.data.bookings.total >= 3, stats.data);
  const users = await admin.get('/api/admin/users?role=farmer&q=Suresh');
  check('admin user search', users.data.total === 1);
  const udetail = await admin.get(`/api/admin/users/${users.data.items[0].id}`);
  check('admin sees a user\'s booking history', udetail.data.bookings.length >= 1);
  const audit = await admin.get('/api/admin/audit?action=booking');
  check('audit log records booking events', audit.data.total >= 4);
  const block = await admin.patch(`/api/admin/users/${users.data.items[0].id}/status`, { status: 'blocked', reason: 'test' });
  check('admin blocks a farmer', block.status === 200);
  const blockedCall = await farmer.get('/api/bookings');
  check('blocked user session stops working immediately', blockedCall.status === 401);
  const blockedOtp = await anon.post('/api/auth/otp/request', { phone: '9000000002', role: 'farmer' });
  check('blocked user cannot request a new OTP', blockedOtp.status === 403);

  realLog('\nHardening: moderation, public data, search, chat, alerts');
  const visitor = makeClient(base); // genuinely signed-out client (the shared `anon` client signs in during earlier sections)
  const editForm = (over = {}) => toolForm({ address: 'Plot 5, Secret Lane', ...over }, false);

  // 1. Editing public text on an approved listing sends it back to moderation.
  const renamed = await owner.send('PUT', `/api/tools/${toolId}`, { form: editForm({ name: 'Mahindra 575 DI XP' }) });
  check('owner can edit an approved listing', renamed.status === 200, renamed.data);
  check('renaming an approved listing sends it back to moderation', renamed.data.tool?.status === 'pending', renamed.data.tool?.status);
  const hiddenWhilePending = await visitor.get('/api/tools?lat=17.54&lng=78.49&radiusKm=50');
  check('re-moderated listing disappears from public search', hiddenWhilePending.data.total === 0, hiddenWhilePending.data.total);
  await admin.patch(`/api/admin/tools/${toolId}/status`, { status: 'approved', note: 'internal: checked docs' });

  // 2. Non-public changes (price/coordinates) do not require another review.
  const repriced = await owner.send('PUT', `/api/tools/${toolId}`, {
    form: editForm({ name: 'Mahindra 575 DI XP', pricePerDay: '2400', lat: '17.5734', lng: '78.5766' }),
  });
  check('price/location edits keep an approved listing approved', repriced.status === 200 && repriced.data.tool.status === 'approved', repriced.data.tool?.status);

  // 3. Public responses do not leak the address / admin note and coarsen coordinates for anonymous users.
  const anonDetail = (await visitor.get(`/api/tools/${toolId}`)).data.tool;
  check('anonymous detail hides address and admin note', anonDetail.address === undefined && anonDetail.adminNote === undefined, anonDetail);
  check('anonymous detail has ~1 km coordinates', anonDetail.lat === 17.57 && anonDetail.lng === 78.58, [anonDetail.lat, anonDetail.lng]);
  const signedInDetail = (await farmer2.get(`/api/tools/${toolId}`)).data.tool;
  check('signed-in user sees exact coordinates but not the address', signedInDetail.lat === 17.5734 && signedInDetail.address === undefined && signedInDetail.adminNote === undefined, signedInDetail);
  const ownerDetail = (await owner.get(`/api/tools/${toolId}`)).data.tool;
  check('owner still sees address and admin note', ownerDetail.address === 'Plot 5, Secret Lane' && ownerDetail.adminNote === 'internal: checked docs', ownerDetail);
  const anonSearch = (await visitor.get('/api/tools?lat=17.54&lng=78.49&radiusKm=50')).data.items[0];
  check('anonymous search results hide address and admin note', anonSearch && anonSearch.address === undefined && anonSearch.adminNote === undefined);

  // 4. A rejected listing is resubmitted when the owner saves it.
  await admin.patch(`/api/admin/tools/${toolId}/status`, { status: 'rejected', note: 'blurry photo' });
  const resubmitted = await owner.send('PUT', `/api/tools/${toolId}`, { form: editForm({ name: 'Mahindra 575 DI XP', pricePerDay: '2400', lat: '17.5734', lng: '78.5766' }) });
  check('saving a rejected listing resubmits it for review', resubmitted.status === 200 && resubmitted.data.tool.status === 'pending', resubmitted.data.tool?.status);

  // restore the fixture used by the remaining sections
  await owner.send('PUT', `/api/tools/${toolId}`, { form: toolForm({ address: '' }, false) });
  await admin.patch(`/api/admin/tools/${toolId}/status`, { status: 'approved' });

  // 5. SQL search: distance filter, ordering and pagination.
  const second = await owner.send('POST', '/api/tools', {
    form: toolForm({ name: 'Cheap Rotavator', category: 'tractor', pricePerDay: '1000', pricePerHour: '', lat: '17.60', lng: '78.60' }),
  });
  check('second listing created', second.status === 201, second.data);
  const secondId = second.data.tool.id;
  await admin.patch(`/api/admin/tools/${secondId}/status`, { status: 'approved' });
  const q = '/api/tools?lat=17.54&lng=78.49&radiusKm=50';
  const byDistance = (await visitor.get(`${q}&sort=distance`)).data;
  check('search sorts by distance in SQL', byDistance.total === 2 && byDistance.items[0].id === toolId && byDistance.items[1].id === secondId
    && byDistance.items[0].distanceKm < byDistance.items[1].distanceKm, byDistance.items?.map((i) => [i.id, i.distanceKm]));
  const cheapFirst = (await visitor.get(`${q}&sort=price_low`)).data;
  check('search sorts by price (low to high)', cheapFirst.items[0].id === secondId, cheapFirst.items?.map((i) => i.id));
  const dearFirst = (await visitor.get(`${q}&sort=price_high`)).data;
  check('search sorts by price (high to low)', dearFirst.items[0].id === toolId, dearFirst.items?.map((i) => i.id));
  const page2 = (await visitor.get(`${q}&sort=distance&pageSize=1&page=2`)).data;
  check('search pagination returns the right page and total', page2.total === 2 && page2.items.length === 1 && page2.items[0].id === secondId, page2);
  const page3 = (await visitor.get(`${q}&sort=distance&pageSize=1&page=3`)).data;
  check('search past the last page is empty but keeps the total', page3.total === 2 && page3.items.length === 0, page3);
  const noLoc = (await visitor.get('/api/tools')).data;
  check('search without a location lists newest first with no distance', noLoc.items[0].id === secondId && noLoc.items[0].distanceKm === null, noLoc.items?.map((i) => [i.id, i.distanceKm]));
  const radius = (await visitor.get('/api/tools?lat=17.54&lng=78.49&radiusKm=11')).data;
  check('radius filter drops listings outside the circle', radius.total === 1 && radius.items[0].id === toolId, radius.items?.map((i) => [i.id, i.distanceKm]));
  await owner.del(`/api/tools/${secondId}`);

  // 6. Labour listings: public text changes are re-moderated.
  const { LABOUR_SKILL_IDS: skillIds } = require('../src/constants');
  const labourBody = (over = {}) => ({
    title: 'Harvest team', skill: skillIds[0], teamSize: 5, wagePerDay: 600,
    village: 'Shamirpet', district: 'Medchal', state: 'Telangana', lat: 17.57, lng: 78.57, ...over,
  });
  const newLabour = await owner.post('/api/labour', labourBody());
  check('labour listing created', newLabour.status === 201, newLabour.data);
  const newLabourId = newLabour.data.labour?.id;
  await admin.patch(`/api/admin/labour/${newLabourId}/status`, { status: 'approved' });
  const wageOnly = await owner.put(`/api/labour/${newLabourId}`, labourBody({ wagePerDay: 650 }));
  check('wage change keeps an approved labour listing approved', wageOnly.status === 200 && wageOnly.data.labour.status === 'approved', wageOnly.data);
  const retitled = await owner.put(`/api/labour/${newLabourId}`, labourBody({ title: 'Harvest team (renamed)' }));
  check('renaming an approved labour listing sends it back to moderation', retitled.status === 200 && retitled.data.labour.status === 'pending', retitled.data);
  const anonLabour = await visitor.get(`/api/labour/${newLabourId}`);
  check('pending labour listing is hidden from the public', anonLabour.status === 404, anonLabour.status);
  await owner.del(`/api/labour/${newLabourId}`);

  // 7. Chat history shows the NEWEST 200 messages, oldest first.
  const chatStart = await farmer2.post('/api/communications/chats', { kind: 'tool', listingId: toolId, body: 'FIRST-MESSAGE' });
  const chatId = chatStart.data.id;
  const chatRow = await db.prepare('SELECT farmer_id FROM service_chats WHERE id = ?').get(chatId);
  for (let i = 0; i < 205; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await db.prepare('INSERT INTO service_chat_messages (chat_id, sender_id, body) VALUES (?, ?, ?)').run(chatId, chatRow.farmer_id, `filler-${i}`);
  }
  await farmer2.post(`/api/communications/chats/${chatId}/messages`, { body: 'LATEST-MESSAGE' });
  const history = (await farmer2.get(`/api/communications/chats/${chatId}/messages`)).data;
  check('chat history is capped at 200 messages', history.items.length === 200, history.items?.length);
  check('chat history includes the newest message last', history.items.at(-1)?.body === 'LATEST-MESSAGE', history.items?.at(-1));
  check('chat history drops the oldest messages instead', !history.items.some((m) => m.body === 'FIRST-MESSAGE'));

  // 8. Alert SMS are throttled per phone number.
  const notifications = require('../src/services/notifications');
  const t0 = Date.now();
  check('first alert SMS to a number is allowed', notifications.alertAllowed('+919111111111', t0) === true);
  check('repeat alert SMS within the interval is suppressed', notifications.alertAllowed('+919111111111', t0 + 1000) === false);
  check('a different number is not affected', notifications.alertAllowed('+919222222222', t0 + 1000) === true);
  check('alert SMS allowed again after the interval', notifications.alertAllowed('+919111111111', t0 + 301 * 1000) === true);

  // 9. Global OTP circuit breaker (SMS pumping protection).
  await db.prepare(
    `INSERT INTO otp_codes (phone, role, code_hash, expires_at, created_at)
     SELECT '+9190000' || g, 'farmer', 'cap-test', EXTRACT(EPOCH FROM NOW())::bigint + 300, EXTRACT(EPOCH FROM NOW())::bigint
       FROM generate_series(1, 1000) g`
  ).run();
  const { requestOtp } = require('../src/services/otp');
  let capError = null;
  try { await requestOtp('+919000000001', 'owner', '203.0.113.9'); } catch (err) { capError = err; }
  check('OTP requests are refused once the global hourly cap is hit', capError && capError.status === 503 && capError.code === 'OTP_BUSY', capError && [capError.status, capError.code]);
  await db.prepare(`DELETE FROM otp_codes WHERE code_hash = 'cap-test'`).run();

  // 10. Database manager is opt-in in production.
  const prodEnv = {
    PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost/db',
    JWT_SECRET: 'a'.repeat(40), OTP_PEPPER: 'b'.repeat(20), SMS_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'x', TWILIO_AUTH_TOKEN: 'y', TWILIO_FROM: '+1555',
  };
  const probe = (extra) => JSON.parse(execFileSync(process.execPath, ['-e',
    "const c=require('./src/config');console.log(JSON.stringify({on:c.dbManagerEnabled,ips:c.dbManagerAllowedIps}))"],
  { cwd: path.join(__dirname, '..'), env: { ...prodEnv, ...extra }, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  check('database manager is disabled by default in production', probe({}).on === false);
  let prodRefused = false;
  try { probe({ DB_MANAGER_ENABLED: 'true' }); } catch (_) { prodRefused = true; }
  check('enabling it in production without credentials refuses to start', prodRefused);
  const prodOn = probe({
    DB_MANAGER_ENABLED: 'true', DB_MANAGER_EMAIL: 'dba@example.com', DB_MANAGER_PASSWORD: 'a-very-long-unique-passphrase-1',
    DB_MANAGER_ALLOWED_IPS: '10.0.0.5, 10.0.0.6',
  });
  check('enabled with credentials and an IP allowlist', prodOn.on === true && prodOn.ips.length === 2 && prodOn.ips[1] === '10.0.0.6', prodOn);

  realLog('\nOwner deleting listing');
  const openBooking = await farmer2.post('/api/bookings', {
    kind: 'tool', toolId, startDate: day(15), endDate: day(16),
  });
  const delBusy = await owner.del(`/api/tools/${toolId}`);
  check('cannot delete a tool with open bookings', openBooking.status === 201 && delBusy.status === 409, {
    bookingStatus: openBooking.status,
    deleteStatus: delBusy.status,
  });

  realLog('\nSeparate database manager');
  const dbManager = makeClient(base);
  const managerUnauth = await dbManager.get('/api/database-manager/tables');
  check('database manager API requires its own login', managerUnauth.status === 401);
  const badManagerLogin = await dbManager.post('/api/database-manager/login', {
    email: process.env.DB_MANAGER_EMAIL, password: 'wrong-password',
  });
  check('incorrect database manager password rejected', badManagerLogin.status === 401);
  const managerLogin = await dbManager.post('/api/database-manager/login', {
    email: process.env.DB_MANAGER_EMAIL, password: process.env.DB_MANAGER_PASSWORD,
  });
  check('separate database manager login succeeds', managerLogin.status === 200);
  const managedTables = await dbManager.get('/api/database-manager/tables');
  check(
    'database manager table allowlist omits OTP storage',
    managedTables.status === 200 && managedTables.data.items.some((t) => t.name === 'users') &&
      !managedTables.data.items.some((t) => t.name === 'otp_codes')
  );
  const managedUsers = await dbManager.get('/api/database-manager/users/rows?q=Suresh');
  check(
    'database manager can search users without exposing password hashes',
    managedUsers.status === 200 && managedUsers.data.total === 1 &&
      !Object.hasOwn(managedUsers.data.items[0], 'password_hash') &&
      managedUsers.data.items[0].password_status === 'Set (bcrypt hash)' &&
      managedUsers.data.table.columns.some((column) => column.name === 'password_status' && !column.writable)
  );
  const managedImages = await dbManager.get('/api/database-manager/tool_images/rows');
  check(
    'database manager lists photo metadata without dumping image bytes',
    managedImages.status === 200 && managedImages.data.total >= 1 &&
      !managedImages.data.table.columns.some((column) => column.name === 'data') &&
      !Object.hasOwn(managedImages.data.items[0] || {}, 'data'),
    managedImages
  );
  const managedUser = managedUsers.data.items[0];
  const updateManagedUser = await dbManager.put(`/api/database-manager/users/${managedUser.id}`, { name: 'Managed Suresh' });
  const restoreManagedUser = await dbManager.put(`/api/database-manager/users/${managedUser.id}`, { name: 'Suresh Reddy' });
  check('database manager can edit an account and restore its value', updateManagedUser.status === 200 && restoreManagedUser.status === 200);
  const passwordBeforeManagerReset = await db.prepare(
    'SELECT password_hash, token_version FROM users WHERE id = ?'
  ).get(managedUser.id);
  const shortManagerPassword = await dbManager.post(`/api/database-manager/users/${managedUser.id}/password`, {
    password: 'short',
    confirmPassword: 'short',
  });
  const mismatchManagerPassword = await dbManager.post(`/api/database-manager/users/${managedUser.id}/password`, {
    password: 'Manager-Password-123!',
    confirmPassword: 'Different-Password-456!',
  });
  const managerPasswordReset = await dbManager.post(`/api/database-manager/users/${managedUser.id}/password`, {
    password: 'Manager-Password-123!',
    confirmPassword: 'Manager-Password-123!',
  });
  const passwordAfterManagerReset = await db.prepare(
    'SELECT password_hash, token_version FROM users WHERE id = ?'
  ).get(managedUser.id);
  const managerPasswordMatches = await bcrypt.compare('Manager-Password-123!', passwordAfterManagerReset.password_hash);
  check(
    'database manager validates and securely resets user passwords',
    shortManagerPassword.status === 400 && mismatchManagerPassword.status === 400 &&
      managerPasswordReset.status === 200 && managerPasswordReset.data.ok &&
      !Object.hasOwn(managerPasswordReset.data, 'password_hash') &&
      /^\$2[aby]\$/.test(passwordAfterManagerReset.password_hash) &&
      passwordAfterManagerReset.password_hash !== 'Manager-Password-123!' &&
      managerPasswordMatches &&
      passwordAfterManagerReset.token_version === passwordBeforeManagerReset.token_version + 1
  );
  check(
    'database manager password reset is audited without recording the password',
    (await db.prepare(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'database_manager.password_reset' AND entity_id = ? AND meta NOT LIKE '%Manager-Password-123%'"
    ).get(managedUser.id)).n === 1
  );
  const managedExport = await dbManager.get('/api/database-manager/crops/export');
  check('database manager can export table records', managedExport.status === 200 && managedExport.headers.get('content-type').includes('text/csv'));
  const testCropResult = await db.prepare(
    'INSERT INTO crops (name, yield_per_acre_kg, default_price_per_quintal, notes) VALUES (?, ?, ?, ?)'
  ).run('Manager Delete Test', 1000, null, null);
  const testCropId = testCropResult.lastInsertRowid;
  const deletedCrop = await dbManager.del(`/api/database-manager/crops/${testCropId}`);
  check(
    'database manager can delete records and log the action',
    deletedCrop.status === 200 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'database_manager.record_deleted' AND entity_id = ?").get(testCropId)).n === 1
  );
  const readOnlyAudit = await dbManager.del('/api/database-manager/audit_logs/1');
  check('audit records cannot be deleted in the database manager', readOnlyAudit.status === 403);
  await dbManager.post('/api/database-manager/logout', {});
  const loggedOutManager = await dbManager.get('/api/database-manager/tables');
  check('database manager logout clears its separate session', loggedOutManager.status === 401);

  server.close();
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  realLog(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  realLog('Test run crashed:', err);
  process.exit(1);
});
