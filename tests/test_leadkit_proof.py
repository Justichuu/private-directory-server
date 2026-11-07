"""Verify this repository's mathematical proof (PROOF.idm) using LeadKit (iDoMath + Abacussy + W.R.A. + CHAU)."""
import importlib.util
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORKING = REPO.parent if (REPO.parent / "leadkit").is_dir() else REPO.parents[1]
PROVE_PY = WORKING / "leadkit" / "src" / "leadkit" / "prove.py"


def _load_prove():
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
