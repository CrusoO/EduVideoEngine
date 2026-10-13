import copy
import json
from pathlib import Path

import pytest

from eve_verifier.checks import verify_bundle
from eve_verifier.cli import main

FIXTURE = Path(__file__).parent / "fixtures" / "quadratic-roots.json"


@pytest.fixture()
def bundle():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def num(n, d=1):
    return {"op": "num", "n": n} if d == 1 else {"op": "num", "n": n, "d": d}


def failed(report):
    return {c.id: c.detail for c in report.checks if not c.ok}


def test_the_reference_lesson_is_verified_and_says_what_it_checked(bundle):
    r = verify_bundle(bundle)
    assert r.ok, failed(r)
    assert r.counts() == {"expression": 9, "equality": 2, "point": 2, "claim": 6}


def test_a_wrong_sum_is_rejected_with_the_numbers(bundle):
    bundle["expressions"]["total"]["b"] = num(6)
    r = verify_bundle(bundle)
    assert not r.ok
    assert "total" in failed(r)
    assert "2 + 3 = 6 is false" in failed(r)["total"] and "5" in failed(r)["total"]


def test_a_wrong_point_on_the_graph_is_rejected(bundle):
    next(o for s in bundle["scenes"] for o in s["objects"] if o["id"] == "roots")["props"]["points"] = [2, 4]
    r = verify_bundle(bundle)
    assert list(failed(r)) == ["scene4/roots@4"]
    assert "not a root" in failed(r)["scene4/roots@4"]


def test_a_wrong_factorisation_is_rejected(bundle):
    bundle["expressions"]["factored"]["a"]["b"]["b"] = num(4)  # (x - 2)(x - 4) = 0
    assert "c.factored" in failed(verify_bundle(bundle))


def test_wrong_stated_roots_are_rejected(bundle):
    next(c for c in bundle["claims"] if c["id"] == "c.roots")["values"] = [num(2), num(4)]
    assert "c.roots" in failed(verify_bundle(bundle))


def test_a_wrong_vieta_rule_is_rejected(bundle):
    bundle["expressions"]["rule"]["b"] = {"op": "div", "a": {"op": "sym", "name": "b"}, "b": {"op": "sym", "name": "a"}}  # S = b/a, sign lost
    assert "c.vieta" in failed(verify_bundle(bundle))


def test_a_wrong_answer_to_the_practice_question_is_rejected(bundle):
    bundle["expressions"]["answer2"]["b"] = num(8)
    assert "c.answer" in failed(verify_bundle(bundle))


def test_the_rule_applied_to_the_example_must_give_the_same_five(bundle):
    bundle["expressions"]["fromRule"]["b"] = num(4)
    assert {"fromRule", "c.sum-rule"} <= set(failed(verify_bundle(bundle)))


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
    r = verify_bundle(b)
    assert "single unknown" in failed(r)["c.amb"]


def test_a_claim_naming_a_missing_expression_fails(bundle):
    bundle["claims"].append({"id": "c.ghost", "kind": "equivalent", "a": "eq1", "b": "ghost"})
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
    bad["expressions"]["total"]["b"] = num(6)
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
    bundle["expressions"]["total"]["b"] = num(6)
    r = c.post("/verify", json=bundle).json()
    assert r["ok"] is False and r["failed"][0]["id"] == "total"
