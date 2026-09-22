# Build Windows EXE on GitHub

1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository (or push with Git).
3. Open **Actions**.
4. Select **Build Windows EXE**.
5. Click **Run workflow**.
6. Wait for the Windows build to finish.
7. Open the completed workflow run.
8. Download the artifact named **API-UAT-Workspace-Windows**.

The artifact contains the Windows NSIS `.exe` installer and, when produced by Tauri, the `.msi` package.

The build machine installs Node.js/Rust only inside the temporary GitHub Actions runner. The resulting application does not require Node.js or a server on the tester's PC.
