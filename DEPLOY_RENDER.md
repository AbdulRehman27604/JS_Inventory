# Deploy to Render using the database you already created

This app supports Render's free web service and free PostgreSQL database. It uses `DATABASE_URL`; it never stores hosted inventory, accounts or sessions in a temporary SQLite file. Your local app still uses its existing SQLite files when `DATABASE_URL` is absent.

## 1. Create or configure the web service

Use the existing GitHub repository. Choose a **Node Web Service**, the `main` branch and the **Free** plan. Choose the **same region as your existing PostgreSQL database**.

| Setting | Value |
|---|---|
| Node version | `24.12.0` |
| Build command | `npm ci && npm run build && npm run check` |
| Start command | `npm start` |
| Health check | `/healthz` |

Alternatively, use the provided `render.yaml` Blueprint. It defines only a free web service and does **not** create another database. The Blueprint defaults to Oregon; set its region to match your existing database before using it. Automatic deploys are off initially, so code pushes alone do not start an unreviewed deploy.

## 2. Add environment variables to the web service

In **Web Service → Environment**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your existing database's **Internal Database URL** |
| `AUTH_ENCRYPTION_KEY` | A long random secret generated once; keep it unchanged on later deploys |
| `ADMIN_USERNAME` | Your chosen administrator username, such as `admin` |
| `ADMIN_PASSWORD` | Your own password, 8–256 characters |
| `COOKIE_SECURE` | `1` |
| `HOST` | `0.0.0.0` |

The Blueprint generates `AUTH_ENCRYPTION_KEY` automatically. For a manually configured service, generate a value locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy its output directly into Render's secret environment field. Do not post it in chat or commit it. Back it up securely: losing or changing it makes existing encrypted usernames inaccessible. The app checks its fingerprint against the database and refuses to start with the wrong key.

Render supplies `PORT` and `RENDER_EXTERNAL_HOSTNAME`. A custom domain can be selected with `PUBLIC_HOST=inventory.example.com` (host only, no scheme); otherwise the app uses the assigned Render hostname automatically. Render terminates HTTPS, and the app sets Secure session cookies. The internal database connection uses Render's private network; where supported it uses TLS with Render's self-signed internal certificate. External Render database connections use certificate-verified TLS.

The initial administrator is created only if the accounts table is empty. Later deploys do not reset an existing administrator's password. Remove `ADMIN_PASSWORD` and `ADMIN_USERNAME` after the first successful login if desired. No default accounts or passwords are shipped.

## 3. Move your existing inventory

A new PostgreSQL database starts with empty inventory tables. The deployment does not publish captured business records in Git.

On your **Mac**, create `.env.render.local` in the project folder containing just:

```dotenv
DATABASE_URL=YOUR_RENDER_EXTERNAL_DATABASE_URL
```

Use the **External** URL here because your Mac cannot reach Render's private hostname. The real file is ignored by Git. Keep this file private.

First validate the local source, then migrate:

```sh
npm run db:migrate -- --dry-run
npm run db:migrate:env
```

The import transfers inventory, line items, posted jobs and coil numbering counters in one transaction. It refuses to overwrite a destination that already contains inventory. It advances the revision so a stale empty browser window cannot overwrite imported data. Local records remain unchanged. Refresh the deployed app after import.

This default migration moves inventory only. Use the cloud administrator created in step 2. To preserve existing local account hashes as well, migrate into a database without accounts using `--with-users`, and set `AUTH_ENCRYPTION_KEY` to the **existing local `data/auth.key` bytes encoded as hex** in both the migration environment and Render. Do not enable the new-admin bootstrap before that account migration. This is optional; do not mix two different encryption keys.

## 4. Back up the free database

Render's free PostgreSQL tier currently provides 1 GB, expires 30 days after creation, and has no managed backups. Free web services also sleep after 15 minutes without inbound traffic. See [Render free-instance limitations](https://render.com/docs/free).

To back up PostgreSQL from your Mac using the External URL in `.env.render.local`:

```sh
npm run backup:env
```

A private JSON archive is written under `backups/`, including inventory, numbering metadata and encrypted account records. It excludes session tokens and does not contain your encryption key. Preserve the key separately. Download backups before the database expires.

To restore an archive into a new empty PostgreSQL database:

```sh
npm run db:migrate:env -- --from backups/FILE.json
```

Use `--with-users` only with the matching encryption key and an empty accounts table. Destination data is never silently replaced.

For password changes on a free service (which does not provide shell access), put the External URL and the same authentication key in your private env file and run:

```sh
node --env-file=.env.render.local tools/set-user.mjs admin
```

Enter the new password at the hidden prompt. Existing sessions for that account are revoked.

## 5. Verify the live deployment

Open `https://YOUR-SERVICE.onrender.com/healthz` (should return `{"ok":true}`), then `/login`. Check that inventory appears after migration and that saving and reloading a test record persists. Unauthenticated `/api/data` must return 401. Runtime images are copied during the build; private reference captures and local databases are intentionally excluded from the deployment.

Source: [Render web services](https://render.com/docs/web-services), [Postgres connections](https://render.com/docs/postgresql-creating-connecting), [Blueprint configuration](https://render.com/docs/blueprint-spec).

## Local verification

- `npm test`: SQLite and calculation regressions; PostgreSQL test is skipped without a test URL.
- `TEST_DATABASE_URL=postgresql://... npm run test:postgres`: real PostgreSQL migration, transaction/concurrency, secure-cookie and restart-persistence checks, in a temporary schema.
- `npm run verify:deploy`: creates a clean Git-file-set copy, installs locked dependencies, builds and starts it without ignored private files.
- `node tools/verify-cutting.mjs`: full isolated browser workflow.
