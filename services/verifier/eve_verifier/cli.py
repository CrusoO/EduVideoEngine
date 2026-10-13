"""python -m eve_verifier [bundle.json] [--json]   (reads stdin when no file is given). Exit 0 verified, 1 rejected, 2 unreadable."""

from __future__ import annotations

import json
import sys

from .checks import verify_bundle


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in args
    paths = [a for a in args if not a.startswith("--")]
    try:
        raw = open(paths[0], encoding="utf-8").read() if paths else sys.stdin.read()
        bundle = json.loads(raw)
        report = verify_bundle(bundle)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(f"cannot read the bundle: {e}", file=sys.stderr)
        return 2
    if as_json:
        print(json.dumps(report.as_dict(), indent=2))
    else:
        for c in report.checks:
            print(f"{'ok    ' if c.ok else 'FAILED'} {c.kind:9} {c.id}: {c.detail}")
        counts = ", ".join(f"{n} {k}" for k, n in report.counts().items())
        print(f"{'VERIFIED' if report.ok else 'REJECTED'}: {counts}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
