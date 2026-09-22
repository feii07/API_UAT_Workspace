API UAT Workspace — Phase 1 Portable Build

1. Extract the ZIP.
2. Double-click API-UAT-Workspace.exe.
3. Do not install Node.js/npm or start a server.
4. Keep the data folder beside the EXE so SQLite data and scenario attachments remain portable.

Scenario attachments:
- Select ATTACHMENTS on a scenario.
- Add one or more files.
- Give each file a UAT-relevant description.
- Export HTML evidence; attachment files and descriptions are carried into the evidence.
- Images are previewed and attachments have download/open links.

Runtime architecture:
- Tauri 2 + Rust native layer
- React/TypeScript UI
- SQLite local database
- Native HTTP requests
- No telemetry
- No localhost application server
- No Node.js runtime requirement

Important:
A Windows EXE is not included in this source package when built outside Windows. See BUILD_STATUS.txt for the validation/build status.
