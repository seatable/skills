# Documentation and source boundaries

## Source priority

1. Official HTML Pages SDK documentation defines API parameters/returns and usage constraints.
2. The target project's installed/pinned published package confirms available exports/methods; backend/page permissions separately determine whether they can be used.
3. Typed-cell, error-handling and multi-step workflow rules are maintained locally in [Core contracts](sdk-api.md) and [Conditional extensions](sdk-extensions.md); required schema clarification is in the [Skill entrypoint](../SKILL.md#1-confirm-data-structure-and-operations). No private repository access is required; local guidance does not prove a method is released or supported by a target deployment.
4. Official template source establishes its actual structure/build commands. Skill assets and preview/mock/packaging conventions are local adaptations, not built-in SDK features.

## Relevant official sources

- Entry/navigation: https://developer.seatable.com/html-pages/
- Single-file guidance: https://developer.seatable.com/html-pages/low-code-quickstart/
- Development setup: https://developer.seatable.com/html-pages/getting-started/
- Business example: https://developer.seatable.com/html-pages/example/
- SDK initialization: https://developer.seatable.com/html-pages/sdk/initialization/
- Rows: https://developer.seatable.com/html-pages/sdk/rows/
- Files/images: https://developer.seatable.com/html-pages/sdk/files/
- Official SDK implementation: https://github.com/seatable/seatable-html-page-sdk
- Published packages/tags: https://registry.npmjs.org/seatable-html-page-sdk
- Official Vite template: https://github.com/seatable/seatable-html-page-template-simple-form

For query/user/link/action requirements, find the current relevant pages through official navigation and consult [Conditional extensions](sdk-extensions.md); do not infer availability from local guidance or sample data. Core contracts are in [SDK API contracts](sdk-api.md).

## Verify only the relevant capability

Use the shared [SDK version](sdk-version.md). Refresh only the relevant official pages and inspect that target package/version when checking capabilities or resolving contract uncertainty. For template generation, inspect the fetched commit, package/lockfile and configuration before normalization. Simple CRUD does not require loading all extension material or auditing every SDK API. Preview/packaging-only requests need the existing project's applicable workflow, not a fresh unrelated API audit.

Record the source/date/version and distinguish documentation, published implementation, build/HTTP checks and actual live acceptance. Do not treat dist-tags as version ordering, snapshots as permanently latest, or unpublished repository changes as installed capabilities. Preserve an existing compatible version; upgrades need a demonstrated requirement/agreement, not a global replacement.

If offline, disclose use of the saved contract within its coverage and defer unknown capabilities. A documentation/SDK mismatch must be resolved before the affected API is generated; do not fabricate a fallback or claim a mock proves support.

The SDK version is maintained only in [SDK version](sdk-version.md); the applicable template commit is recorded in [Vite workflow](vite-project.md).
