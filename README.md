# AgriConnect

AgriConnect is a responsive agricultural services marketplace. Farmers can find nearby farm machinery and labour, send booking requests, measure fields, estimate crop yields, and keep a history of their work. Machinery owners and labour providers can publish and manage listings. Administrators moderate listings and accounts, while a separate database-manager interface supports controlled record maintenance.

The application includes a web app for desktop and mobile browsers and an Expo Go mobile shell. Local development uses a persistent embedded PostgreSQL-compatible database by default; production uses PostgreSQL.

## Contents

- [What the application does](#what-the-application-does)
- [Application workflows](#application-workflows)
- [Pages and access](#pages-and-access)
- [Technology and tools](#technology-and-tools)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Run on a phone with Expo Go](#run-on-a-phone-with-expo-go)
- [Configuration](#configuration)
- [Database and SQLite migration](#database-and-sqlite-migration)
- [HTTP API overview](#http-api-overview)
- [Security and privacy](#security-and-privacy)
- [Tests and demo data](#tests-and-demo-data)
- [Production checklist](#production-checklist)
- [Limitations and operational notes](#limitations-and-operational-notes)

## What the application does

### Farmer features

- Search approved, available machinery and farm-labour listings.
- Filter machines by category, price, operator availability, and distance; filter labour by skill, wage, team size, and distance.
- Find listings near the device's GPS location or a point selected by tapping or dragging on the map.
- View listing details, owner/provider information, prices, photos, ratings, and reviews.
- Request, track, cancel, and review bookings. Owner contact details are shared after a booking is accepted.
- Receive booking-status and new-message notifications; chat with the other participant within a booking.
- Start a private chat from an approved machine or labour listing before booking to discuss availability, prices, dates, and work requirements.
- Open a booking notification directly into the same private service chat. A new conversation starts with an automatic AgriConnect welcome message.
- See booking-request, acceptance, work-start, completion, and final-payment updates in the chat timeline; dashboard notifications identify completion and final payment separately and link to that conversation.
- Choose English, Telugu, or Hindi for each message; messages stay in the language they were sent in and display that language in the conversation.
- Send voice notes from the Chats page (up to 60 seconds each) and play them in the conversation.
- Use the Chats page to follow replies. Direct calling between farmer and provider is enabled only after a booking for that listing is accepted.
- View service history, providers used, completed work, and spending.
- Measure land by walking its boundary with GPS or drawing the boundary on satellite imagery.
- Estimate crop quantities, bags, and indicative revenue, or compare a harvested amount with the estimate.
- Save and revisit yield calculations.

### Owner and labour-provider features

- Publish machinery listings with rates, service area, location, operator availability, and up to six photos.
- Publish farm-labour teams with skill, team size, daily wage, location, and service area.
- Edit listings, update availability, and view admin approval status or moderation notes.
- Receive and manage booking requests, update their status through the booking lifecycle, and review customer/service history.
- Receive new-request and message notifications that open the relevant farmer conversation, and communicate with each farmer in the booking conversation.
- Reply to listing enquiries in the Chats page and coordinate availability, pricing, and work details before a booking is accepted.
- Maintain a business profile and location.

New listings require admin approval by default. This behavior is controlled by `LISTINGS_REQUIRE_APPROVAL`.

### Admin features

- Review marketplace statistics and recent sign-ups.
- Approve, reject, or return machinery and labour listings to pending status.
- Search accounts, review account activity and bookings, and block or unblock users.
- Review bookings and audit records.
- Maintain the crop list and indicative yields/prices used by the calculator.

Blocking an account increments its session version so existing sessions stop being accepted.

### Database-manager features

The separate `/database-manager` interface can search, inspect, edit, delete, and export records from its allowlisted application tables. It is protected by its own configured login, separate from the admin account. User records show whether a password is set and allow the database manager to set a new password; new passwords are bcrypt-hashed and existing user sessions are invalidated. Password hashes, token versions, OTP records, admin accounts, and raw photo bytes are not exposed through this interface; audit records are read-only.

Database-manager edits and deletes are powerful operations. Deleting users may cascade to related records; back up PostgreSQL before making destructive changes.

## Application workflows

### Account registration and sign-in

1. A farmer or owner chooses an account type and registers with a name, email, mobile number, password, and OTP verification.
2. After registration, the user signs in with their mobile number and either a fresh OTP or password.
3. Owners complete their profile, including location, before publishing listings.
4. Forgotten passwords can be reset after OTP verification. Password reset invalidates existing sessions.
5. The app returns a user to the page they requested after sign-in.

In development, `SMS_PROVIDER=console` writes OTPs to the server log and returns a development OTP to the UI. Use Twilio or MSG91 for real SMS delivery.

### Listing and booking lifecycle

1. An owner/provider creates a machine or labour listing.
2. When approval is enabled, an administrator reviews the listing before it is publicly searchable.
3. A farmer selects an approved listing and submits a booking request with dates, field size where applicable, and optional notes/location.
4. The owner accepts or rejects the request. Accepted tool bookings are checked for overlapping confirmed reservations while the tool row is locked in a PostgreSQL transaction.
5. An accepted booking can move to in-progress and then completed; the owner can record the final amount.
6. The farmer may submit one rating/review after completion. Contact details are shown to booking participants after acceptance.

The supported booking statuses are `requested`, `accepted`, `rejected`, `in_progress`, `completed`, and `cancelled`. The API checks allowed transitions and prevents overlapping confirmed tool bookings.

### Land measurement and yield calculation

- Land units: acres, guntas, and hectares. The app uses 1 acre = 40 guntas.
- Walking mode obtains high-accuracy GPS readings and averages readings for about five seconds at each marked corner.
- Draw mode allows users to place and adjust corners on the map.
- The server calculates geodesic polygon area and perimeter and returns an uncertainty estimate to the UI.
- Yield estimates use crop-specific indicative values from the editable crops table. Farmers can adjust yield assumptions, bag weight, and optional selling price.
- Saved calculations are associated with the signed-in farmer; each account is limited to 200 stored calculations.

Land measurements and crop averages are estimates, not legal surveys or guaranteed harvest forecasts.

## Pages and access

| Path | Purpose | Access |
|---|---|---|
| `/` | Search nearby machinery and labour; map and listing results | Farmer/owner sign-in required for marketplace use |
| `/login` | Farmer/owner registration, OTP/password login, and password reset | Public |
| `/farmer` | Farmer dashboard: requests, service history, saved calculations, profile | Farmer |
| `/owner` | Owner dashboard: requests, machinery, labour, customers, profile | Owner |
| `/calculator` | GPS/drawn land measurement and crop-yield calculator | Signed-in user; saving is farmer-only |
| `/admin` | Admin login and moderation/operations dashboard | Admin credentials |
| `/database-manager` | Separate database records management interface | Database-manager credentials |
| `/healthz` | Basic application/database readiness check | Public |

The web UI includes English, Telugu, and Hindi language choices, light/dark/system theme preferences, responsive navigation, and mobile layouts.

## Technology and tools

### Languages and runtime

- **JavaScript (ES modules in the browser and CommonJS on the server)** for the web client, API, and scripts.
- **HTML5** for page structure and **CSS3** for responsive layouts, themes, and component styling.
- **SQL** for PostgreSQL schema creation, application queries, and the SQLite-to-PostgreSQL importer.
- **JavaScript/JSX** in `App.js` for the Expo React Native WebView shell.
- **Node.js 20 or newer** for the API, scripts, and build/runtime tooling.

### Main libraries and services

| Area | Technology |
|---|---|
| HTTP server and routing | Express 5 |
| Database | PostgreSQL, `pg` connection pool, parameterized asynchronous queries |
| Request validation | Zod |
| User passwords | bcryptjs |
| Browser sessions | JWT stored in an `httpOnly` cookie |
| Security middleware | Helmet, request validation, rate limits, CSRF custom-header guard |
| Maps | Leaflet with OpenStreetMap street tiles and Esri World Imagery satellite tiles |
| GPS in browsers | Browser Geolocation API |
| GPS in Expo Go | `expo-location` bridged into the app's WebView geolocation API |
| Mobile shell | Expo, React Native, and `react-native-webview` |
| Image uploads | Multer, magic-byte type checks, PostgreSQL `BYTEA` storage |
| SMS verification | Console for development, Twilio or MSG91 integrations |
| Compression and request logs | compression and Morgan |
| PWA | Web app manifest, service worker, app icons |
| Automated end-to-end checks | `npm test`, Express app, and isolated PGlite test database |
| Earlier database migration | `better-sqlite3` used by the one-time SQLite importer |
| Container image | Dockerfile using Node.js Alpine; PostgreSQL is a separate service |

Maps do not require a Google Maps API key. The application can open coordinates in Google Maps externally, but in-app tiles are supplied by the configured OpenStreetMap and Esri endpoints.

## Project structure

```text
.
├── App.js                         # Expo React Native WebView shell and native GPS bridge
├── api/index.js                   # Vercel Node.js Function entry point
├── app.json                       # Expo app identity, platform location permissions
├── Dockerfile                     # Production Node.js application image
├── package.json                   # Commands and dependency manifest
├── vercel.json                    # Routes web, assets, and API requests through Express
├── .env.example                   # Configuration template; copy to the ignored .env
├── public/
│   ├── index.html                 # Marketplace/search page
│   ├── login.html                 # Account access page
│   ├── farmer.html                # Farmer dashboard
│   ├── owner.html                 # Owner dashboard
│   ├── calculator.html            # Land and yield calculator
│   ├── admin.html                 # Admin dashboard
│   ├── database-manager.html      # Database manager UI
│   ├── css/style.css              # Shared responsive design system
│   ├── js/                        # Page controllers
│   ├── js/lib/                    # API, map, session, navigation, and UI helpers
│   ├── media/                     # Hero video and poster assets
│   ├── fonts/                     # Bundled fonts and their licenses
│   └── sw.js                      # Service-worker asset precache
├── scripts/
│   ├── migrate-sqlite-to-postgres.js # One-time existing-data migration
│   ├── seed-demo.js               # Optional sample account/listing data
│   └── smoke-test.js              # End-to-end API/workflow checks
├── src/
│   ├── app.js                     # Express middleware, static hosting, API mounting
│   ├── server.js                  # Startup, bootstrap, housekeeping, shutdown
│   ├── config.js                  # Environment validation and production checks
│   ├── db.js                      # PostgreSQL pool, schema, transactions, query adapter
│   ├── routes/                    # Auth, tools, labour, bookings, calculator, admin, DB manager
│   ├── middleware/                # Authentication, validation, uploads, rate limits, errors
│   ├── services/                  # Bootstrap, OTP/SMS, storage, listing search/DTOs
│   └── utils/                     # Audit, errors, geography, schemas, serialization
├── data/                          # Local/legacy data location; ignored by Git
└── uploads/                       # Legacy photo fallback; ignored by Git
```

## Requirements

- Node.js 20+ and npm.
- For production or when using `DATABASE_MODE=postgres`, a running PostgreSQL server and an empty application database for first-time setup. Local development uses embedded PGlite and does not require a separate database server.
- For Expo Go testing: Expo Go installed on the phone, with the phone and development computer on the same reachable network.
- Browser geolocation generally requires HTTPS, except for localhost development. Expo uses native location permissions through its bridge.

## Run locally

### 1. Install dependencies

Open a terminal in the project root:

```sh
npm install
```

### 2. Configure the database

Local development uses an embedded PGlite database persisted under `data/pglite` by default, so no PostgreSQL service needs to be installed or started. To use PostgreSQL locally instead, set `DATABASE_MODE=postgres` and configure `DATABASE_URL`:

Create a PostgreSQL database and application user using your PostgreSQL provider or local PostgreSQL installation. Keep the username and password private.

For example, on a local PostgreSQL installation, a database administrator can create the database with:

```sql
CREATE USER agriconnect_app WITH PASSWORD 'use-a-private-strong-password';
CREATE DATABASE agriconnect OWNER agriconnect_app;
```

Do not use the example password literally.

### 3. Configure the environment

Copy `.env.example` to `.env` and update the values for your machine/database. `.env` is ignored by Git and must not be committed.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Set at minimum:

- `JWT_SECRET` to a private random value of at least 32 characters.
- `OTP_PEPPER` to a private random value of at least 16 characters.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- `DB_MANAGER_EMAIL` and `DB_MANAGER_PASSWORD` (only if you set `DB_MANAGER_ENABLED=true`; the database manager is disabled by default in production).

Local development defaults to `DATABASE_MODE=pglite`; it needs no database URL or PostgreSQL service. Set `DATABASE_MODE=postgres` and `DATABASE_URL` only when using PostgreSQL. The server creates/updates the database schema at startup and seeds the default crop rows when the crop table is empty. PGlite data remains on disk across restarts. Production requires PostgreSQL; if database SSL is required by the provider, configure `DATABASE_SSL` and `DATABASE_SSL_VERIFY` as described below.

### 4. Start the API and web app

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). The health endpoint is [http://localhost:3000/healthz](http://localhost:3000/healthz). In development the server always uses port 3000, even if another `PORT` value is set in the shell. Do not open `public/index.html` as a file or use VS Code Live Server; the app needs the Express API and database running. Localhost pages opened on another port are redirected to port 3000.

For automatic restarts while developing:

```sh
npm run dev
```

On Windows, install a sign-in startup task so the server is running before you open the app:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-autostart.ps1
```

The task always uses the persistent `data/pglite` database and logs to `data/logs/local-server.log`. The server runs as a detached Node process so stopping the scheduled task wrapper does not also terminate the web/API server. A separate one-minute watchdog continues running on battery, verifies that the health endpoint returns HTTP 200 with `status: ok`, and launches the server directly if it is unavailable. A PID/lock guard prevents duplicate instances; if the server remains unhealthy for five minutes, the watchdog restarts its tracked process. Recovery events are logged to `data/logs/watchdog.log`. Safe API reads and sign-in requests retry network failures while the server restarts. `npm run dev` detects a healthy server on port 3000 and does not start a duplicate. To remove automatic startup, run `Unregister-ScheduledTask -TaskName 'AgriConnect Local Server' -Confirm:$false` and `schtasks.exe /Delete /TN 'AgriConnect Local Server Watchdog' /F` in PowerShell.

### 5. Run optional demo data

In a separate terminal:

```sh
npm run seed:demo
```

Demo seeding refuses to run in production and skips when the demo account already exists. Use it only in a development database. Do not rely on demo data as real marketplace data.

### 6. Run tests

```sh
npm test
```

The smoke-test script uses `NODE_ENV=test` and PGlite, an embedded PostgreSQL-compatible test database. It exercises registration/sign-in, uploads, listing approval, location search, bookings, labour, calculator, admin, and database-manager workflows without writing to the configured production PostgreSQL database.

## Run on a phone with Expo Go

The Expo app is a native shell around the same web application; server/API features still require the Node.js app and its configured database to be running.

1. Start the web/API server in one terminal with `npm start`.
2. Find the computer's LAN IP address (for example, `192.168.1.25`).
3. If automatic host discovery does not find the reachable LAN address, set `EXPO_PUBLIC_SERVER_URL=http://<computer-LAN-IP>:3000` in `.env`. Do not use `localhost` as seen by the phone.
4. Start Metro in a second terminal:

   ```sh
   npm run mobile
   ```

5. Scan the Expo QR code using Expo Go. The phone and computer must be on the same Wi-Fi/network; allow Node.js through the Windows firewall if prompted.
6. Test `http://<computer-LAN-IP>:3000` in the phone's browser if the app cannot connect. Restart Metro after changing the Expo public URL so it is included in the bundle.

Metro uses port 8082 to avoid conflicts with common Expo/React Native processes on port 8081. The Expo shell resolves its site URL from `EXPO_PUBLIC_SERVER_URL` or the Expo host URI and provides a native location bridge for one-time and continuous location requests.

For a public deployment, serve the app over HTTPS and use its HTTPS address for mobile clients. Do not expose a development server or development OTPs to the public internet.

## Configuration

The complete template and comments are in `.env.example`.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | HTTP listen port; local development always uses `3000`; other environments default to `3000` and may override it |
| `APP_URL` | Public app URL; use HTTPS in production |
| `EXPO_PUBLIC_SERVER_URL` | Optional reachable server URL embedded into the Expo client |
| `TRUST_PROXY` | Express trusted proxy hop count; set correctly behind Render, Railway, Fly, nginx, or another load balancer |
| `JWT_SECRET` | Signs user/admin session tokens; private, random, at least 32 characters |
| `JWT_EXPIRES_IN_DAYS` | User session duration |
| `OTP_PEPPER` | Secret key for OTP hashing; private, at least 16 characters |
| `DATABASE_MODE` | `pglite` (default outside production) or `postgres` (default in production) |
| `DATABASE_URL` | PostgreSQL connection URL used when `DATABASE_MODE=postgres`; keep private |
| `DATABASE_SSL` | Enable PostgreSQL TLS when required |
| `DATABASE_SSL_VERIFY` | Verify the PostgreSQL TLS certificate; do not disable casually |
| `DATABASE_POOL_SIZE` | Maximum PostgreSQL pool size |
| `SQLITE_SOURCE_PATH` | Earlier SQLite database location for migration; defaults to `./data/agriconnect.db` |
| `UPLOAD_DIR` | Legacy on-disk upload fallback; new listing images are stored in the configured database |
| `MAX_IMAGES_PER_LISTING`, `MAX_IMAGE_MB` | Upload limits |
| `OTP_LENGTH`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_PER_HOUR` | OTP policy and rate bounds |
| `OTP_GLOBAL_MAX_PER_HOUR` | Global hourly cap on OTP SMS across all numbers (SMS-pumping circuit breaker; `0` disables) |
| `ALERT_SMS_MIN_INTERVAL_SECONDS` | Minimum gap between booking/chat alert SMS to the same phone (`0` disables) |
| `SMS_PROVIDER` | `console`, `twilio`, or `msg91` |
| `TWILIO_*`, `MSG91_*` | Credentials/template configuration for the selected SMS provider |
| `MSG91_NOTIFICATION_TEMPLATE_ID` | Optional approved MSG91 Flow template with `VAR1` and `VAR2` for booking/message SMS alerts |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account ensured during startup |
| `DB_MANAGER_ENABLED` | Enables the database manager. Defaults to off in production, on elsewhere |
| `DB_MANAGER_ALLOWED_IPS` | Optional comma-separated IP allowlist for the database manager |
| `DB_MANAGER_EMAIL`, `DB_MANAGER_PASSWORD` | Separate database-manager login (required when enabled in production) |
| `MAP_STREET_TILE_URL`, `MAP_STREET_ATTRIBUTION` | Leaflet street-map tile template and attribution |
| `MAP_SAT_TILE_URL`, `MAP_SAT_ATTRIBUTION` | Leaflet satellite imagery tile template and attribution |
| `LISTINGS_REQUIRE_APPROVAL` | Keep new listings pending for admin review (`true` by default) |

Production configuration rejects console OTP delivery and validates required security settings. It also warns if `TRUST_PROXY=0`; when deployed behind a proxy, configure the correct trusted proxy hop count so client IPs and rate limits work correctly.

## Database and SQLite migration

Local development uses persistent embedded PGlite; production or `DATABASE_MODE=postgres` uses PostgreSQL. Schema initialization is performed at startup. The primary tables are:

- `users`: farmer, owner, and admin accounts.
- `otp_codes`: hashed, expiring, single-use verification challenges.
- `tools`, `tool_images`: machinery listings and image metadata/`BYTEA` bytes.
- `labour_listings`: service/team listings.
- `bookings`: requests, state, amounts, ratings, reviews, and work locations.
- `crops`: editable yield assumptions and indicative prices.
- `saved_calculations`: farmer-owned calculator results.
- `audit_logs`: recorded security and business events.

### Importing an earlier SQLite database

The importer copies existing SQLite data into PostgreSQL and does not modify or delete the source SQLite database.

1. Stop the old application so SQLite data is not being changed during the copy.
2. Back up the SQLite database and the `uploads/` directory.
3. Set `SQLITE_SOURCE_PATH` to the correct SQLite file and `DATABASE_URL` to a PostgreSQL database whose AgriConnect tables are empty.
4. Run:

   ```sh
   npm run migrate:postgres
   ```

5. Confirm the reported row counts and verify images and accounts after starting the PostgreSQL-backed app with `npm start`.
6. Keep the SQLite backup until you have completed verification.

The importer refuses to proceed if any target application table already contains rows. It imports records in foreign-key order, copies image BLOBs, resets PostgreSQL identity sequences, and leaves the source file unchanged. The normal startup process also attempts to import legacy photo files referenced by PostgreSQL rows that have no stored bytes.

Rollback requires stopping the PostgreSQL-backed app and restoring the previous app/database backup. Writes made to PostgreSQL after migration are not automatically copied back into SQLite.

## HTTP API overview

All APIs are under `/api`. State-changing browser API calls require the app's custom CSRF header, and authenticated routes use the `httpOnly` session cookie.

| Route prefix | Responsibilities |
|---|---|
| `/api/meta` | Listing categories, labour skills, upload limits, approval setting, and map tile settings |
| `/api/auth` | Registration OTP, registration verification, OTP/password login, password reset, current user/profile, logout |
| `/api/tools` | Search/detail, owner machine CRUD, availability, photo management |
| `/api/labour` | Search/detail, provider listing CRUD and availability |
| `/api/bookings` | Create/list/detail, summaries, allowed status transitions, review |
| `/api/communications` | Notifications, booking messages, and private farmer/provider service chats |
| `/api/calculator` | Crop list, yield calculation, polygon measurement, farmer saved calculations |
| `/api/admin` | Admin stats, moderation, user management, bookings/audit, crop maintenance |
| `/api/database-manager` | Separate database-manager session, table listing/search, record edit/delete, password reset, CSV export |

Validation is applied to route inputs with Zod schemas. The server responds with structured errors for invalid requests and authorization failures.

## Security and privacy

- Use strong, unique production secrets and a PostgreSQL user with only the privileges the app requires.
- Never commit `.env`, database backups, local SQLite files, uploads, or credentials. `.gitignore` excludes these local files.
- User passwords are stored as bcrypt hashes. OTP values are hashed with `OTP_PEPPER`, expire, have attempt/resend limits, and are single-use.
- User sessions are JWTs in `httpOnly`, `SameSite` cookies. Password resets and account blocks invalidate existing sessions.
- State-changing API requests require a custom header as a CSRF defense. Sensitive endpoints also enforce authentication and role checks.
- Helmet security headers, a restrictive content security policy, rate limits, request validation, and upload byte-signature validation are enabled.
- Login and OTP endpoints use dedicated limits rather than the general API request budget. Password/admin login limits are scoped to the account and client IP and count failed logins only, so successful sign-ins and normal background API polling do not lock users out; OTP delivery and verification limits remain in force.
- Listing images are stored as PostgreSQL `BYTEA` and served with safe content headers. The database manager does not return raw image bytes.
- Booking messages and service chats are visible only to their farmer/provider participants. Farmers can start a service chat from an approved machine or labour listing before booking. Text and voice messages record the selected English, Telugu, or Hindi language but are not automatically translated. Voice notes are limited to 60 seconds in the browser and 3 MB on upload. Both participants' phone numbers remain hidden in service chats until a booking for that listing is accepted; then either participant can tap to call. SMS alerts contain a generic sign-in prompt, never message content. In-app notifications and open chats refresh while the app is active; MSG91 SMS alerts require a separately approved Flow template.
- Configure HTTPS in production, restrict database network access, keep backups private, and review audit records.

## Tests and demo data

| Command | Purpose |
|---|---|
| `npm start` | Start the production-style Node.js server |
| `npm run dev` | Start with Node.js watch mode |
| `npm run mobile` | Start Expo Metro in LAN mode on port 8082 |
| `npm run seed:demo` | Add optional development-only demo data |
| `npm run migrate:postgres` | Import the configured SQLite source into PostgreSQL |
| `npm test` | Run end-to-end smoke tests with PGlite |

Tests use an isolated PGlite database when `NODE_ENV=test`; they should not change the live PostgreSQL database. Run tests from the project root.

## Production checklist

1. Provision PostgreSQL and set a private `DATABASE_URL`; configure provider-required TLS.
2. Set `NODE_ENV=production`, HTTPS `APP_URL`, correct `TRUST_PROXY`, strong random `JWT_SECRET`/`OTP_PEPPER`, and unique admin/database-manager credentials.
3. Configure Twilio or MSG91 for OTP delivery. For India, use the appropriate DLT-approved sender/template setup with your SMS provider.
4. Put the app behind HTTPS and restrict access to PostgreSQL and administrative pages.
5. Persist and back up PostgreSQL. Keep uploads available for any legacy image files still awaiting import.
6. Check operational logs, database health, backup restore procedures, and account recovery before inviting users.
7. Review OpenStreetMap and Esri tile-provider terms, attribution requirements, usage limits, and production suitability.
8. For multiple application instances, use a shared PostgreSQL service and shared image/object storage (for example, S3-compatible storage); the current image implementation stores bytes in PostgreSQL.

The Dockerfile packages the Node.js app and exposes port 3000. It does not start PostgreSQL; connect it to a separately provisioned PostgreSQL service and provide configuration through the deployment platform's secret/environment settings.

### Vercel

The web app and API are deployed together through `api/index.js`; `vercel.json` sends requests to the Express app, including its `public/` assets and locally served Leaflet files. In Vercel, use the repository root, Node.js 24, and no separate frontend build or output directory. The function runs the application bootstrap on its first request in each instance. The Expo mobile shell is not part of this web deployment and should be built separately with Expo Application Services.

Configure `NODE_ENV=production`, `DATABASE_MODE=postgres`, `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, `TRUST_PROXY=1`, and a production SMS provider with its credentials in Vercel Environment Variables. Set `APP_URL` to the deployed HTTPS origin and `DATABASE_SSL`/`DATABASE_SSL_VERIFY` as required by the PostgreSQL provider. Use a PostgreSQL connection pooler where available; the default connection pool is reduced to two per Vercel function instance. Vercel uses `/tmp` for the legacy upload fallback; listing photo bytes are stored in PostgreSQL. Vercel limits function request bodies to about 4.5 MB, so the Vercel default allows up to 0.5 MB per image (six images fit within one request). Larger upload support requires direct-to-object-storage uploads or a backend host with a higher request-body limit.

## Limitations and operational notes

- The PWA can cache the app shell and selected interface assets, but authentication, maps, searches, bookings, calculator saves, and other data operations require a network connection.
- SMS delivery is only real when Twilio or MSG91 is configured correctly. Console OTP mode is for development and is refused in production.
- GPS accuracy depends on the device, permissions, network, sky visibility, and surrounding buildings/trees. A map-drawn boundary has assumed point-placement error. Neither method is a certified cadastral survey.
- Crop yields, rates, and revenue are indicative inputs/estimates. Confirm local prices, measurements, service availability, and provider details before making decisions.
- The application opens near Hyderabad at `17.4576477, 78.3955979` when it has no usable saved/GPS location. Users must explicitly grant location permission for GPS features.
- Map tile availability, zoom/detail, attribution, and terms are controlled by the configured external map tile providers. External Google Maps links do not provide Google tiles inside the application.
- Keep the Node.js application running for the local site to be available; local development does not require a separate PostgreSQL service.
