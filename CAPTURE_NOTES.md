# Capture notes

The authorized session displayed an HTML5 remote-desktop canvas containing a Windows **Inventory and Production System**. Its forms and records were streamed pixels, not accessible HTML pages or JSON APIs. Stable client script paths were identified, but their remote-desktop transport cannot run the business application offline. Session-bound transport scripts, sockets, and authentication state were not retained.

The local application is newly implemented HTML/CSS/JavaScript with a local SQLite backend. Original appearance is based on the observed screens. The wallpaper and toolbar strip were cropped from authorized screen captures; they were not extracted from the Windows executable. The original folder structure for the Windows application was unavailable, so captures and their derived assets are organized under `capture/`, `dist/reference/`, and `dist/assets/`.

## Record coverage

| Screen | Included records | Limits |
|---|---:|---|
| Company | 10 | Visible codes and names |
| Location | 5 | Visible codes, names, and city |
| Item Group | 10 | Visible codes and names |
| Pipe Size | 21 | First visible rows; additional server rows exist |
| Strip Size | 1 | First displayed record, including weight and opening quantity |
| Thickness | 21 | Visible list |
| Unit | 7 | Visible list, original spelling preserved |
| Currency | 4 | Visible code, caption, and symbol |
| Supplier | 22 | Visible names/codes; contact details only for first record |
| Department | 8 | Visible list |
| Buyer | 22 | Visible names/codes; contact details only for first record |
| Main Category | 8 | Visible names/codes |
| Sub Category | 16 | Visible names/codes; uncaptured relationships omitted |
| Item Master | 1 | First displayed record; displayed date lacked a reliable full year |
| Production Output | 0 | Original showed “Databse is Empty”; empty form inspected |
| Goods Received Note | 1 + 2 lines | Displayed transaction 00001 |
| Cutting Creation | 1 + 3 lines | Displayed job 00001 |
| DC Creation | 1 + 6 lines | Displayed delivery 00022 |
| Finished Goods Received | 1 + 1 line | Displayed purchase 00001 |
| Finished Goods Received DC | 1 + 1 line | Displayed delivery 00001 |

Values were transcribed from the visible screens. Some lists were only partly visible or still repainting; complete recaptures were taken where feasible. Empty fields do not assert that the corresponding server fields are empty. An ellipsis in a captured description preserves visibly truncated text.

All nine report entry screens were inspected. Their filter captures are retained. The tested Coil Receiving print preview failed in the original application with “Load report failed”; no original report output was obtained. Local report views provide filtering, grouping, CSV export, and browser printing over the available local data.

Original user creation and permission data were excluded to avoid capturing account secrets. No login screenshots containing entered credentials were retained. No live Add, Edit, Delete, Save, transaction Submit, or system-setting operations were invoked. Login/unlock steps were completed by the user; inspection used navigation, read-only record views, and a report preview.

No original backend source, database export, executable, private filesystem discovery, or access-control bypass was involved. The copy has no external runtime dependencies and no deployment was performed.
