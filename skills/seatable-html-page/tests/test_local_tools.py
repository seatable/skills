"""Local-only regression tests with temporary projects and synthetic credentials."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

checks = module('test_page_checks', 'check-page.py')
packing = module('test_page_packing', 'pack-page.py')
CONFIG = {'server': 'https://example.invalid/service/path/', 'appUuid': 'synthetic-app',
          'pageId': 'synthetic-page', 'accountToken': 'synthetic-test-token'}
HTML = b'<!doctype html><html><head><title>Test</title></head><body>Test</body></html>'

class LocalToolsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='seatable-package-test-')
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name).resolve()

    def config(self, value=None):
        (self.project / 'setting.js').write_text('export default ' + json.dumps(CONFIG if value is None else value) + ';\n')

    def page(self, files=None):
        files = files or {'index.html': HTML}
        for name, content in files.items():
            file = self.project / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(content)
        (self.project / 'deploy-files.json').write_text(json.dumps({'files': list(files)}))

    def run_tool(self, script, *args):
        return subprocess.run([sys.executable, '-B', str(ROOT / 'scripts' / script), *map(str, args)],
                              capture_output=True, text=True)

    def test_flat_token_lookup_allows_absent_and_empty_configuration(self):
        self.assertEqual(checks.known_tokens(self.project), [])
        self.config(dict.fromkeys(CONFIG, ''))
        self.assertEqual(checks.known_tokens(self.project), [])
        self.config()
        self.assertEqual(checks.known_tokens(self.project), [CONFIG['accountToken']])

    def test_lookup_rejects_nesting_extra_keys_missing_keys_and_invalid_types(self):
        for value in [[], {'profiles': {'dev': CONFIG}}, {**CONFIG, 'extra': ''},
                      {'accountToken': CONFIG['accountToken']}, {**CONFIG, 'accountToken': 123}]:
            with self.subTest(value=value):
                self.config(value)
                with self.assertRaises(ValueError):
                    checks.known_tokens(self.project)

    def test_cli_reports_safe_local_configuration_errors(self):
        self.page()
        cases = [(['check-page.py', self.project, '--project', self.project]),
                 (['pack-page.py', '--project', self.project])]
        for content in ['export default {accountToken:"' + CONFIG['accountToken'],
                        'export default {};',
                        'export default ' + json.dumps(CONFIG) + '; throw new Error("PRIVATE");']:
            (self.project / 'setting.js').write_text(content)
            for args in cases:
                result = self.run_tool(*args)
                self.assertEqual(result.returncode, 1)
                self.assertIn('setting.js', result.stderr)
                self.assertNotIn(CONFIG['accountToken'], result.stdout + result.stderr)
                self.assertNotIn('PRIVATE', result.stdout + result.stderr)

    def test_lookup_rejects_symlinks(self):
        target = self.project / 'other.json'
        target.write_text(json.dumps(CONFIG))
        (self.project / 'setting.js').symlink_to(target)
        with self.assertRaises(ValueError):
            checks.known_tokens(self.project)

    def test_known_token_scan_matches_actual_and_json_escaped_values(self):
        token = 'synthetic-\u20ac-"-\\-token'
        self.config({**CONFIG, 'accountToken': token})
        tokens = checks.known_tokens(self.project)
        for value in [token, json.dumps(token)[1:-1], json.dumps(token, ensure_ascii=False)[1:-1]]:
            with self.subTest(form=value):
                errors = checks.validate_files({'index.html': HTML, 'asset.txt': value.encode()}, tokens)
                self.assertTrue(any('Known local token' in error for error in errors))
                self.assertTrue(all(token not in error for error in errors))

    def setting(self, value=None):
        file = self.project / 'setting.js'
        file.parent.mkdir(exist_ok=True)
        file.write_text('export default ' + json.dumps(CONFIG if value is None else value) + ';\n')
        return file

    def test_root_setting_is_the_primary_input_and_known_token_matches_build_content(self):
        token = 'synthetic-\u20ac-"-\\-token'
        file = self.setting({**CONFIG, 'accountToken': token})
        original = file.read_text()
        self.assertEqual(checks.known_tokens(self.project), [token])
        for form in [token, json.dumps(token)[1:-1], json.dumps(token, ensure_ascii=False)[1:-1]]:
            errors = checks.validate_files({'index.html': HTML, 'bundle.js': form.encode()}, [token])
            self.assertTrue(any('Known local token' in error for error in errors))
        self.assertEqual(file.read_text(), original)
        self.assertFalse((self.project / 'src/setting.js').exists())

    def test_root_settings_use_shared_static_fixtures_for_token_scanning(self):
        cases = json.loads((ROOT / 'tests/fixtures/static-settings.json').read_text())
        for name in ['setting.js']:
            file = self.project / name
            file.parent.mkdir(exist_ok=True)
            for item in cases:
                with self.subTest(path=name, fixture=item['name']):
                    file.write_text(item['source'])
                    if item['config']:
                        self.assertEqual(checks.known_tokens(self.project), [item['config']['accountToken']])
                    else:
                        with self.assertRaises(checks.LocalConfigError) as caught:
                            checks.known_tokens(self.project)
                        self.assertIn('setting.js', str(caught.exception))
                        self.assertNotIn('synthetic-fixture-token', str(caught.exception))
                    self.assertEqual(file.read_text(), item['source'])
            file.unlink()

    def test_root_and_src_settings_cannot_coexist(self):
        self.setting()
        legacy = self.project / 'src/setting.js'
        legacy.parent.mkdir()
        legacy.write_text('export default ' + json.dumps(CONFIG) + ';')
        with self.assertRaisesRegex(checks.LocalConfigError, 'Legacy'):
            checks.known_tokens(self.project)

    def test_legacy_only_settings_require_explicit_migration(self):
        legacy = self.project / 'src/setting.js'
        legacy.parent.mkdir()
        legacy.write_text('export default ' + json.dumps(CONFIG) + ';')
        with self.assertRaisesRegex(checks.LocalConfigError, 'Legacy'):
            checks.known_tokens(self.project)

    def test_setting_symlinks_and_source_parent_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as other:
            target = Path(other) / 'setting.js'
            target.write_text('export default ' + json.dumps(CONFIG) + ';')
            src = self.project / 'src'
            src.mkdir()
            (src / 'setting.js').symlink_to(target)
            with self.assertRaises(checks.LocalConfigError):
                checks.known_tokens(self.project)
            (src / 'setting.js').unlink()
            src.rmdir()
            src.symlink_to(other, target_is_directory=True)
            with self.assertRaises(checks.LocalConfigError):
                checks.known_tokens(self.project)

    def test_deployment_cli_checks_vite_setting_token_without_executing_js(self):
        self.setting()
        build = self.project / 'dist'
        build.mkdir()
        (build / 'index.html').write_bytes(HTML)
        (build / 'bundle.js').write_text(CONFIG['accountToken'])
        result = self.run_tool('check-page.py', build, '--project', self.project)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Known local token', result.stderr)
        self.assertNotIn(CONFIG['accountToken'], result.stdout + result.stderr)

    def test_new_config_and_example_cannot_be_deployed_even_without_token_values(self):
        for name in ['setting.js', 'assets/setting.js', 'setting.template.js']:
            with self.subTest(name=name):
                errors = checks.validate_files({'index.html': HTML, name: b'{}'})
                self.assertTrue(any('Development/sensitive file' in error for error in errors))
                self.assertFalse(packing.allowed(name))

    def test_deployment_paths_match_shared_fixtures(self):
        cases = json.loads((ROOT / 'tests/fixtures/deploy-paths.json').read_text())
        names = [item['name'] for item in cases]
        expected = [item['allowed'] for item in cases]
        self.assertEqual([checks.is_deploy_path(name) for name in names], expected)
        for item in cases:
            if not isinstance(item['name'], str) or item['name'] == 'index.html':
                continue
            errors = checks.validate_files({'index.html': HTML, item['name']: b''})
            self.assertEqual(not errors, item['allowed'], item['name'])
    def test_packaging_without_credentials_includes_only_allowlisted_files(self):
        self.page({'index.html': HTML.replace(b'</head>', b'<link href="assets/style.css"></head>'),
                   'assets/style.css': b'body { color: black; }'})
        # Existing user documentation is preserved, but remains outside deployment.
        legacy_contract = self.project / 'data-contract.json'
        legacy_contract.write_text('{}')
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.project / 'page-zip/html-page.zip'
        with zipfile.ZipFile(archive) as value:
            self.assertEqual(set(value.namelist()), {'index.html', 'assets/style.css'})
        checked = self.run_tool('check-page.py', archive, '--project', self.project)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(legacy_contract.read_text(), '{}')

    def test_manifest_free_packaging_includes_only_index_html(self):
        self.page()
        manifest = self.project / 'deploy-files.json'
        manifest.unlink()
        self.config()
        (self.project / 'extra.txt').write_text('unlisted file')
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.project / 'page-zip/html-page.zip') as archive:
            self.assertEqual(archive.namelist(), ['index.html'])
        self.assertFalse(manifest.exists())
        self.assertNotIn(CONFIG['accountToken'], result.stdout + result.stderr)

    def test_manifest_free_packaging_rejects_omitted_relative_assets(self):
        self.page({'index.html': HTML.replace(b'</head>', b'<link href="style.css"></head>'),
                   'style.css': b'body { color: black; }'})
        (self.project / 'deploy-files.json').unlink()
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.project / 'page-zip').exists())

    def test_invalid_or_symlinked_manifest_never_falls_back(self):
        self.page()
        manifest = self.project / 'deploy-files.json'
        for content in ['{', '{}', '{"files":[]}']:
            manifest.write_text(content)
            self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)
        manifest.unlink()
        manifest.symlink_to(self.project / 'missing.json')
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)
        manifest.unlink()
        (self.project / 'index.html').unlink()
        (self.project / 'index.html').symlink_to(self.project / 'missing.html')
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)
        self.assertFalse((self.project / 'page-zip').exists())

    def test_empty_initialized_config_does_not_block_packaging(self):
        self.page()
        self.config(dict.fromkeys(CONFIG, ''))
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_packaging_scans_new_flat_token_and_never_prints_it(self):
        self.config()
        self.page({'index.html': HTML, 'asset.txt': CONFIG['accountToken'].encode()})
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(CONFIG['accountToken'], result.stdout + result.stderr)
        self.assertFalse((self.project / 'page-zip/html-page.zip').exists())

    def test_deployment_checker_with_project_detects_known_token_without_token_assignment(self):
        self.config()
        folder = self.project / 'dist'
        folder.mkdir()
        (folder / 'index.html').write_bytes(HTML)
        (folder / 'asset.txt').write_text(CONFIG['accountToken'])
        self.assertEqual(self.run_tool('check-page.py', folder).returncode, 0)
        result = self.run_tool('check-page.py', folder, '--project', self.project)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Known local token', result.stderr)
        self.assertNotIn(CONFIG['accountToken'], result.stdout + result.stderr)

    def test_packaging_rejects_private_allowlists_and_coexisting_settings(self):
        self.page()
        (self.project / 'deploy-files.json').write_text(json.dumps({'files': ['index.html', 'setting.js']}))
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)
        self.page()
        self.config()
        legacy = self.project / 'src/setting.js'
        legacy.parent.mkdir()
        legacy.write_text('export default ' + json.dumps(CONFIG) + ';')
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)

    def test_packaging_rejects_output_outside_project_and_symlinked_assets(self):
        self.page()
        with tempfile.TemporaryDirectory(prefix='seatable-output-test-') as outside:
            output = Path(outside) / 'page.zip'
            self.assertEqual(self.run_tool('pack-page.py', '--project', self.project, '--output', output).returncode, 1)
            self.assertFalse(output.exists())
        (self.project / 'linked.html').symlink_to(self.project / 'index.html')
        (self.project / 'deploy-files.json').write_text(json.dumps({'files': ['index.html', 'linked.html']}))
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)

    def test_case_variant_private_paths_are_rejected_by_packaging_and_zip_checker(self):
        for name in ['SETTING.JS', 'assets/Setting.Template.Js', 'SRC/main.js',
                     'NODE_MODULES/library.js', 'assets/config.LOCAL.js', 'config.Local']:
            with self.subTest(name=name):
                content = ('export default ' + json.dumps(dict.fromkeys(CONFIG, '')) + ';').encode()
                self.page({'index.html': HTML, name: content})
                result = self.run_tool('pack-page.py', '--project', self.project)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertFalse((self.project / 'page-zip').exists())
                archive = self.project / 'fixture.zip'
                with zipfile.ZipFile(archive, 'w') as value:
                    value.writestr('index.html', HTML)
                    value.writestr(name, 'synthetic private fixture')
                checked = self.run_tool('check-page.py', archive)
                self.assertEqual(checked.returncode, 1)
                self.assertIn('Development/sensitive file included', checked.stderr)

    def test_local_sdk_assets_and_mixed_case_production_paths_can_be_packaged(self):
        files = {'index.html': HTML.replace(b'</head>',
                    b'<script src="assets/seatable-html-page-sdk-1.2.3.min.js?v=1#sdk"></script>'
                    b'<script src="Assets/seatable-html-page-sdk-AbC123.Js"></script></head>'),
                 'assets/seatable-html-page-sdk-1.2.3.min.js': b'/* local SDK */',
                 'Assets/seatable-html-page-sdk-AbC123.Js': b'/* bundled chunk */'}
        self.assertEqual(checks.validate_files(files), [])
        self.page(files)
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.project / 'page-zip/html-page.zip'
        with zipfile.ZipFile(archive) as value:
            self.assertEqual(set(value.namelist()), set(files))
        checked = self.run_tool('check-page.py', archive)
        self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_missing_local_sdk_is_still_rejected_without_cdn_error(self):
        files = {'index.html': HTML.replace(b'</head>',
                    b'<script src="assets/seatable-html-page-sdk.min.js"></script></head>')}
        errors = checks.validate_files(files)
        self.assertTrue(any('Local asset' in error and 'is missing' in error for error in errors))
        self.assertNotIn('SDK CDN version is not pinned', errors)
        self.page(files)
        self.assertEqual(self.run_tool('pack-page.py', '--project', self.project).returncode, 1)
        self.assertFalse((self.project / 'page-zip').exists())

    def test_sdk_cdn_requires_exact_versions_and_ignores_query_and_fragment(self):
        for base in ['https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/',
                     '//unpkg.com/', '//cdn.jsdelivr.net/npm/', 'http://UNPKG.COM/']:
            for version in ['', '@latest', '@1', '@1.2', '@^1.2.3', '@~1.2.3', '@1.2.3', '@1.2.3-beta.1']:
                for suffix in ['', '/dist/index.min.js?cache=1#sdk']:
                    with self.subTest(base=base, version=version, suffix=suffix):
                        url = base + 'seatable-html-page-sdk' + version + suffix
                        files = {'index.html': HTML.replace(b'</head>', f'<script src="{url}"></script></head>'.encode())}
                        expected = [] if version in {'@1.2.3', '@1.2.3-beta.1'} else ['SDK CDN version is not pinned']
                        self.assertEqual(checks.validate_files(files), expected)
        # A version-like query/fragment does not pin the package path.
        for url in ['https://unpkg.com/seatable-html-page-sdk?version=1.2.3',
                    'https://cdn.jsdelivr.net/npm/seatable-html-page-sdk#1.2.3',
                    'https://unpkg.com/seatable-html-page-sdk%40latest/dist/index.min.js']:
            with self.subTest(url=url):
                files = {'index.html': HTML.replace(b'</head>', f'<script src="{url}"></script></head>'.encode())}
                self.assertEqual(checks.validate_files(files), ['SDK CDN version is not pinned'])

    def test_sdk_named_non_package_urls_do_not_trigger_cdn_version_checks(self):
        for url in ['https://example.invalid/assets/seatable-html-page-sdk.min.js',
                    'https://unpkg.com/another-package/dist/seatable-html-page-sdk.js',
                    'https://unpkg.com/seatable-html-page-sdk-helper@latest/index.js',
                    'https://cdn.jsdelivr.net/gh/owner/seatable-html-page-sdk/index.js',
                    'https://example.invalid/app.js?dependency=seatable-html-page-sdk',
                    'https://unpkg.com.example.invalid/seatable-html-page-sdk']:
            with self.subTest(url=url):
                files = {'index.html': HTML.replace(b'</head>', f'<script src="{url}"></script></head>'.encode())}
                self.assertEqual(checks.validate_files(files), [])

    def test_inline_styles_and_style_attributes_detect_missing_resources(self):
        for tag in ['<style>body{background:url("missing.png")}</style>',
                    '<body style="background:url(missing.png)"></body>']:
            with self.subTest(tag=tag):
                files = {'index.html': ('<html><head>' + tag + '</head></html>').encode()}
                errors = checks.validate_files(files)
                self.assertTrue(any('missing.png' in error for error in errors))
                self.page(files)
                result = self.run_tool('pack-page.py', '--project', self.project)
                self.assertEqual(result.returncode, 1)
                self.assertFalse((self.project / 'page-zip').exists())

    def test_css_imports_fonts_and_images_are_resolved_from_each_stylesheet(self):
        files = {'index.html': HTML.replace(b'</head>', b'<link href="css/theme.css"></head>'),
                 'css/theme.css': b'@import /* comment */ "nested/base.css" screen; body{background:url(../images/hero.png?version=1#x)}',
                 'css/nested/base.css': b'@font-face{src:url(../../fonts/regular.woff2)}',
                 'images/hero.png': b'synthetic image', 'fonts/regular.woff2': b'synthetic font'}
        self.assertEqual(checks.validate_files(files), [])
        for omitted in ['css/nested/base.css', 'images/hero.png', 'fonts/regular.woff2']:
            with self.subTest(omitted=omitted):
                errors = checks.validate_files({key: value for key, value in files.items() if key != omitted})
                self.assertTrue(any(omitted in error for error in errors))
        self.page(files)
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.project / 'page-zip/html-page.zip'
        self.assertEqual(self.run_tool('check-page.py', archive).returncode, 0)
        with zipfile.ZipFile(archive) as value:
            self.assertEqual(set(value.namelist()), set(files))

    def test_css_comments_strings_external_urls_and_fragments_are_not_missing_assets(self):
        css = b'''/* url(missing.png); @import "missing.css" */
          body::after { content: "url(missing.png)"; }
          .a { background: url(data:image/png;base64,AAAA); mask: url(#mask); }
          .b { background: URL("https://example.invalid/image.png"); }
          @import url(//example.invalid/theme.css);'''
        self.assertEqual(checks.validate_files({'index.html': HTML, 'style.css': css}), [])

    def test_css_literal_escapes_and_percent_encoded_paths_are_resolved(self):
        css = b'body { background:url("images/my\\20 image.png"); mask:url(images/price-%E2%82%AC.png); }'
        files = {'index.html': HTML, 'style.css': css, 'images/my image.png': b'fixture',
                 'images/price-\u20ac.png': b'fixture'}
        self.assertEqual(checks.validate_files(files), [])
        del files['images/my image.png']
        self.assertTrue(any('images/my image.png' in error for error in checks.validate_files(files)))

    def test_stylesheet_references_may_not_escape_the_deployment_root(self):
        for url in ['../../outside.png', '/outside.png', '../%2e%2e/outside.png', 'images\\\\outside.png']:
            with self.subTest(url=url):
                files = {'index.html': HTML, 'css/style.css': f'body{{background:url("{url}")}}'.encode()}
                self.assertTrue(checks.validate_files(files))

    def test_srcset_poster_and_nested_html_resources_are_checked(self):
        files = {'index.html': HTML.replace(b'</body>', b'<img srcset="images/small.png 1x, images/large.png 2x"><video poster="images/poster.png"></video><iframe src="pages/detail.html"></iframe></body>'),
                 'pages/detail.html': b'<head><style>body{background:url(../images/detail.png)}</style></head>',
                 'images/small.png': b'fixture', 'images/large.png': b'fixture',
                 'images/poster.png': b'fixture', 'images/detail.png': b'fixture'}
        self.assertEqual(checks.validate_files(files), [])
        for omitted in ['images/small.png', 'images/large.png', 'images/poster.png', 'images/detail.png']:
            with self.subTest(omitted=omitted):
                errors = checks.validate_files({key: value for key, value in files.items() if key != omitted})
                self.assertTrue(any(omitted in error for error in errors))
        self.assertEqual(list(checks.srcset_urls('data:image/png;base64,AAAA 1x, images/large.png 2x')), ['data:image/png;base64,AAAA', 'images/large.png'])
        self.assertEqual(list(checks.srcset_urls('images/small.png, images/large.png 2x')), ['images/small.png', 'images/large.png'])

    def test_packaging_missing_external_css_resources_does_not_create_an_archive(self):
        self.page({'index.html': HTML.replace(b'</head>', b'<link href="theme.css"></head>'),
                   'theme.css': b'body{background:url(missing.png)}'})
        result = self.run_tool('pack-page.py', '--project', self.project)
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.project / 'page-zip').exists())

    def test_packaging_and_zip_checker_reject_test_files_and_source_configuration(self):
        for name in ['tests/example.test.js', 'assets/helper.spec.mjs', 'vite.config.js', 'package.json']:
            with self.subTest(name=name):
                self.page({'index.html': HTML, name: b'/* synthetic development fixture */'})
                result = self.run_tool('pack-page.py', '--project', self.project)
                self.assertEqual(result.returncode, 1)
                self.assertFalse((self.project / 'page-zip').exists())
                archive = self.project / 'fixture.zip'
                with zipfile.ZipFile(archive, 'w') as value:
                    value.writestr('index.html', HTML)
                    value.writestr(name, 'synthetic development fixture')
                self.assertEqual(self.run_tool('check-page.py', archive).returncode, 1)


if __name__ == '__main__':
    unittest.main()
