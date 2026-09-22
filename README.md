# API UAT Workspace — Phase 1 MVP

A local-first Windows desktop UAT tool built with Tauri 2, Rust, React/TypeScript and SQLite.

## Excel import format

The importer supports one scenario per row and preserves hierarchical numbering such as `A`, `A.1.1`, `A.1.2`, `B`, and `B.1.1.1` as text values.

Recommended columns:

- `No`
- `Skenario`
- `Expected`

Example layout:

| No | Skenario | Expected |
|---|---|---|
| A | Menu Dashboard | expected A |
| A.1.1 | Login Assistant Advisor / Advisor / Senior Advisor... | Muncul menu "Dashboard" |
| 1 | Klik Menu Dashboard | Tampil halaman Menu Dashboard |
| 2 | Login PIC DCP / Admin, klik burger menu | Menu "Dashboard" tidak muncul (no akses) |
| A.1.2 | Drag 1-2 field ke box Filter / Value | Field masuk... |
| 1 | Drag field ke-3 ke box Filter / Value | Gagal, maksimal 2 field |
| B | Menu Inquiry Kasus | expected B |
| 1 | Klik Menu Inquiry Kasus | Tampil halaman Inquiry Kasus |

Important rules:

- parent/category rows such as `A` or `B` are treated as menu headers
- scenario rows such as `A.1.1` or `A.1.2` are treated as scenario records
- step rows such as `1` or `2` are attached to the most recent scenario
- all `No` values are stored as text so structured IDs remain intact

## Portable usage

Keep the following beside `API-UAT-Workspace.exe`:

- `data/` for SQLite data
- `data/attachments/` for scenario attachments
- `exports/` for exported evidence

The application does not require Node.js, npm, a local server, Python, Java, Docker, or a backend at runtime.
