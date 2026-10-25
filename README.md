# Inventory and Production System — private local recreation

Runs at **http://localhost:4173**. This is an offline recreation of the application visible through `https://sst.dnsalias.com/`, using captured screens and transcribed visible records. The original site is a streamed Windows application, not a conventional HTML inventory website.

## Start

Requires **Node.js 24 or newer**. Tested with Node 24.12.0. Run `npm install` once to install the PostgreSQL driver. Local SQLite use does not require a database server or original-site login. Create a local account before signing in.

```sh
cd /Users/abdulz/Desktop/codex-code/js_inventory
npm install
npm run user:set -- admin
npm start
```

Open **http://localhost:4173** in your browser. Stop the server with **Ctrl+C** in the terminal that started it. After extracting the archive elsewhere, run `npm start` from the extracted project directory.

The server listens only on `127.0.0.1`. All runtime images, scripts, styles, reference screens, and data are local. Internet access and the original server are unnecessary.

## Data and database

- SQLite database: `data/inventory.sqlite`.
- Initial snapshot: **161 records across 20 collections, plus 13 transaction line items**. These are captured records, not a complete export of the original database.
- Tables: `collections`, `records`, `line_items`, and `metadata`. Record fields are stored as JSON; transaction lines have foreign keys to their parent records.
- On first startup, an absent database is seeded from `dist/data.js`. Existing databases are preserved on restart.
- Local Add/Edit/Delete/Save operations persist in SQLite and are available to other browser sessions after reload. They never update the original application.
- Concurrent saves use revision checks. A stale window is prevented from overwriting newer data.
- Earlier browser-storage records are migrated when the database is first initialized, if present.

Use **Help → Export local data** for a portable JSON backup. **Help → Import local data** validates an exported file and asks before replacing its local tables.

To create a consistent SQLite backup while the app is running:

```sh
npm run backup
```

The backup is written to `backups/`. Do not copy only the main SQLite file while the server is running: active changes can be in its WAL file. Prefer the backup command or JSON export.

## Included behavior

- Setup, Transactions, Reports, System Admin, and Help navigation.
- All 14 observed setup screens and six transaction entry screens.
- First/Previous/Next/Last navigation, table selection, search, local Add/Edit/Delete, Undo, and Save.
- Captured receiving, cutting, delivery, and finished-goods line items; local line entry and removal.
- Nine local report views, text/date filters, observed pipe/thickness/buyer/supplier filters where applicable, and grouping of captured rows.
- CSV export, browser printing/Save PDF, and JSON import/export.
- Window movement, minimize/restore, maximize, keyboard menu navigation, and responsive layouts.
- Original captured background and toolbar artwork. Reference captures are available under **Help → Captured screens**.

## Capture limits and local substitutes

See `capture/manifest.json` and `CAPTURE_NOTES.md` for the file inventory and per-screen coverage.

- The full original database, Windows executable, backend source, report templates, and unlinked server files were not downloaded.
- Lists include only visible captured rows. Item Master and Strip Size include one record each. Supplier/buyer contacts are populated only where observed. Uncaptured fields remain blank; some original grid text was truncated.
- Production Output returned **“Databse is Empty”**. Its empty form was inspected; no production output records are included.
- The original Coil Receiving print preview returned **“Load report failed.”** Original generated report files were therefore unavailable.
- Reports are local summaries of the included records and local additions. They do not reproduce live inventory reconciliation, original joins, historical balances, or server calculations. Missing record dates cannot be inferred.
- Coil cutting calculations and posting are implemented as described below. Original production calculations, labels, DC/Gate Pass layouts, and original Opening Stock posting are unavailable. Strip Size Opening Stock is a local edit of its recorded opening quantity.
- System Admin screens explain the limitation. Original accounts, administrator codes, and permissions were not copied.
- All application pages, captures, scripts containing records, and APIs require a valid session. The server remains bound to localhost.

## Project files

```text
server.mjs                 Local HTTP server and database API
database.mjs               SQLite schema, validation, seeding, and transactions
dist/                     Application HTML, CSS, JavaScript, and local assets
dist/data.js              Captured reference data and screen definitions
dist/reference/           Original visible-screen captures
data/inventory.sqlite     Local SQLite database
capture/manifest.json     Capture inventory, provenance, and limitations
verification/             Browser check results and local screenshots
tools/                    Inspection, backup, and verification helpers
```

`tools/browser.py` and `tools/ocr.swift` were used for authorized screen inspection on macOS. They are not needed to run the recreation. No original-site passwords, cookies, or authentication tokens are included. Private data and captured assets are excluded by `.gitignore`; the full local archive includes them for this private deliverable.

## Verification

```sh
npm run check
```

Browser verification also exercises navigation, record search, SQLite CRUD and reload persistence, transaction lines, JSON import/export, CSV export, report filters, responsive layouts, local reference images, revision conflicts, and rejection of cross-origin writes. Results are in `verification/results.json`. Checks run against a separate temporary database, not the deliverable database.

The optional browser test helper requires a separate Chrome debugging instance on `127.0.0.1:9223`, pointed at an isolated local server. Its URL can be selected with `QA_URL`; a test server can use `PORT` and `INVENTORY_DB_PATH`. These are local development settings, not deployment configuration.

## Hosting

Render free web service + PostgreSQL support is implemented. Set `DATABASE_URL` to the **Internal Database URL** on Render; use the **External Database URL** for migration/backup tools on your Mac. Inventory, encrypted accounts, sessions and login limits then persist in PostgreSQL. Without `DATABASE_URL`, the existing local SQLite setup remains active.

Follow [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for environment variables, initial administrator setup, migrating existing inventory and backups. `render.yaml` configures a free web service using the database you already created. The app has not been published automatically; deployment still needs access to your Render service and an up-to-date repository.

The deployable `dist/schema.js` contains only UI definitions, with no business rows. Private `dist/data.js` remains a local seed/reference file and is not needed by the Render build. Runtime artwork is copied from tracked `assets/` during `npm run build`.

## Authentication

Create an account or reset its password with `npm run user:set -- USERNAME`. Enter a unique password of 8–256 characters at the hidden prompt. There are no default accounts or public signup. Resetting a password revokes that account’s existing sessions.

Passwords use salted scrypt (N=32768, r=8, p=1). Usernames are encrypted using AES-256-GCM, with keyed lookup identifiers. Authentication lives in `data/auth.sqlite`; its encryption key is `data/auth.key`. Keep both private and restrict access to the server account. Encryption does not protect against an attacker who can read both the database and key. The existing inventory database is not encrypted by this change.

Sessions use random 256-bit tokens stored only as SHA-256 hashes on the server, HttpOnly and SameSite=Strict cookies, a 30-minute idle timeout, and an 8-hour absolute lifetime. Sign out revokes the current session. Writes require a matching browser origin and session CSRF token. Login attempts are limited per account, address, and globally over 15 minutes. Limits persist across restarts. All local accounts have full inventory access; original role management is not reproduced.

For remote access, use a trusted HTTPS reverse proxy, keep the Node listener private, and set `COOKIE_SECURE=1` plus `PUBLIC_HOST=your-domain.example` (include a port if needed). This enables Secure cookies and HSTS. Do not expose an HTTP deployment or publish the static dist directory separately. Authentication does not encrypt HTTP traffic. Secure the host, restrict database/backups/archive access, and protect encryption keys separately. The existing ZIP is an older deliverable and does not contain these changes.

`npm test` checks authentication against an isolated temporary database. Inventory backups do not include authentication: securely back up auth.sqlite and auth.key together with the service stopped if account recovery is needed.

## Coil cutting and stock tracking

1. In **Transactions → GRN (Goods Received Note)**, add or edit a receipt. For each physical coil, select **Coil Type** and **Coil Code** from Item Main Category, then enter **Width** in millimetres, **Weight** in kilograms, and **UOM = KG**. Enter the receipt date; the server assigns a Coil ID when you save. Click **Submit line**, then **Save**. Existing captured receipts do not have verified widths, so they are not automatically tracked. Widths are not inferred from product descriptions.
2. In **Cutting Creation**, click **Add**, type the full ID in **Find coil by full ID** (or select **Coil Reference**), and enter **Processed Weight** in kg. The summary shows the original width and currently available coil weight. Choose **Scrap** or **Reusable** for unused width.
3. Select a **Pipe Code**. Matching strip sizes come from **Setup → Strip Size Setup**, where **Size** is the strip width in mm. When exactly one strip matches, it is selected automatically; otherwise choose the strip. You can enter strip details manually when the captured setup is incomplete. Enter **Quantity** as the number of parallel strips, not pipe pieces. The live preview includes the line currently being entered. Click **Submit line** to add it to the layout.
4. The form calculates allocated width, remaining layout width, utilization, estimated line weight, and trim/remnant weight. **Save** creates a draft without consuming stock. **Post cutting** validates and consumes the processed coil weight atomically, then locks the job. Repeated saves or reloads cannot double-deduct it.
5. To correct a posted job, use **Void cutting**, then create a new job. Voiding restores coil weight and removes that job’s outputs from the active ledger. Posted/void jobs cannot be deleted or changed. A receipt used by posted jobs is protected until those jobs are voided.
6. **Reports → Coil & Strip Stock** shows tracked coil balances and estimated strip, scrap, and reusable remnant outputs. Refresh loads changes saved in another window.

For equal material, thickness, and processed length: allocated width = sum(strip width × strip count); remaining layout width = original coil width − allocated width; strip weight = processed kg × allocated strip width / original coil width. Unallocated width is classified entirely as scrap or reusable remnant. Input weight equals estimated strip output plus estimated trim/remnant weight. No separate kerf, density, actual weighed outputs, or process-loss adjustment is modeled. The unprocessed coil retains its original width; its remaining weight decreases. Drafts do not reserve stock; posting rechecks availability using the database revision inside a transaction.

Captured historical cutting jobs are unposted and do not alter balances until explicitly reviewed and posted. Backdated drafts are checked against current stock, not a historical reconstruction. Cutting outputs form a traceable ledger; downstream production and delivery do not yet consume those outputs, and the older Total Stock / Coil In Hand reports are still captured-data summaries. Use Coil & Strip Stock for the new cutting balances.

Verification: `npm test` covers authentication, cutting geometry, weight conservation, invalid inputs, stock availability, draft/post/void behavior, immutability, and SQLite revision conflicts. `node tools/verify-cutting.mjs` additionally exercises an isolated headless Chrome workflow (requires Google Chrome on macOS).

## Coil IDs and physical labels

A generated ID has the format **C-001-00002-2026**: C means CRC (H for HRC, G for GI), 001 is the user-entered Coil Code, 00002 is that type’s lifetime running coil number, and 2026 is the receipt year. The number is counted separately per type across all coil codes and does not reset in a new year. Codes shorter than three digits are padded. IDs are allocated atomically on Save; failed or stale saves do not advance counters. Persistent counters prevent reuse after deletion. Existing historical IDs and manufacturer identifiers are preserved.

After saving a GRN, click **Coil labels · Print / Save PDF**, or **Print coil label** beside the individual coil. The preview shows the full ID, description, original width, received weight and unit, supplier/date, receipt, item code, manufacturer number, batch, coil code, grade/type, hardness, and delivery challan. Missing captured values say “Not recorded”. Select a single coil or **All coils — one page each**, then use **Print / Save PDF**. Labels use A4 portrait with a large ID for attachment to the physical coil; turn off browser headers/footers. Labels reflect original receiving measurements, not a changing remaining balance.

In Cutting Creation, enter the full printed ID in **Find coil by full ID** to select the same physical coil and display its current available stock. Labels and lookup remain available only after signing in.

## Strip-count suggestions and labour job sheets

In Cutting Creation, select the coil and a strip width. The live **maximum strip count** uses the full coil width for the next separate cut: `floor(coil width / strip width)`. Earlier cuts consume weight, not the width of the unprocessed coil. **Use maximum for this strip width** fills the current line’s strip count; review it, then Submit line.

For a mix, submit the desired strip widths (the last width may still be in the line editor), then click **Suggest best mix of selected widths**. The optimizer keeps at least one strip of every selected line, minimizes unused width, and prefers more strips when layouts have equal unused width. It only uses the selected widths and does not invent other products. Use **Submit suggested cut** to add the proposed widths together as one new cut with a shared input weight. Earlier submitted cuts are not replaced. Changing the source layout invalidates the previous suggestion. Mixed suggestions support up to 24 selected lines and three decimal places in mm, with a bounded exact integer search; unsupported inputs are rejected instead of approximated.

Example: a 1,200 mm coil with a single 230 mm strip size fits five strips and leaves 50 mm. Selecting both 230 mm and 100 mm widths allows a suggested mix of three 230 mm strips plus five 100 mm strips: 1,190 mm used and 10 mm unused. This is a geometric width calculation; no knife/kerf or mandatory edge-trim allowance is included. The operator must verify machine allowances before cutting.

Posting opens a **Cutting Job Sheet** preview. Use **Print / Save PDF** to issue it to the labour team. It contains the full coil ID, posted job number/date, receipt, material/batch, coil width, weight to process, strip widths/counts, estimated weights, trim disposition, comments, and blank spaces for actual output/scrap weights and operator/supervisor signatures. The sheet shows the immutable posted layout, not an unapproved suggestion. Reprint it with **Print labour job sheet** on the posted cutting record. Draft and void jobs cannot issue job sheets. Sheets use A4 portrait, four lines per numbered page for per-cut jobs (six for legacy shared layouts), with continuation sheets for longer jobs. Turn off browser headers/footers when printing.

## GRN item and coil dropdowns

- **Setup → GRN Item Setup** opens the existing Item Master Setup. Add an item with its Code and Description, then save. No duplicate item database is created.
- In GRN, both **Item Code** and **Item Description** are dropdowns backed by that item master. Choosing either selects the matching item in both fields. Where the item has a valid Main Category Code, its coil category is selected too.
- **Coil Type** and **Coil Code** are linked dropdowns backed by **Setup → Item Main Category**. Category Name is the coil type; its three-digit Code is the coil code. Choose either name or code to fill both. There are no separate coil type/code setup lists.
- Item Main Category includes an optional **Prefix** for generated coil IDs. If blank, the first letter of the category name is used. For example, category 001 named CRC COIL with prefix C produces C-001-00001-2026 for the first issued C coil. The lifetime sequence is shared by categories using the same prefix, preserving existing numbering history.
- Existing receipt descriptions and IDs remain historical snapshots. Editing setup names does not rewrite them. New receipt lines must reference current items/categories; their descriptions are saved from the item master.

## Classic desktop interface and current functionality

The app uses the original desktop background, Windows-style form windows, compact fields, tables, and artwork-based icon toolbar. The existing Setup, Transactions, Reports, System Admin, and Help menus and record actions are preserved. Current functionality remains available: authentication, linked GRN dropdowns, category-based coil IDs, cutting calculations and suggestions, posting/voiding, consumed-coil field locking, stock reports, printable labels/job sheets, local date defaults, and the live clock.

`dist/style.css` supplies the original interface. `dist/classic-appearance.css` adds retained utilities and dark-mode colours for screen media only. The broader modern theme is not loaded. Paper labels and job sheets retain their dedicated print rules. Dashboard shortcuts and inline setup search remain available in the classic presentation; minimize/restore/maximize and unsaved-change indicators also remain.

Browser verification exercises all setup, transaction, report and admin screens, navigation, receiving/cutting/printing, current-date defaults, theme persistence, and narrow-screen layouts. Current interface screenshots are saved under `verification/classic-*.png`.

## Dates, clock, and dark mode

Date fields use the browser’s native calendar. Click an editable date field or its calendar icon to choose a date. The main **Date** on a new transaction defaults to today in the browser’s local time zone; saved dates are preserved when viewing or editing existing records. External bill/DC dates and report filter dates stay blank until chosen, so missing document dates are not invented and historical reports are not filtered out by default.

The header displays the current local date and a clock that updates every second, including across midnight. This live display does not change a document date while an employee is working.

Use the **Dark mode / Light mode** button in the top-right corner (sun/moon icon on narrow screens). The choice is remembered in that browser and shared between the login page and workspace. Without an explicit choice, the interface follows the device’s colour preference. Switching themes preserves unsaved fields and does not reload the page. Paper labels, job sheets, and reports retain their light print styling.

## Separate cuts and running coil balance

Each **Submit line** in Cutting Creation records a separate physical cut with its own **Cut No** and **Cut Weight**. **Weight for next cut (kg)** is an entry field; changing it never changes the weights of submitted cuts. The table shows the saved cut weights alongside estimated strip output weights. Each cut starts with the original coil width because it processes another portion of the coil length.

For a 5,000 kg coil: enter 2,000 kg and submit the first strip layout; the projected balance becomes 3,000 kg. Enter 2,000 kg again and submit the next layout; the projected balance becomes 1,000 kg. Entering 500 kg for a subsequent cut leaves those first two cuts unchanged. The preview clearly identifies any next cut that has not yet been submitted. Saving a draft does not consume stock; posting deducts the sum of cut input weights once, and voiding restores that sum.

A **Submit suggested cut** action can add several strip-width rows sharing one Cut No and Cut Weight. Those rows consume that input weight once. Removing a row belonging to a grouped cut removes that whole cut; its tooltip identifies this. Job sheets show cut numbers, each cut’s input weight/unused width, and the total weight to process. Stock output records also identify their cut number.

Older jobs with no per-cut fields retain their original single shared-weight calculation. They are not silently reinterpreted as separate cuts. To correct an already posted old job, void it, then create a replacement with each physical cut submitted separately. An old draft can be reviewed or replaced before posting. The server validates per-cut totals and prevents combined cuts exceeding available stock.

## Reopening saved cutting job sheets

Closing Cutting Creation or its A4 preview does not delete a saved job. **Reports → Cutting Job Sheets** lists saved jobs with their date, coil ID, processed weight and status. Search by job number or coil ID, then choose **A4 job sheet** to reopen a posted sheet and use **Print / Save PDF** again. Draft, unposted and void jobs do not issue labour sheets.

Cutting Creation also has a **Saved cutting job** selector and a **Saved job sheets** button. It remembers the last viewed job in the current browser tab. The existing **Report** toolbar icon opens the labour sheet when the selected cutting job is posted. Sheet URLs include the job number and reopen that same sheet after a reload while signed in. The **Back** button returns to the originating list or cutting record. Printed content is regenerated from the saved job; saving a PDF file to your computer remains an explicit print-dialog action.

GRN now includes a **Saved receipt** selector showing receipt number, date, coil identifiers and the number of saved coil lines. It remembers the viewed receipt in the current browser tab and initially opens the latest receipt when there is no prior selection. Receipt links include `?receipt=NUMBER` in the screen fragment, so refreshing or reopening the link retains the intended receipt and its line items. Use **Print coil label** or **Coil labels · Print / Save PDF** on that saved receipt.

## Use remaining width within the same cut

While editing a draft cutting job, each submitted cut with spare width has **Use remaining width** in its calculation table. The dropdown lists configured pipe/strip sizes from **Setup → Strip Size Setup** that fit within that cut’s unused width, with a valid pipe mapping and matching recorded thickness where available. Each option shows its strip width, maximum strip count and width left at that maximum. Options with the least leftover width are listed first. If no matching size exists, add it in setup; the app does not invent product specifications.

Select a size, choose its strip count and Issue Yes/No, then **Add to this cut**. The new strip line shares the original Cut No and Cut Weight, so no additional input weight is consumed. Quantities exceeding the available width are rejected. Posted and void jobs cannot be modified; reuse must be planned before posting.

Example: a 3,000 kg, 900 mm coil has a 1,500 kg cut with four 200 mm strips. This leaves 100 mm in that cut. Adding one configured 100 mm strip uses the whole 900 mm, leaves zero trim, and still processes only 1,500 kg. The unprocessed coil remains 1,500 kg. The job sheet prints both widths under the same cut number.

**Issue** is now a Yes/No dropdown in transaction line editors that have this field. Values remain Y/N in saved records for compatibility with the existing issue reports.
