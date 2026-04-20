# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Git remote (connect to GitHub / Azure DevOps / etc.)

This folder is already a Git repository (commits exist). Add an **`origin`** remote pointing at your empty hosted repo, then push.

**In Cursor / Visual Studio Code**

1. Open **Source Control** (Ctrl+Shift+G).
2. **…** (View and More Actions) → **Remote** → **Add Remote…**.
3. Remote name: `origin`. URL: your HTTPS or SSH clone URL from GitHub (green **Code** button).

**Or in the terminal**

1. `cd` to **your real project folder** (do not use a literal `path\to\...` placeholder). On Windows PowerShell, quote paths that contain spaces:

   ```powershell
   cd "C:\Users\YourName\snippd"
   ```

2. If **`origin` is not set yet**:

   ```powershell
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

3. If you see **`remote origin already exists`**, do **not** run `add` again. Set or check the URL:

   ```powershell
   git remote -v
   git remote set-url origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

Create an **empty** repository on GitHub first (no README/license if you want a clean first push). The default branch here is **`main`**.
