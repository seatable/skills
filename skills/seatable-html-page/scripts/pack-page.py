#!/usr/bin/env python3
"""Package index.html or an optional explicit asset allowlist; never ZIP the project tree."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location('page_checks', Path(__file__).with_name('check-page.py'))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


# The read-only checker and packer share one Python production-path policy.
allowed = checks.is_deploy_path


def ensure_safe(root, file):
    file.relative_to(root)
    for part in [file, *file.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise ValueError('Symbolic links are not allowed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--output', type=Path, help='Default: <project>/page-zip/html-page.zip')
    args = parser.parse_args()
    try:
        root = args.project.resolve(strict=True)
        if not root.is_dir():
            raise ValueError('Project must be a directory.')
        manifest = root / 'deploy-files.json'
        ensure_safe(root, manifest)
        # No manifest means index.html only, not automatic project discovery.
        names = json.loads(manifest.read_text(encoding='utf-8'))['files'] if manifest.exists() else ['index.html']
        if not isinstance(names, list) or not names or not all(allowed(name) for name in names) or len(set(names)) != len(names) or 'index.html' not in names:
            raise ValueError('Invalid deployment allowlist.')
        files = {}
        size = 0
        for name in names:
            file = root / name
            ensure_safe(root, file)
            size += file.stat().st_size
            if not file.is_file() or size > 100 * 1024 * 1024:
                raise ValueError('Invalid file or deployment exceeds size limit.')
            files[name] = file.read_bytes()
        errors = checks.validate_files(files, checks.known_tokens(root))
        if errors:
            # Names/values from user files are not printed by this packaging tool.
            raise ValueError('Deployment checks failed.')
        candidate = (args.output if args.output.is_absolute() else root / args.output) if args.output else root / 'page-zip/html-page.zip'
        output = Path(os.path.abspath(candidate))
        ensure_safe(root, output)
        if any(part.startswith('.') for part in output.relative_to(root).parts):
            raise ValueError('Output cannot be a hidden or local config path.')
        protected = {root / name for name in names} | {manifest, root / 'setting.js', root / 'src/setting.js'}
        if output in protected or output.suffix.lower() != '.zip':
            raise ValueError('Output must be a separate ZIP file.')
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        # Validate the actual archive, not just inputs.
        if checks.validate_files(checks.collect(output, 100 * 1024 * 1024), checks.known_tokens(root)):
            output.unlink()
            raise ValueError('Archive checks failed.')
    except checks.LocalConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError):
        print('Cannot safely package the page. Check index.html, the optional deploy-files.json, required assets, output path and deployment configuration; values were not displayed.', file=sys.stderr)
        return 1
    print('Packaged and checked the allowed deployment files; no SeaTable requests were made.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
