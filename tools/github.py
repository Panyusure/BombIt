"""Run GitHub CLI with existing Git credentials; never store or print the token."""
import os
import subprocess
import sys

environment = os.environ.copy()
if not environment.get('GH_TOKEN') and not environment.get('GITHUB_TOKEN'):
    environment.update(GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never')
    credential = subprocess.run(['git', 'credential', 'fill'],
                                input='protocol=https\nhost=github.com\n\n',
                                text=True, capture_output=True, env=environment, timeout=30)
    values = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    if credential.returncode or not values.get('password'):
        sys.exit('GitHub credential unavailable; sign in with gh auth login or Git Credential Manager.')
    environment['GH_TOKEN'] = values['password']
sys.exit(subprocess.run(['gh', *sys.argv[1:]], env=environment).returncode)
