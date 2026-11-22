"""Verify this repository's mathematical proof (PROOF.idm) using LeadKit (iDoMath + Abacussy + W.R.A. + CHAU)."""
import importlib.util
import os
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


def _find_prove():
    """LeadKit's prove.py: the LEADKIT_HOME setting first, then a leadkit folder beside this repo or one folder up."""
    for home in (os.environ.get("LEADKIT_HOME"), REPO.parent / "leadkit", REPO.parents[1] / "leadkit"):
        if home and (prove := Path(home, "src", "leadkit", "prove.py")).is_file():
            return prove
    return None


PROVE_PY = _find_prove()


def _load_prove():
    if PROVE_PY is None:
        pytest.skip("U: LeadKit not found beside this repo; set LEADKIT_HOME to a leadkit checkout")
    spec = importlib.util.spec_from_file_location("leadkit_prove", PROVE_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_leadkit_mathematical_proof():
    prove = _load_prove()
    report = prove.verify_repo(REPO)
    assert report["face"] == "1"
    assert report["claims_true"] == report["claims_total"]
    assert report["claims_false"] == 0
    assert report["claims_unknown"] == 0
    assert report["uncounted"] == []
    assert report["chau_caught"] is True
