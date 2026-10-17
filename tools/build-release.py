"""Build a verified offline package from a committed Git revision."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--ref', default='HEAD')
parser.add_argument('--version', default='v2.0')
args = parser.parse_args()
assert re.fullmatch(r'v\d+\.\d+(?:\.\d+)?', args.version), 'Invalid release version'
root = Path(__file__).resolve().parents[1]
commit = subprocess.check_output(['git', 'rev-parse', args.ref], cwd=root, text=True).strip()
archive = subprocess.check_output(['git', 'archive', '--format=tar', commit], cwd=root)
folder = root / 'data/releases'
folder.mkdir(parents=True, exist_ok=True)
output = folder / ('BombIt-' + args.version + '.zip')
assert not output.exists(), 'Release package already exists; inspect it before rebuilding'
prefix = 'BombIt-' + args.version + '/'
expected = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    files = {m.name: source.extractfile(m).read() for m in source if m.isfile()}
assert json.loads(files['package.json'])['version'].startswith(args.version[1:] + '.'), 'package version mismatch'
assert ("VERSION: '" + args.version + "'").encode() in files['src/core/config.js'], 'menu version mismatch'
for required in ['index.html', 'replay.html', 'AGENTS.md', 'cli/bombit.cjs', 'cli/navigation.cjs',
                 'replay/core.js', 'replay/view.js', 'docs/CLI与Agent.md', 'examples/agent.cjs', '启动游戏.bat']:
    assert required in files, required
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for name, content in files.items():
        assert not name.startswith('/') and '..' not in Path(name).parts
        assert not any(part in ['.git', '.bombit', '.play', '.verify'] for part in Path(name).parts), name
        if name.endswith(('.bat', '.cmd')):
            content = content.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        package.writestr(prefix + name, content)
        expected[prefix + name] = hashlib.sha256(content).hexdigest()
with zipfile.ZipFile(output) as package:
    assert package.testzip() is None
    for name, digest in expected.items():
        assert hashlib.sha256(package.read(name)).hexdigest() == digest
print(json.dumps({'commit': commit, 'file': str(output), 'files': len(expected),
                  'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
