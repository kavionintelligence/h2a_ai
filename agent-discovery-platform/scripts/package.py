"""Create a portable source ZIP, validate its entries and emit a SHA-256 manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

EXCLUDED = {
    ".git",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "build",
    "dist",
    "htmlcov",
    "test-temp",
}
REQUIRED = {
    "README.md",
    "LICENSE",
    "NOTICE",
    "pyproject.toml",
    "requirements.lock",
    ".env.example",
    "docker-compose.yml",
    "src/agent_census/api.py",
    "src/agent_census/detection.py",
    "scripts/demo.py",
    "docs/workflow.md",
    "docs/research.md",
    "third_party/dependency-inventory.json",
}


def files(root: Path):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part in EXCLUDED or part.endswith(".egg-info") for part in relative.parts):
            continue
        if (
            path.name in {".env", ".coverage"}
            or path.suffix in {".pyc", ".db", ".zip", ".log", ".pyd", ".exe"}
            or ".db-" in path.name
        ):
            continue
        yield path, relative.as_posix()


def package(root: Path, output: Path) -> dict:
    selected = list(files(root))
    names = {name for _, name in selected}
    if missing := REQUIRED - names:
        raise ValueError(f"Missing required deliverables: {sorted(missing)}")
    hashes = {}
    for path, name in selected:
        data = path.read_bytes()
        if len(data) > 8_000_000:
            raise ValueError(f"Unexpected large source artifact: {name}")
        if re.search(rb"[A-Za-z]:[\\/]+Users[\\/]+", data):
            raise ValueError(f"Machine-specific user path in {name}")
        if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", data):
            raise ValueError(f"Private key material in {name}")
        hashes[name] = hashlib.sha256(data).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in selected:
            archive.write(path, "agent-discovery-platform/" + name)
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive CRC validation failed")
        for entry in archive.infolist():
            parts = Path(entry.filename).parts
            if (
                parts[0] != "agent-discovery-platform"
                or ".." in parts
                or Path(entry.filename).is_absolute()
            ):
                raise ValueError("Unsafe or incorrectly rooted archive entry")
            relative = "/".join(parts[1:])
            if hashlib.sha256(archive.read(entry)).hexdigest() != hashes[relative]:
                raise ValueError("Archive content differs from source")
    report = {
        "archive": output.name,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "file_count": len(selected),
        "compressed_bytes": output.stat().st_size,
        "files": hashes,
    }
    output.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("../agent-discovery-platform.zip"))
    args = parser.parse_args()
    result = package(Path(__file__).resolve().parents[1], args.output.resolve())
    print(json.dumps({k: v for k, v in result.items() if k != "files"}, indent=2))
