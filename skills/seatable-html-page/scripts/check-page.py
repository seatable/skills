#!/usr/bin/env python3
"""Read-only checks of a deployable directory or ZIP; not a complete security audit."""
import argparse
import json
import posixpath
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from urllib.parse import unquote, urlsplit
import zipfile

TOKEN = re.compile(r'''["']?\b(?:accountToken|accessToken|apiToken)\b["']?\s*[:=]\s*(["'])([^"'\r\n]+)\1''')
DEV = re.compile(r'''(?:window\.)?__HTML_PAGE_DEV_CONFIG__\s*=(?!=)''')
TEXT_EXT = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".map", ".txt", ".yaml", ".yml"}

class LocalConfigError(ValueError):
    """Fixed, non-sensitive local configuration diagnostics safe for CLI output."""


DEPLOY_BANNED_PARTS = {'.git', '.seatable', 'node_modules', 'src', 'scripts', 'page-zip', 'dist', 'test', 'tests', '__tests__', 'coverage'}
DEPLOY_BANNED_NAMES = {'setting.js', 'setting.template.js', 'deploy-files.json', 'data-contract.json', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'}
DEPLOY_BANNED_EXT = {'.zip', '.md', '.toml', '.yaml', '.yml'}
DEV_FILENAME = re.compile(r'(?:^.*\.(?:test|spec)\.(?:[cm]?[jt]sx?)$|^(?:vite|vitest|webpack|rollup|eslint|jest|babel|postcss|tailwind)\.config\.(?:[cm]?[jt]s|json)$|^tsconfig(?:\.[\w-]+)?\.json$)', re.I)


def is_deploy_path(name):
    """Normalized relative production paths; parity fixtures also cover the JS runner."""
    if not isinstance(name, str) or not name or '\\' in name or '\0' in name:
        return False
    # Only policy comparisons are folded; preserve the actual asset path.
    path = PurePosixPath(name)
    lower_path = PurePosixPath(name.lower())
    return (not path.is_absolute() and path.as_posix() == name and
            not any(part.startswith('.') or part in DEPLOY_BANNED_PARTS for part in lower_path.parts) and
            lower_path.name not in DEPLOY_BANNED_NAMES and not DEV_FILENAME.search(path.name) and
            '.local.' not in lower_path.name and not lower_path.name.endswith('.local') and
            path.suffix.lower() not in DEPLOY_BANNED_EXT)


CSS_STRING = r'''(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')'''
CSS_TOKENS = re.compile(
    r'/\*[\s\S]*?\*/|'
    r'(?P<url>(?<![\w-])url\s*\(\s*(?P<url_value>' + CSS_STRING + r'|(?:\\[\s\S]|[^()\'"\\])*?)\s*\))|'
    r'(?P<import>@import\s*(?:/\*[\s\S]*?\*/\s*)*(?P<import_value>' + CSS_STRING + r'))|'
    + CSS_STRING, re.I)


def css_urls(source):
    """Recognize literal url()/quoted @import, skipping comments and ordinary strings."""
    def unescape(match):
        if match.group(1):
            value = int(match.group(1), 16)
            return chr(value) if 0 < value <= 0x10ffff and not 0xd800 <= value <= 0xdfff else '\ufffd'
        return match.group(2) or ''
    for match in CSS_TOKENS.finditer(source):
        value = match.group('url_value') if match.group('url') else match.group('import_value')
        if value is None:
            continue
        value = value.strip()
        if value[:1] in {'"', "'"}:
            value = value[1:-1]
        yield re.sub(r'\\([0-9a-fA-F]{1,6})(?:[ \t\r\n\f])?|\\(?:\r\n|[\r\n\f])|\\([\s\S])', unescape, value)


def srcset_urls(source):
    """Read candidate URLs without splitting the comma inside a data: URL."""
    position = 0
    whitespace = ' \t\r\n\f'
    while position < len(source):
        while position < len(source) and source[position] in whitespace + ',':
            position += 1
        start = position
        while position < len(source) and source[position] not in whitespace:
            position += 1
        candidate = source[start:position]
        if not candidate:
            break
        yield candidate.rstrip(',')
        if candidate.endswith(','):
            continue
        depth = 0
        while position < len(source):
            char = source[position]
            position += 1
            if char == '(':
                depth += 1
            elif char == ')':
                depth = max(0, depth - 1)
            elif char == ',' and depth == 0:
                break


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.styles = []
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = 'href' if tag == 'link' else 'data' if tag == 'object' else 'src'
        if tag in {'script', 'link', 'img', 'source', 'video', 'audio', 'iframe', 'embed', 'input', 'track', 'object'} and attrs.get(key):
            self.urls.append(attrs[key])
        if tag in {'img', 'source'} and attrs.get('srcset'):
            self.urls.extend(srcset_urls(attrs['srcset']))
        if tag == 'video' and attrs.get('poster'):
            self.urls.append(attrs['poster'])
        if attrs.get('style'):
            self.styles.append(attrs['style'])
        if tag == 'style':
            self.in_style = True

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.styles.append(data)


def check_resource(url, owner, files, errors):
    """Resolve relative assets from their containing file, never outside ZIP root."""
    try:
        part = urlsplit(url)
    except ValueError:
        errors.append('Invalid static asset URL in: ' + owner)
        return
    if part.scheme or part.netloc or not part.path:
        return
    local = unquote(part.path)
    if local.startswith('/') or '\\' in local or '\0' in local:
        errors.append('Asset is not a safe relative path within the root: ' + local)
        return
    normal = posixpath.normpath(posixpath.join(posixpath.dirname(owner), local))
    if normal in {'.', '..'} or normal.startswith('../'):
        errors.append('Asset escapes the deployment root: ' + local)
    elif normal not in files:
        errors.append('Local asset referenced by ' + owner + ' is missing: ' + normal)


def is_unpinned_sdk_cdn(url):
    """Check known package CDNs, not vendored assets or SDK-named bundles."""
    try:
        part = urlsplit(url)
        prefix = {'unpkg.com': '/', 'cdn.jsdelivr.net': '/npm/'}.get(part.hostname)
    except ValueError:
        return False  # check_resource reports malformed resource URLs.
    if part.scheme not in {'', 'http', 'https'} or prefix is None:
        return False
    package = re.fullmatch(re.escape(prefix) + r'seatable-html-page-sdk(?:@([^/]+))?(?:/.*)?',
                           unquote(part.path))
    return bool(package and not re.fullmatch(
        r'[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?', package.group(1) or ''))

def parse_setting(source):
    """Static export only: never execute local JS while checking deployment secrets."""
    lexer = re.compile(r"""\s+|//[^\r\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[A-Za-z_$][\w$]*|[{}:;,]""")
    tokens, offset = [], 0
    def fail():
        raise LocalConfigError('setting.js must export a static default object containing only the four connection strings; no imports or executable expressions. Contents were not displayed.')
    while offset < len(source):
        match = lexer.match(source, offset)
        if not match:
            fail()
        offset = match.end()
        token = match.group()
        if not token.isspace() and not token.startswith('/'):
            tokens.append(token)
    position = 0
    def take(expected=None):
        nonlocal position
        if position >= len(tokens):
            fail()
        token = tokens[position]
        position += 1
        if expected is not None and token != expected:
            fail()
        return token
    def string(token):
        if not token or token[0] not in ('"', "'"):
            fail()
        try:
            if token[0] == '"':
                return json.loads(token)
            def escape(match):
                value = match.group()
                return "'" if value == "\\'" else '\\"' if value == '"' else value
            return json.loads('"' + re.sub(r'\\[\s\S]|"', escape, token[1:-1]) + '"')
        except ValueError:
            fail()
    take('export'); take('default'); take('{')
    data = {}
    keys = {'server', 'appUuid', 'pageId', 'accountToken'}
    while position < len(tokens) and tokens[position] != '}':
        token = take()
        key = token if re.fullmatch(r'[A-Za-z_$][\w$]*', token) else string(token)
        if key not in keys or key in data:
            fail()
        take(':'); data[key] = string(take())
        if position < len(tokens) and tokens[position] == '}':
            break
        take(',')
    take('}')
    if position < len(tokens) and tokens[position] == ';':
        position += 1
    if position != len(tokens) or set(data) != keys:
        fail()
    return data


def known_tokens(project):
    """Read one primary local input; no SDK init, JS execution or credential logging."""
    root = project.resolve()
    sources = [root / 'setting.js', root / 'src/setting.js']
    for file in sources:
        if file.parent.is_symlink() or file.is_symlink():
            raise LocalConfigError('Local connection file cannot use symbolic links.')
    present = [file for file in sources if file.exists()]
    if (root / 'src/setting.js').exists():
        raise LocalConfigError('Legacy src/setting.js found. Migrate it explicitly to root setting.js and remove the legacy input before continuing.')
    if not present:
        return []
    file = present[0]
    try:
        text = file.read_text(encoding='utf-8')
        data = parse_setting(text)
    except LocalConfigError:
        raise
    except (OSError, ValueError, UnicodeError):
        raise LocalConfigError(f'Cannot read valid configuration from {file.relative_to(root)}. Contents were not displayed.') from None
    keys = {'server', 'appUuid', 'pageId', 'accountToken'}
    if not isinstance(data, dict) or set(data) != keys or not all(isinstance(v, str) for v in data.values()):
        raise LocalConfigError(f'{file.relative_to(root)} must contain only server, appUuid, pageId and accountToken as top-level strings. Contents were not displayed.')
    token = data['accountToken']
    return [token] if token else []


def validate_files(files, tokens=()):
    errors = []
    if "index.html" not in files:
        errors.append("Deployment root is missing index.html")
    for name, content in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            errors.append("Unsafe path: " + name)
        if not is_deploy_path(name):
            errors.append("Development/sensitive file included: " + name)
        for token in tokens:
            forms = {token.encode('utf-8'), json.dumps(token, ensure_ascii=True)[1:-1].encode('utf-8'), json.dumps(token, ensure_ascii=False)[1:-1].encode('utf-8')}
            if any(value in content for value in forms):
                errors.append('Known local token content detected (value not shown): ' + name)
                break
        if path.suffix.lower() in TEXT_EXT:
            text = content.decode("utf-8", errors="replace")
            if TOKEN.search(text):
                errors.append("Literal token assignment detected (value not shown): " + name)
            if DEV.search(text):
                errors.append("Development configuration injection detected: " + name)
    for name, content in files.items():
        suffix = PurePosixPath(name).suffix.lower()
        text = content.decode('utf-8', errors='replace') if suffix in {'.html', '.htm', '.css'} else ''
        if suffix in {'.html', '.htm'}:
            parser = Assets()
            parser.feed(text)
            for url in parser.urls:
                if is_unpinned_sdk_cdn(url):
                    errors.append("SDK CDN version is not pinned")
                check_resource(url, name, files, errors)
            for style in parser.styles:
                for url in css_urls(style):
                    check_resource(url, name, files, errors)
        elif suffix == '.css':
            for url in css_urls(text):
                check_resource(url, name, files, errors)
    return errors

def collect(source, max_bytes):
    files = {}
    size = 0
    if source.is_symlink():
        raise ValueError("Deployment path must not be a symbolic link")
    if source.is_dir():
        paths = list(source.rglob("*"))
        if any(p.is_symlink() for p in paths):
            raise ValueError("Deployment directory contains symbolic links")
        for path in paths:
            if not path.is_file():
                continue
            size += path.stat().st_size
            if size > max_bytes:
                raise ValueError("Checked content exceeds the size safety limit")
            files[path.relative_to(source).as_posix()] = path.read_bytes()
    else:
        with zipfile.ZipFile(source) as archive:
            entries = [v for v in archive.infolist() if not v.is_dir()]
            if any(v > 1 for v in Counter(v.filename for v in entries).values()):
                raise ValueError("ZIP contains duplicate file paths")
            for entry in entries:
                if stat.S_ISLNK(entry.external_attr >> 16):
                    raise ValueError("ZIP contains symbolic links")
                size += entry.file_size
                if size > max_bytes:
                    raise ValueError("Uncompressed ZIP size exceeds the safety limit")
                files[entry.filename] = archive.read(entry)
    return files

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--max-bytes", type=int, default=100 * 1024 * 1024)
    parser.add_argument("--project", type=Path, help="Optional: read project-local tokens and scan the artifact for their actual values (without printing credentials)")
    args = parser.parse_args()
    try:
        if args.max_bytes <= 0:
            raise ValueError("Size safety limit must be positive")
        errors = validate_files(collect(args.artifact, args.max_bytes), known_tokens(args.project) if args.project else [])
    except LocalConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, zipfile.BadZipFile, RuntimeError):
        print("Cannot safely read the deployment directory/ZIP; check its format, duplicate paths, symbolic links, or size limits.", file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print("Error: " + error, file=sys.stderr)
        return 1
    print("Deployment structure and common configuration-leak checks passed; remote CDN, complete module graph, and live SDK/API behavior remain unverified.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
