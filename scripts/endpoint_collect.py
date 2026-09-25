"""Read-only endpoint inventory using the vendored Shadow AI Guard registry.

Only names, PIDs and existence evidence leave this collector. No configuration
contents, environment values, command lines, prompts or credentials are read.
"""
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys

import yaml


def collect(home=None, registry_path=None):
    home = Path(home or Path.home()).resolve()
    registry_path = registry_path or Path(__file__).resolve().parents[1] / 'vendor/shadow-ai-guard/registry.yaml'
    registry = yaml.safe_load(Path(registry_path).read_text(encoding='utf-8'))
    errors = []
    processes = []
    try:
        if sys.platform == 'win32':
            command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                       'Get-Process | Select-Object ProcessName,Id | ConvertTo-Json -Compress']
            result = subprocess.run(command, capture_output=True, text=True, timeout=15,
                                    creationflags=subprocess.CREATE_NO_WINDOW, check=True)
            raw = json.loads(result.stdout)
            processes = [(p['ProcessName'].lower(), p['Id']) for p in (raw if isinstance(raw, list) else [raw])]
        else:
            result = subprocess.run(['ps', '-axo', 'pid=,comm='], capture_output=True, text=True, timeout=15, check=True)
            for line in result.stdout.splitlines():
                parts = line.strip().split(None, 1)
                if len(parts) == 2:
                    processes.append((Path(parts[1]).name.lower(), int(parts[0])))
    except Exception:
        errors.append({'source': 'endpoint-processes', 'code': 'process_inventory_unavailable',
                       'message': 'Process inventory could not be read; installation checks still ran.'})

    def exists_under_home(relative):
        if not isinstance(relative, str) or Path(relative).is_absolute() or '..' in Path(relative).parts:
            return False
        try:
            target = (home / relative).resolve()
            target.relative_to(home)
            return target.exists()
        except (OSError, ValueError):
            return False

    tools = []
    for tool in registry.get('tools', []):
        cli = tool.get('cli') or {}
        binaries = cli.get('binaries') or []
        evidence = []
        for binary in binaries:
            if isinstance(binary, str) and '/' not in binary and '\\' not in binary and shutil.which(binary):
                evidence.append({'kind': 'binary_on_path', 'value': binary})
        for relative in cli.get('config_paths', []):
            if exists_under_home(relative):
                evidence.append({'kind': 'configuration_present', 'value': '~/' + relative})
        suffix = 'windows' if sys.platform == 'win32' else 'macos' if sys.platform == 'darwin' else 'linux'
        for relative in tool.get('mcp_config_paths', []) + tool.get('mcp_config_paths_' + suffix, []):
            if exists_under_home(relative):
                evidence.append({'kind': 'mcp_configuration_present', 'value': '~/' + relative})
        names = {str(n).lower().removesuffix('.exe') for n in binaries + tool.get('exe_names', [])}
        pids = [pid for name, pid in processes if name.removesuffix('.exe') in names][:50]
        if pids:
            evidence.append({'kind': 'running_process', 'value': 'matching PIDs: ' + ','.join(map(str, pids))})
        extension_ids = (tool.get('extension_ids') or {}).get('vscode', [])
        for extension_root in ['.vscode/extensions', '.cursor/extensions', '.vscode-insiders/extensions']:
            if not exists_under_home(extension_root):
                continue
            try:
                installed = [entry.name.lower() for entry in (home / extension_root).iterdir()][:3000]
                for identifier in extension_ids:
                    if any(name.startswith(identifier.lower() + '-') for name in installed):
                        evidence.append({'kind': 'ide_extension_present', 'value': identifier})
            except OSError:
                errors.append({'source': 'endpoint-ide', 'code': 'extension_inventory_unavailable',
                               'message': 'One IDE extension directory could not be read.'})
        if evidence:
            tools.append({'id': tool['id'], 'name': tool['name'], 'provider': tool.get('vendor'),
                          'category': tool.get('category'), 'running': bool(pids), 'evidence': evidence})
    return {'host': socket.gethostname(), 'platform': platform.system(), 'tools': tools, 'errors': errors,
            'coverage': 'Current OS user: PATH, known configuration paths, IDE extensions and process names. No browser history, network interception, other users or cloud account inventory.'}


if __name__ == '__main__':
    print(json.dumps(collect()))
