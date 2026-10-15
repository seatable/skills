"""Keep the Skill's SDK version centralized, without fetching packages or pages."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / 'references/sdk-version.md'


class SDKVersionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = POLICY.read_text()
        declarations = re.findall(r'^Use `seatable-html-page-sdk` version \*\*`([^`]+)`\*\* for both single-file HTML and Vite projects\.$', self.policy, re.M)
        self.assertEqual(len(declarations), 1)
        self.version = declarations[0]

    def test_sdk_version_is_exact(self):
        self.assertRegex(self.version, r'^\d+\.\d+\.\d+$')

    def test_other_guidance_references_policy_without_repeating_version(self):
        guides = [ROOT / 'SKILL.md', *sorted((ROOT / 'references').glob('*.md')),
                  *sorted((ROOT / 'docs').glob('*.md'))]
        for guide in guides:
            if guide == POLICY:
                continue
            with self.subTest(guide=guide.name):
                self.assertNotRegex(guide.read_text(), rf'(?<![\d.]){re.escape(self.version)}(?![\d.])')
        for name in ['SKILL.md', 'references/single-file.md', 'references/vite-project.md',
                     'references/sdk-api.md', 'references/sdk-extensions.md',
                     'references/local-preview.md', 'references/documentation.md',
                     'references/validation.md', 'docs/functional-design.zh-CN.md']:
            with self.subTest(guide=name):
                self.assertIn('sdk-version.md', (ROOT / name).read_text())

    def test_both_integration_forms_use_the_shared_version_placeholder(self):
        self.assertIn('https://unpkg.com/seatable-html-page-sdk@<sdk-version>/dist/index.min.js', self.policy)
        self.assertIn('https://cdn.jsdelivr.net/npm/seatable-html-page-sdk@<sdk-version>/dist/index.min.js', self.policy)
        self.assertIn('"seatable-html-page-sdk": "<sdk-version>"', self.policy)
        self.assertIn("import { HTMLPageSDK } from 'seatable-html-page-sdk'", self.policy)


if __name__ == '__main__':
    unittest.main()
