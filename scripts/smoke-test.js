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
  const dup = await farmer.post('/api/bookings', { kind: 'tool', toolId, startDate: day(2), endDate: day(3) });
  check('duplicate pending request blocked', dup.status === 409);
  const wrongFarmerCancel = await farmer2.patch(`/api/bookings/${bid}/status`, { status: 'cancelled' });
  check('other users cannot touch a booking', wrongFarmerCancel.status === 401);
  const ownerList = await owner.get('/api/bookings?status=requested');
  check('owner sees the request', ownerList.data.total === 1 && ownerList.data.items[0].counterpart.name === 'Suresh Reddy' && ownerList.data.items[0].counterpart.phone === null);
  const badJump = await owner.patch(`/api/bookings/${bid}/status`, { status: 'completed' });
  check('invalid status jump blocked', badJump.status === 409);
  const accept = await owner.patch(`/api/bookings/${bid}/status`, { status: 'accepted' });
  check('owner accepts', accept.status === 200 && accept.data.booking.counterpart.phone === '+919000000002');
  const fview = await farmer.get(`/api/bookings/${bid}`);
  check('farmer now sees owner contact', fview.data.booking.counterpart.phone === '+919000000001');

  const f2Otp = await registerWithOtp(farmer2, '9000000003', 'farmer', 'Anil Goud', 'anil.farmer@test.local');
  await f2Otp.verify();
  const f2LoginOtp = await loginWithOtp(farmer2, '9000000003', 'farmer');
  const f2OtpLogin = await f2LoginOtp.verify();
  check('registered secondary farmer signs in using OTP', f2OtpLogin.status === 200);
  const clash = await farmer2.post('/api/bookings', { kind: 'tool', toolId, startDate: day(3), endDate: day(4) });
  check('double-booking of a confirmed tool blocked', clash.status === 409);
  const free = await farmer2.post('/api/bookings', { kind: 'tool', toolId, startDate: day(10), endDate: day(10) });
  check('non-overlapping dates are fine', free.status === 201);

  const start = await owner.patch(`/api/bookings/${bid}/status`, { status: 'in_progress' });
  const done = await owner.patch(`/api/bookings/${bid}/status`, { status: 'completed', finalAmount: 4800 });
  check('owner starts and completes with final amount', start.status === 200 && done.status === 200 && done.data.booking.finalAmount === 4800);
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

  realLog('\nOwner deleting listing');
  const delBusy = await owner.del(`/api/tools/${toolId}`);
  check('cannot delete a tool with open bookings', delBusy.status === 409);

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
      !Object.hasOwn(managedUsers.data.items[0], 'password_hash')
  );
  const managedImages = await dbManager.get('/api/database-manager/tool_images/rows');
  check(
    'database manager lists photo metadata without dumping image bytes',
    managedImages.status === 200 && managedImages.data.total >= 1 &&
      !managedImages.data.table.columns.some((column) => column.name === 'data') &&
      !Object.hasOwn(managedImages.data.items[0], 'data')
  );
  const managedUser = managedUsers.data.items[0];
  const updateManagedUser = await dbManager.put(`/api/database-manager/users/${managedUser.id}`, { name: 'Managed Suresh' });
  const restoreManagedUser = await dbManager.put(`/api/database-manager/users/${managedUser.id}`, { name: 'Suresh Reddy' });
  check('database manager can edit an account and restore its value', updateManagedUser.status === 200 && restoreManagedUser.status === 200);
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
