"""
Numerical tests for the flat-interface refraction module.

Run from the backend folder:
    python tests/test_refraction.py
(also works with:  pytest tests)
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from physics.refraction import critical_angle, refract  # noqa: E402
from simulations.refraction import simulate_refraction  # noqa: E402


def angle_from_normal(direction):
    return np.degrees(np.arcsin(abs(direction[0])))


def test_snell_law_over_a_grid():
    checked = 0
    for n1 in (1.0, 1.33, 1.5, 2.4):
        for n2 in (1.0, 1.33, 1.5, 2.4):
            for angle in range(0, 91, 5):
                r = simulate_refraction(angle, n1, n2, 6)
                theta_c = critical_angle(n1, n2)
                tir_expected = (
                    theta_c is not None and angle > theta_c + 1e-9
                )
                assert r["tir"] == tir_expected, (n1, n2, angle)

                if not r["tir"]:
                    lhs = n1 * np.sin(np.radians(angle))
                    rhs = n2 * np.sin(np.radians(r["refracted_angle"]))
                    assert abs(lhs - rhs) < 1e-9, (n1, n2, angle)
                    # refracted ray must continue into medium 2 (y > 0)
                    assert r["refracted_ray"]["end"][1] >= 0
                    checked += 1
    assert checked > 100


def test_known_values():
    r = simulate_refraction(30, 1.0, 1.5)
    assert abs(r["refracted_angle"] - 19.4712206) < 1e-6
    assert r["bending"] == "towards normal" and r["critical_angle"] is None

    assert abs(critical_angle(1.5, 1.0) - 41.8103149) < 1e-6   # glass -> air
    assert abs(critical_angle(1.33, 1.0) - 48.7535) < 1e-3     # water -> air
    assert critical_angle(1.0, 1.5) is None


def test_total_internal_reflection_geometry():
    r = simulate_refraction(60, 1.5, 1.0)
    assert r["tir"] and r["refracted_angle"] is None
    assert "refracted_ray" not in r and "reflected_ray" in r
    start, end = np.array(r["reflected_ray"]["start"]), np.array(
        r["reflected_ray"]["end"])
    out = (end - start) / np.linalg.norm(end - start)
    assert abs(angle_from_normal(out) - 60) < 1e-9 and out[1] < 0


def test_exactly_at_critical_angle_refracts_along_surface():
    theta_c = critical_angle(1.5, 1.0)
    r = simulate_refraction(theta_c, 1.5, 1.0)
    assert not r["tir"] and abs(r["refracted_angle"] - 90) < 1e-4


def test_normal_incidence_and_equal_indices():
    r = simulate_refraction(0, 1.0, 1.5)
    assert r["refracted_angle"] == 0 and r["deviation"] == 0
    r = simulate_refraction(37, 1.2, 1.2)
    assert abs(r["refracted_angle"] - 37) < 1e-9 and r["bending"] == "none"


def test_negative_angle_is_mirror_image():
    a = simulate_refraction(30, 1.0, 1.5)
    b = simulate_refraction(-30, 1.0, 1.5)
    assert abs(b["refracted_angle"] + a["refracted_angle"]) < 1e-9
    assert abs(b["refracted_ray"]["end"][0]
               + a["refracted_ray"]["end"][0]) < 1e-9


def test_refract_works_from_either_side_of_the_interface():
    # Ray travelling downwards (-y) with the same upward normal.
    d = [np.sin(np.radians(20)), -np.cos(np.radians(20))]
    t = refract(d, [0, 1], 1.5, 1.0)
    assert t is not None and t[1] < 0
    assert abs(1.5 * np.sin(np.radians(20)) - 1.0 * abs(t[0])) < 1e-9


def test_invalid_inputs_raise_value_error():
    bad = [
        (30, 1.0, 0), (30, 0, 1.5), (30, -1, 1.5),
        (30, float("nan"), 1.5), (30, 1.0, float("inf")),
        (120, 1.0, 1.5), (-91, 1.0, 1.5), (float("nan"), 1.0, 1.5),
    ]
    for args in bad:
        try:
            simulate_refraction(*args)
        except ValueError:
            continue
        raise AssertionError(f"{args} should raise ValueError")

    try:
        simulate_refraction(30, 1.0, 1.5, ray_length=0)
    except ValueError:
        pass
    else:
        raise AssertionError("ray_length=0 should raise ValueError")


def test_old_response_keys_are_still_present():
    keys = {"hit", "tir", "incident_ray", "hit_point",
            "incident_angle", "n1", "n2"}
    assert keys <= set(simulate_refraction(30, 1, 1.5))
    assert keys | {"reflected_ray", "message"} <= set(
        simulate_refraction(60, 1.5, 1.0))
    assert "refracted_ray" in simulate_refraction(30, 1, 1.5)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
