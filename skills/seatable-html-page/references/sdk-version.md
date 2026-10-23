# SDK Version

Use `seatable-html-page-sdk` version **`0.0.13`** for both single-file HTML and Vite projects.

## Usage

Replace `<sdk-version>` below with the version above; delivered files must contain the concrete version, not the placeholder.

- **Single-file HTML:** load `https://unpkg.com/seatable-html-page-sdk@<sdk-version>/dist/index.min.js` and use the global `HTMLPageSDK`. The same-version `https://cdn.jsdelivr.net/npm/seatable-html-page-sdk@<sdk-version>/dist/index.min.js` is also supported.
- **Vite:** set `"seatable-html-page-sdk": "<sdk-version>"` in package.json dependencies, without `^`, `~` or a dist-tag. Install dependencies and keep the matching lockfile. Use `import { HTMLPageSDK } from 'seatable-html-page-sdk'`. Template normalization does not set this dependency; check it during dependency installation.
