"""
TcheLab — Test helpers.

Executes scripts directly (no Redis), asserting output invariants.
"""
from __future__ import annotations

import sys
import os
import time
import traceback
from typing import Any

# Path fixup: worker_api/queue.py shadows stdlib's queue, which breaks scipy/sklearn.
# Move any worker_api directory entry to the END of sys.path so stdlib comes first.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)  # worker_api/

# Remove worker_api from wherever it was inserted (e.g. position 0 by `python -m`)
# and re-add at the end so stdlib modules are resolved before our local modules.
for _p in list(sys.path):
    if os.path.abspath(_p) == os.path.abspath(_ROOT):
        sys.path.remove(_p)
if _ROOT not in sys.path:
    sys.path.append(_ROOT)


# ─── Lazy factory bootstrap ───────────────────────────────────────────────────

_factory_ready = False

def _ensure_factory():
    global _factory_ready
    if not _factory_ready:
        from factory import ScriptFactory
        ScriptFactory.autodiscover()
        _factory_ready = True


# ─── Core runner ──────────────────────────────────────────────────────────────

class TestResult:
    def __init__(self, slug: str, passed: bool, duration_ms: float,
                 error: str | None = None, details: str | None = None):
        self.slug = slug
        self.passed = passed
        self.duration_ms = duration_ms
        self.error = error
        self.details = details

    def __repr__(self):
        status = "PASS" if self.passed else "FAIL"
        info = f" | {self.error}" if self.error else ""
        return f"[{status}] {self.slug} ({self.duration_ms:.0f}ms){info}"


def run_script(slug: str, inputs: dict, params: dict) -> tuple[dict[str, Any], float]:
    """Run a script by slug and return (outputs, duration_ms)."""
    _ensure_factory()
    from factory import ScriptFactory
    script = ScriptFactory.get(slug)
    script.validate(inputs, params)
    t0 = time.perf_counter()
    outputs = script.execute(inputs, params)
    elapsed = (time.perf_counter() - t0) * 1000
    return outputs, elapsed


def smoke(slug: str, inputs: dict, params: dict, checks: list) -> TestResult:
    """
    Run a single smoke test.

    `checks` is a list of callables: check(outputs) → None or raises AssertionError.
    """
    try:
        outputs, elapsed = run_script(slug, inputs, params)
        for check in checks:
            check(outputs)
        return TestResult(slug, True, elapsed)
    except Exception as exc:
        tb = traceback.format_exc()
        return TestResult(slug, False, 0.0, error=str(exc), details=tb)


# ─── Common check factories ───────────────────────────────────────────────────

def has_keys(*keys):
    """Assert that all keys are present in outputs."""
    def _check(out):
        for k in keys:
            assert k in out, f"Missing key '{k}' in outputs. Got: {list(out.keys())}"
    return _check


def key_equals(key, expected):
    def _check(out):
        assert out[key] == expected, f"Expected {key}={expected!r}, got {out[key]!r}"
    return _check


def key_ge(key, minimum):
    def _check(out):
        assert out[key] >= minimum, f"Expected {key} >= {minimum}, got {out[key]}"
    return _check


def list_len(key, expected_len):
    def _check(out):
        assert len(out[key]) == expected_len, (
            f"Expected len({key}) == {expected_len}, got {len(out[key])}"
        )
    return _check


def list_len_ge(key, minimum):
    def _check(out):
        assert len(out[key]) >= minimum, (
            f"Expected len({key}) >= {minimum}, got {len(out[key])}"
        )
    return _check


def shape_check(key, expected_shape):
    """Check that out[key] is a list-of-lists with the expected shape."""
    import numpy as np
    def _check(out):
        arr = np.array(out[key])
        assert arr.shape == expected_shape, (
            f"Expected {key}.shape == {expected_shape}, got {arr.shape}"
        )
    return _check


def is_finite_list(key):
    import numpy as np
    def _check(out):
        arr = np.array(out[key], dtype=float)
        assert np.all(np.isfinite(arr)), f"Non-finite values in '{key}'"
    return _check


# ─── Pretty runner ────────────────────────────────────────────────────────────

def run_suite(results: list[TestResult], suite_name: str = "") -> bool:
    """Print results and return True if all passed."""
    print(f"\n{'='*60}")
    if suite_name:
        print(f"  {suite_name}")
        print(f"{'='*60}")
    passed = sum(r.passed for r in results)
    total = len(results)
    for r in results:
        print(f"  {r}")
    print(f"{'─'*60}")
    print(f"  {passed}/{total} passed")
    print(f"{'='*60}\n")
    return passed == total
