"""Collect local UI release evidence without reading runtime environment values."""
import hashlib
import json
import platform
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def main():
    tests = json.loads((OUT / 'frontend-tests-final.json').read_text())
    source = []
    for base in ('app', 'components', 'lib', 'messages', 'public'):
        for path in sorted((ROOT / 'frontend' / base).rglob('*')):
            if path.is_file():
                source.append({'path': str(path.relative_to(ROOT)),
                               'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    for name in ('package.json', 'package-lock.json', 'tailwind.config.js',
                 'next.config.js', 'Dockerfile', 'tests/setup.ts'):
        path = ROOT / 'frontend' / name
        source.append({'path': str(path.relative_to(ROOT)),
                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    for path in sorted((ROOT / 'backend' / 'app').rglob('*.py')):
        source.append({'path': str(path.relative_to(ROOT)),
                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUT / 'source-manifest.json').write_text(json.dumps(source, indent=2) + '\n')
    expected_image = command('docker', 'image', 'inspect',
                             'wardrowbe-frontend:ui-20261017', '--format', '{{.Id}}')
    runtime_image = command('docker', 'inspect', 'wardrobe-frontend',
                            '--format', '{{.Image}}')
    if expected_image != runtime_image:
        raise AssertionError('Running frontend does not match the UI image')
    expected_backend = command('docker', 'image', 'inspect',
                               'wardrowbe-backend:ui-20261017', '--format', '{{.Id}}')
    runtime_backend = command('docker', 'inspect', 'wardrobe-backend', '--format', '{{.Image}}')
    if expected_backend != runtime_backend:
        raise AssertionError('Running backend does not match the worn-filter fix image')
    backend_tests = ET.parse(OUT / 'backend-tests-final.xml').getroot().find('testsuite').attrib
    health = []
    for url in ('http://localhost:3000/login',
                'http://localhost:18000/api/v1/health/ready'):
        with urlopen(url, timeout=20) as response:
            health.append({'url': url, 'status': response.status})
    report = {
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'platform': {'system': platform.system(), 'machine': platform.machine()},
        'base_revision': command('git', 'rev-parse', 'HEAD'),
        'working_tree_changes_included': True,
        'tests': {key: tests[key] for key in ('success', 'numTotalTests',
                   'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests')},
        'test_files': len(tests['testResults']),
        'frontend_image_id': runtime_image,
        'frontend_tag': 'wardrowbe-frontend:ui-20261017',
        'backend_image_id': runtime_backend,
        'backend_tag': 'wardrowbe-backend:ui-20261017',
        'backend_tests': {key: int(backend_tests[key]) for key in ('tests', 'failures', 'errors', 'skipped')},
        'backend_source_changed': bool(command('git', 'diff', 'HEAD', '--', 'backend')),
        'frontend_build_id': command('docker', 'exec', 'wardrobe-frontend',
                                     'cat', '/app/.next/BUILD_ID'),
        'source_manifest_sha256': hashlib.sha256((OUT / 'source-manifest.json').read_bytes()).hexdigest(),
        'health': health,
        'services': [json.loads(line) for line in command('./local.sh', 'ps', '--format', 'json').splitlines()],
        'verification_boundaries': ['Local Docker deployment only; no public hosting release',
                                    'No real external email or push delivery',
                                    'Backend adds a factual worn filter without schema or task architecture changes; prior architecture evidence remains separate'],
    }
    (OUT / 'SUMMARY.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'tests': report['tests'], 'test_files': report['test_files'],
                      'image_matches': True, 'health': health}, ensure_ascii=False))


if __name__ == '__main__':
    main()
