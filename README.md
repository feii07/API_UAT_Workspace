# API UAT Workspace — Phase 1 MVP

A local-first Windows desktop UAT tool built with Tauri 2, Rust, React/TypeScript and SQLite.

## Portable usage

The intended Phase 1 distribution is a folder/ZIP containing `API-UAT-Workspace.exe`, `README.txt`, `data/`, and `exports/`. The application stores SQLite data beside the executable under `data/workspace.db`, including scenario attachments under `data/attachments/`.

A tester does **not** need Node.js, npm, a local server, Python, Java, Docker, or an application backend at runtime. API requests are executed by the native Rust layer.

### Scenario attachments

Each scenario can have multiple attachments. For every attachment the tester can provide a description explaining its UAT relevance. Attachments are copied into the application's local `data/attachments/<scenario-id>/` directory, so the original file is no longer required for later evidence export.

HTML evidence embeds the attachment bytes directly into the exported HTML. Images are previewed; PDFs can be opened; all attachments have a download link. The attachment filename, description and size are included in the evidence. JSON evidence also includes attachment metadata.

## Development/build

Prerequisites for a Windows build machine:
- Rust stable + Cargo
- Node.js/npm **only for build time**
- Windows SDK / Visual Studio C++ build tools
- WebView2 runtime or a chosen Tauri WebView2 distribution strategy

Build commands:

```text
npm install
npm run tauri build
```

The checked-in configuration disables installer bundling. The Windows executable is produced under the Tauri target directory and can be copied into a portable folder with `data/` and `exports/` beside it.

## Phase 1 functionality implemented

- Local SQLite projects/scenarios/executions
- Excel `.xlsx` sheet discovery and configurable column mapping
- Duplicate scenario detection
- Scenario search/status
- Native Rust HTTP execution with timeout and TLS verification
- GET/POST/PUT/PATCH/DELETE
- Parameters, headers, request body and auth modes
- Mock mode
- Response capture
- Code-free validation operators and JSON paths
- Execution numbering/history and retest preservation
- HTML/JSON evidence export
- Per-scenario file attachments with descriptions and embedded HTML evidence
- Sensitive header masking in evidence
- Local-only architecture and no telemetry

## Notes

The Excel mapping UI is intentionally simple in this Phase 1 source package. A production packaging pass can replace the mapping prompt with a visual mapping grid and add a Windows CI build/signing step.
