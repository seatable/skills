# Later packaging and Universal App upload

Packaging is a later, explicitly requested step; ordinary generation delivers source. The single maintained [delivery/follow-up list](validation.md#delivery-and-follow-up-chat-actions) belongs to validation, not the packaging workflow.

## When the user requests packaging

These are agent-facing execution instructions, not commands the user must run:

1. Resolve the existing project from the conversation/current workspace. Ask for its path only if ambiguous or unavailable; do not silently package the Skill directory or a different project.
2. Inspect the page structure and actual build scripts to select single-file or Vite packaging. Reuse the existing source; do not regenerate it or repeat table/field questions. Credentials and real-data preview are not prerequisites; do not initialize private configuration or offer preview again merely to package.
3. Run the appropriate packaging workflow below, respecting execution approvals. If blocked, explain the specific obstacle rather than claiming an archive exists.
4. Check the actual ZIP, including root index.html, referenced relative assets, and credential/development-file exclusions. For Vite, run the read-only checker on the resulting ZIP with the project path.
5. Return the checked ZIP's absolute path/link and a brief hint to upload it in the Universal App HTML page configuration. State the checks actually performed and any remaining limitations; do not imply that packaging proves live API behavior.

A request to package is not permission to upload, change table access, or test writes. Provide detailed upload guidance only when requested.

## Single-file HTML

A self-contained index.html requires no deploy-files.json: the packer includes only index.html when the manifest is absent, ignoring every other project file. If extra relative assets are required, identify them from the page's references and prepare the optional explicit manifest at this stage, listing index.html and each necessary asset individually. Never scan the project for files to include. Existing manifests remain supported and invalid ones fail instead of silently falling back. Do not add local schema documentation (including existing data-contract.json), tests, development tools, setting.js, setting.template.js, or unrelated source directories. Do not ZIP the whole project.

Execute with actual absolute paths, quoting paths containing spaces:

```sh
python3 <skill-root>/scripts/pack-page.py --project <project-root>
```

This works from any working directory and creates `<project-root>/page-zip/html-page.zip`, checking the allowed files/archive. The checker rejects detectable missing [static HTML/CSS resources](validation.md#static-resources-and-production-exclusions), including nested CSS imports/fonts, srcset/poster and inline styles; prepare the optional manifest first when needed. Dynamic JavaScript references and the complete module graph remain outside its coverage. The ZIP must contain index.html at its root, not inside an enclosing project folder.

## Vite project

Vite does not use deploy-files.json. Inspect the actual package.json, lifecycle hooks, build script and output convention before execution. For the verified official template, run from the project root:

```sh
npm run build-page
```

The template builds production dist and packages it under page-zip, with the ZIP name based on package.json name/version. Locate the actual output after successful execution; do not claim a ZIP exists based only on its expected name. Do not add a test suite as a prerequisite for packaging.

Preserve the normalized ESM-only project's root src, relative base and hashed production assets; do not reintroduce ESM flags or src/esm. Existing projects keep their inspected configuration. If an existing project's packaging command differs, use its inspected workflow; do not assume every Vite project has build-page. If no packaging workflow exists, package only the confirmed production build output, not the source project, and keep index.html at the ZIP root.

Run the checker against the actual ZIP:

```sh
python3 <skill-root>/scripts/check-page.py <zip-path> --project <project-root>
```

ZIP root must contain index.html and required relative assets. Exclude local credentials, development injection, tests, node_modules, and source-only configuration; production output must not depend on setting.js. Do not hand off an archive that fails these checks.

Generation-time validation still uses an inspected build-only command, not build-page. Check pre/post hooks and plugins too; generation does not execute packaging.

## Detailed upload guidance, when requested

1. In Universal App, add or select an HTML page and open its configuration.
2. Upload the checked ZIP itself, not the source directory or an archive of the entire project.
3. Grant that page access to the relevant tables in the confirmed page requirements using the page's table-access settings.
4. Open the page in the app and verify rendering and authorized reads. Perform create/update/delete checks only on separately authorized records and scope. Distinguish local preview success from acceptance in the Universal App host.

Source: the saved official Developer setup and Low-code quickstart workflow. See [Documentation coverage](documentation.md) for URLs and snapshot boundaries. Explaining these steps does not authorize performing them for the user.
