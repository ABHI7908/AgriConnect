# AgriConnect

Marketplace where farmers find nearby tractors, harvesters, drones and farm labour, with OTP login for farmers and
machinery owners, photo uploads, booking history, an admin panel, a GPS land-measuring tool and a crop-yield calculator.

Stack: Node.js 20+, Express 5, PostgreSQL, zod validation, JWT in an httpOnly cookie,
Leaflet maps using OpenStreetMap and Esri tile layers. No API key or build step is required for the maps.

## Run locally
    npm install
    # Create a PostgreSQL database named agriconnect, then copy .env.example to .env.
    # Set DATABASE_URL privately in .env (never paste database credentials into chat or commit them).
    npm run seed:demo           # optional demo owners, machines, farmer
    npm start                   # http://localhost:3000
    npm run mobile              # then scan the Expo Go QR code on the same Wi-Fi
    npm test                    # end-to-end API checks

The server requires a running PostgreSQL instance. Set `DATABASE_URL` in `.env` to the
connection URL for your database, for example
`postgresql://USER:PASSWORD@localhost:5432/agriconnect`. For managed PostgreSQL, use the
provider's connection URL and SSL requirements. The app creates its schema on startup.

To retain data from an earlier SQLite installation:
1. Stop the old application and back up the SQLite database and `uploads/` directory.
2. Set `SQLITE_SOURCE_PATH` to the backed-up SQLite file and `DATABASE_URL` to an empty PostgreSQL database.
3. Run `npm run migrate:postgres`. The importer refuses to write if any target application table
   already contains rows; it imports all tables in foreign-key order, including photo BLOBs, and
   leaves the source file unchanged.
4. Start the app with `npm start`. Startup imports any legacy image files still referenced by
   rows that did not contain image bytes in SQLite.

Keep the SQLite backup until you have verified the migrated records and images. Rollback means
stopping the PostgreSQL-backed app and restoring the previous SQLite application version and its
backup; PostgreSQL writes made after migration are not copied back to SQLite.

For Expo Go, run `npm start` and `npm run mobile` in two separate terminals. The Expo
Metro server uses port 8082 to avoid clashing with common Expo/React Native processes on
8081. Keep the
phone and computer on the same Wi-Fi network and allow Node.js through the Windows
firewall when prompted. The mobile shell loads the web app from the computer's LAN
address on port 3000. If the address cannot be discovered automatically, set
`EXPO_PUBLIC_SERVER_URL=http://<computer-LAN-IP>:3000` in `.env`, then restart Expo so
Metro includes the setting in the mobile bundle. Check that address in the phone's browser
first if Expo Go still cannot connect.

Farmers and machinery owners/labour providers must register with their name, email, mobile number, password, and a mobile OTP verification. After registration, log in with the registered mobile number and either a fresh OTP or the password. Forgot-password resets require a verified OTP on the registered mobile and invalidate existing sessions. In development, `SMS_PROVIDER=console` prints the OTP and shows it on the page.
Sign in or create an account to open the marketplace, farm dashboard, or yield calculator. After authentication, the app returns you to the page you requested.
Admin: /admin with ADMIN_EMAIL / ADMIN_PASSWORD from `.env`.
Database manager: /database-manager with the separate DB_MANAGER_EMAIL / DB_MANAGER_PASSWORD from `.env`.

## Maps
The in-app marketplace, owner location picker, and land calculator use OpenStreetMap street tiles
and Esri World Imagery satellite tiles; a Google API key is not required. Attribution and tile URL
settings are in `.env.example`. Use the **Open in Google Maps** buttons on listings to open the
owner’s mapped coordinates in Google Maps (the external link does not require an API key).

## Pages
/ search nearby machines or labour · /login (farmer / owner, OTP) · /farmer · /owner · /admin · /database-manager · /calculator

The same responsive web app supports desktop, tablet, and mobile browsers. It is installable
as a PWA on supported browsers; on iPhone/iPad, open the site in Safari and choose Share →
Add to Home Screen. The service worker precaches the app pages and interface assets, but
login, search, bookings, and other data operations still need a network connection.

The database manager can search, edit, delete, and export business and user records.
Password hashes, session token versions, OTP records, admin accounts, and raw image bytes
are not exposed; audit records are read-only. Machine photos are stored as PostgreSQL BYTEA and
shown as previews in the manager. Deleting a user can cascade to linked records, so back up
the PostgreSQL database before making destructive changes.

## Features
- Nearest-first search using GPS or a tapped map point (bounding box + haversine).
- Owners upload up to 6 photos per machine (magic-byte checked and stored as PostgreSQL BYTEA); labour teams can be listed too.
- Bookings with accept / start / complete / cancel, ratings, and per-user history (services used / customers served).
- Admin: stats, approve or reject listings, block users (sessions end at once), all bookings, audit log, edit crop table.
- Calculator: land in acres / guntas / hectares, any bag weight, per-acre or per-gunta yield, income; "check actual yield" mode.
- GPS land measure: walk corners (5 s of fixes averaged per corner) or draw on satellite map; geodesic area and an
  uncertainty estimate. 1 acre = 40 guntas.
- The land calculator centers the map on your current location and shows a location marker; allow location access.
  If GPS is unavailable and there is no saved position, it opens near Hyderabad at 17.4576477, 78.3955979.
  On mobile, tap Start GPS to keep your position updated while walking the boundary.

## Background video and devices
- The hero video plays muted and looped behind every page (`public/media/`: `hero.mp4`/`.webm` for desktop and tablets,
  `hero-small.*` for phones, `hero-poster.jpg` as the still). It shows only the poster when the visitor prefers reduced
  motion or has Data Saver on, and pauses when the tab is hidden. To swap the video, re-encode with ffmpeg
  (`-an -vf scale=1280:-2 -c:v libx264 -crf 29 -movflags +faststart`) and replace those files.
- Works on Android, iOS, tablets and desktop. It can be installed to the home screen (PWA: `manifest.webmanifest`, `sw.js`,
  icons). The service worker only registers over HTTPS (or localhost).

## Going to production
1. `NODE_ENV=production`; set strong `JWT_SECRET`, `OTP_PEPPER`, `ADMIN_PASSWORD`, and `DB_MANAGER_PASSWORD` (at least 16 characters), `DATABASE_URL`, `APP_URL` (https), `TRUST_PROXY=1`.
2. `SMS_PROVIDER=twilio` or `msg91` with credentials (console SMS is refused in production). Use a DLT-approved template for India.
3. Put it behind HTTPS (nginx / load balancer). Back up PostgreSQL and keep the `uploads/` directory available while legacy photos are being imported at startup.
4. Review the usage terms and traffic limits for the OpenStreetMap and Esri tile providers before production use.
5. For multiple app instances, use a shared PostgreSQL service and move `services/storage.js` to S3/R2.
