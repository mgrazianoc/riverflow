"""Synchronize Riverflow's backend, frontend, and lockfile versions."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def _replace_once(path: Path, pattern: str, replacement: str) -> str:
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError(f"Could not find exactly one version field in {path}.")
    path.write_text(updated)
    return text


def _read_version(path: Path, pattern: str) -> str:
    match = re.search(pattern, path.read_text(), flags=re.MULTILINE)
    if match is None:
        raise RuntimeError(f"Could not find the version field in {path}.")
    return match.group(1)


def bump_version(version: str) -> None:
    if SEMVER.fullmatch(version) is None:
        raise ValueError(
            f"Invalid version '{version}'. Use semantic versioning in X.Y.Z form."
        )

    pyproject = ROOT / "pyproject.toml"
    package_json = ROOT / "ui" / "package.json"
    package_lock = ROOT / "ui" / "package-lock.json"
    uv_lock = ROOT / "uv.lock"

    backend_version = _read_version(
        pyproject, r'^\s*version\s*=\s*"([^"]+)"\s*$'
    )
    frontend_version = _read_version(
        package_json, r'^\s*"version":\s*"([^"]+)",\s*$'
    )
    lock_version = _read_version(
        package_lock, r'^\s*"version":\s*"([^"]+)",\s*$'
    )
    if len({backend_version, frontend_version, lock_version}) != 1:
        raise RuntimeError(
            "Version sources disagree before the bump: "
            f"backend={backend_version}, frontend={frontend_version}, "
            f"package-lock={lock_version}. Reconcile them before continuing."
        )

    _replace_once(
        pyproject,
        r'^(\s*version\s*=\s*)"[^"]+"(\s*)$',
        rf'\g<1>"{version}"\g<2>',
    )
    _replace_once(
        package_json,
        r'^(\s*"version":\s*)"[^"]+"(,\s*)$',
        rf'\g<1>"{version}"\g<2>',
    )

    lock_text = package_lock.read_text()
    lock_updated, lock_count = re.subn(
        r'^(\s*"version":\s*)"[^"]+"(,\s*)$',
        rf'\g<1>"{version}"\g<2>',
        lock_text,
        count=2,
        flags=re.MULTILINE,
    )
    if lock_count != 2:
        raise RuntimeError(
            f"Expected two project version fields in {package_lock}, found {lock_count}."
        )
    package_lock.write_text(lock_updated)

    uv_text = uv_lock.read_text()
    uv_updated, uv_count = re.subn(
        r'(\[\[package\]\]\nname = "riverflow"\nversion = )"[^"]+"',
        rf'\g<1>"{version}"',
        uv_text,
        count=1,
    )
    if uv_count != 1:
        raise RuntimeError(f"Could not find Riverflow's package entry in {uv_lock}.")
    uv_lock.write_text(uv_updated)

    print(f"Riverflow version: {backend_version} -> {version}")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python scripts/bump_version.py X.Y.Z", file=sys.stderr)
        return 2
    try:
        bump_version(argv[1])
    except (RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
