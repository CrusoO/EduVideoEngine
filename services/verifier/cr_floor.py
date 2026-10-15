"""The Cosmic Ray ratchet (ADR 0056): a measured score may not fall below the floor recorded in cr-floor.json.

    python cr_floor.py checks.sqlite eve_verifier/checks.py          compare a finished session with the floor; exit 1 if it is lower
    python cr_floor.py checks.sqlite eve_verifier/checks.py --raise  also write the new score as the floor when it is higher

The sessions are local (ignored by git); the floor file is committed. Run Cosmic Ray alone: it edits the module in place while it runs.
"""

import json
import sqlite3
import sys
from pathlib import Path

FLOOR = Path(__file__).with_name("cr-floor.json")


def score(session: str) -> tuple[int, int]:
    rows = sqlite3.connect(session).execute("select test_outcome, count(*) from work_results group by 1").fetchall()
    total = sum(n for _, n in rows)
    killed = sum(n for outcome, n in rows if outcome != "SURVIVED")
    return killed, total


def main(argv: list[str]) -> int:
    session, module = argv[0], argv[1]
    killed, total = score(session)
    pct = round(100 * killed / total, 2)
    floors = json.loads(FLOOR.read_text(encoding="utf-8")) if FLOOR.exists() else {}
    floor = floors.get(module, {}).get("floor", 0)
    print(f"{module}: {killed} of {total} killed, {pct}% (floor {floor}%)")
    if pct < floor:
        print("below the floor")
        return 1
    if "--raise" in argv and pct > floor:
        floors[module] = {"floor": pct, "killed": killed, "mutants": total}
        FLOOR.write_text(json.dumps(floors, indent=2) + "\n", encoding="utf-8")
        print(f"floor raised to {pct}%")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
