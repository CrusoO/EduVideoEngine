import copy
import json
from pathlib import Path

import pytest

from eve_verifier.checks import verify_bundle
from eve_verifier.cli import main

FIXTURE = Path(__file__).parent / "fixtures" / "sum-of-roots.json"


@pytest.fixture()
def bundle():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def num(n, d=1):
    return {"op": "num", "n": n} if d == 1 else {"op": "num", "n": n, "d": d}


def failed(report):
    return {c.id: c.detail for c in report.checks if not c.ok}


def line(bundle):
    return next(o for s in bundle["scenes"] for o in s["objects"] if o["id"] == "line")


def test_the_reference_lesson_is_verified_and_says_what_it_checked(bundle):
    r = verify_bundle(bundle)
    assert r.ok, failed(r)
    assert r.counts() == {"expression": 6, "equality": 1, "numberline": 1, "claim": 3}


def test_a_wrong_sum_is_rejected_with_the_numbers(bundle):
    bundle["expressions"]["total"]["a"] = {"op": "add", "a": num(2), "b": num(4)}
    r = verify_bundle(bundle)
    assert not r.ok
    assert "total" in failed(r)
    assert "2 + 4 = 5 is false" in failed(r)["total"] and "6" in failed(r)["total"]


def test_hops_that_do_not_add_up_to_the_coefficient_are_rejected(bundle):
    bundle["expressions"]["five"] = num(6)  # the second hop now lands on 6
    r = verify_bundle(bundle)
    f = failed(r)
    assert not r.ok
    assert "scene4/line#bracket0" in f and "the bracket spans 6 but its label says 5" in f["scene4/line#bracket0"]
    assert "scene4/line" in f and "the roots of the equation on screen add up to 5" in f["scene4/line"]
    assert "the hops add up to 6" in f["scene4/line"]


def test_hops_that_do_not_continue_are_rejected(bundle):
    bundle["expressions"]["three"] = num(3)
    line(bundle)["props"]["hops"][1]["from"] = "three"
    f = failed(verify_bundle(bundle))
    assert f["scene4/line#hop1"] == "hop 1 starts at 3 but hop 0 ended at 2"


def test_a_hop_off_the_line_or_without_length_is_rejected(bundle):
    line(bundle)["props"]["max"] = 4
    assert "not on the line 0 to 4" in failed(verify_bundle(bundle))["scene4/line#hop1"]


def test_a_hop_to_a_thing_that_is_not_a_number_is_rejected(bundle):
    line(bundle)["props"]["hops"][0]["to"] = "eq1"
    assert "is not a number" in failed(verify_bundle(bundle))["scene4/line#hop0"]


def test_a_number_line_beside_no_equation_still_checks_its_own_hops(bundle):
    for s in bundle["scenes"]:
        s["objects"] = [o for o in s["objects"] if o["component"] != "equation"]
    r = verify_bundle(bundle)
    assert r.ok, failed(r)
    assert next(c for c in r.checks if c.kind == "numberline").detail == "2 hops from 0 to 5, total 5"


def test_wrong_stated_roots_are_rejected(bundle):
    next(c for c in bundle["claims"] if c["id"] == "c.roots")["values"] = [num(2), num(4)]
    assert "c.roots" in failed(verify_bundle(bundle))


def test_a_wrong_sum_claim_is_rejected(bundle):
    bundle["expressions"]["total"]["b"]["n"] = 8
    f = failed(verify_bundle(bundle))
    assert "c.sum" in f and "total" in f


def test_a_term_name_changes_nothing_for_the_verifier(bundle):
    bundle["expressions"]["total"]["b"].pop("term")
    bundle["expressions"]["eq1"]["a"]["a"]["a"].pop("term")
    assert verify_bundle(bundle).ok


def test_a_double_root_counts_twice():
    b = {
        "expressions": {
            "e": {"op": "eq", "a": {"op": "pow", "a": {"op": "sub", "a": {"op": "sym", "name": "x"}, "b": num(3)}, "b": num(2)}, "b": num(0)},
            "six": {"op": "eq", "a": num(6), "b": num(6)},
        },
        "claims": [{"id": "c", "kind": "sum-of-roots", "equation": "e", "equals": "six"}],
        "scenes": [],
    }
    assert verify_bundle(b).ok  # (x-3)^2 = 0 has the root 3 twice: 6


def test_division_by_zero_is_a_failure_not_a_pass():
    b = {"expressions": {"z": {"op": "eq", "a": {"op": "div", "a": num(1), "b": num(0)}, "b": num(1)}}, "scenes": []}
    r = verify_bundle(b)
    assert not r.ok and "divides by zero" in failed(r)["z"]


def test_nothing_checkable_is_not_verified():
    assert not verify_bundle({"expressions": {}, "scenes": []}).ok


def test_ambiguous_unknowns_fail_instead_of_guessing():
    b = {
        "expressions": {
            "e": {"op": "eq", "a": {"op": "add", "a": {"op": "sym", "name": "a"}, "b": {"op": "sym", "name": "b"}}, "b": num(0)},
            "z": {"op": "eq", "a": num(1), "b": num(1)},
        },
        "claims": [{"id": "c.amb", "kind": "roots", "equation": "e", "values": [num(1)]}],
        "scenes": [],
    }
    assert "single unknown" in failed(verify_bundle(b))["c.amb"]


def test_a_claim_naming_a_missing_expression_fails(bundle):
    bundle["claims"].append({"id": "c.ghost", "beatId": "b4", "kind": "equivalent", "a": "eq1", "b": "ghost"})
    assert "does not exist" in failed(verify_bundle(bundle))["c.ghost"]


def test_an_unknown_node_type_rejects_the_lesson(bundle):
    bundle["expressions"]["total"] = {"op": "sqrt", "a": num(4)}
    r = verify_bundle(bundle)
    assert not r.ok and "no verifier handler for node type sqrt" in failed(r)["total"]


def test_cli_exit_codes_and_output(tmp_path, capsys, bundle):
    good = tmp_path / "good.json"
    good.write_text(json.dumps(bundle), encoding="utf-8")
    assert main([str(good)]) == 0
    assert "VERIFIED" in capsys.readouterr().out
    bad = copy.deepcopy(bundle)
    bad["expressions"]["five"] = num(6)
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(bad), encoding="utf-8")
    assert main([str(p)]) == 1
    out = capsys.readouterr().out
    assert "FAILED" in out and "REJECTED" in out
    assert main([str(tmp_path / "missing.json")]) == 2
    assert main([str(p), "--json"]) == 1
    assert json.loads(capsys.readouterr().out)["ok"] is False


def test_http_service_answers_like_the_cli(bundle):
    from fastapi.testclient import TestClient

    from eve_verifier.server import app

    c = TestClient(app)
    assert c.get("/healthz").json() == {"status": "ok"}
    assert c.post("/verify", json=bundle).json()["ok"] is True
    bundle["expressions"]["five"] = num(6)
    r = c.post("/verify", json=bundle).json()
    assert r["ok"] is False and any(f["kind"] == "numberline" for f in r["failed"])
