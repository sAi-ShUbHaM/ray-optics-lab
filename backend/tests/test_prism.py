"""
Numerical tests for backend/simulations/prism.py

The exact ray tracer is checked against the textbook prism formulas.

Run from the backend folder:
    python tests/test_prism.py
(also works with:  pytest tests)
"""

import itertools
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.prism import (  # noqa: E402
    analytic_deviation,
    cauchy_coefficients,
    minimum_deviation,
    refractive_index,
    simulate_prism,
    wavelength_to_hex,
)


def run(**kw):
    base = dict(apex_angle=60, n_d=1.5168, abbe_number=64.17, incidence_angle=45,
                spectrum_samples=1, wavelength_nm=589.3)
    base.update(kw)
    return simulate_prism(**base)


def test_cauchy_model_reproduces_n_d_and_abbe_number():
    for n_d, V in [(1.5168, 64.17), (1.62, 36.4), (1.333, 55.8), (2.4175, 55.3)]:
        c0, c1 = cauchy_coefficients(n_d, V)
        assert abs(refractive_index(589.3, c0, c1) - n_d) < 1e-9
        n_f = refractive_index(486.1, c0, c1)
        n_c = refractive_index(656.3, c0, c1)
        assert abs((n_d - 1) / (n_f - n_c) - V) < 1e-6
        # normal dispersion: blue bends more than red
        assert refractive_index(400, c0, c1) > refractive_index(700, c0, c1)


def test_wavelength_colours():
    assert wavelength_to_hex(650) == "#ff0000"             # red
    assert wavelength_to_hex(450)[1:3] == "00"             # no red in blue
    g = wavelength_to_hex(530)
    assert g[3:5] > g[1:3] and g[3:5] > g[5:7]             # green dominates
    assert wavelength_to_hex(900) == "#000000"             # outside the visible range


def test_ray_trace_matches_textbook_deviation_formula():
    checked = 0
    for A, n_d, theta1 in itertools.product(
            (20, 40, 60, 75), (1.33, 1.5168, 1.62, 2.4), range(-20, 80, 7)):
        res = run(apex_angle=A, n_d=n_d, incidence_angle=theta1, abbe_number=60)
        ref = res["reference"]
        expected = analytic_deviation(theta1, A, n_d)
        simple = (ref["emerged"] and len(ref["events"]) == 2
                  and ref["events"][1].endswith("right face"))
        if expected is None or not simple:
            continue
        assert abs(ref["deviation"] - expected) < 1e-7, (A, n_d, theta1)
        checked += 1
    assert checked > 50


def test_minimum_deviation_formula_and_symmetric_path():
    for A, n in [(60, 1.5168), (45, 1.62), (30, 1.33), (60, 1.7)]:
        d_min, t1_min = minimum_deviation(A, n)
        # n = sin((A + d_min)/2) / sin(A/2)
        assert abs(np.sin(np.radians((A + d_min) / 2)) / np.sin(np.radians(A / 2)) - n) < 1e-12

        res = run(apex_angle=A, n_d=n, incidence_angle=t1_min)
        pts = res["reference"]
        assert abs(pts["deviation"] - d_min) < 1e-9
        # inside the prism the ray runs parallel to the base
        ray_points = res["rays"][0]["points"]
        p1, p2 = np.array(ray_points[1]), np.array(ray_points[2])
        assert abs(p2[1] - p1[1]) < 1e-9, (A, n)

        # it really is the minimum of the analytic curve
        curve = [d for _, d in res["curve"]]
        assert abs(min(curve) - d_min) < 1e-9          # curve includes the exact minimum
        angles = [a for a, _ in res["curve"]]
        assert angles == sorted(angles)                # and stays ordered for plotting
        assert abs(res["min_deviation"] - d_min) < 1e-9


def test_thin_prism_approximation():
    res = run(apex_angle=6, n_d=1.5168, incidence_angle=3.0)
    assert abs(res["reference"]["deviation"] - res["thin_prism_deviation"]) < 0.05 * res["thin_prism_deviation"]


def test_dispersion_violet_deviates_more_than_red():
    res = simulate_prism(60, 1.5168, 64.17, 45, spectrum_samples=7)
    devs = [r["deviation"] for r in res["rays"]]
    assert all(d is not None for d in devs)
    assert all(a > b for a, b in zip(devs, devs[1:]))       # monotonic: 400 nm ... 700 nm
    assert res["angular_dispersion"] > 0
    assert res["screen_spread"] is not None and res["screen_spread"] > 0
    # thin prism: angular dispersion ~ (n_400 - n_700) * A
    res = simulate_prism(8, 1.5168, 64.17, 4.0, spectrum_samples=3)
    n_violet, n_red = res["rays"][0]["n"], res["rays"][-1]["n"]
    expected = (n_violet - n_red) * 8
    assert abs(res["angular_dispersion"] - expected) < 0.05 * expected
    # a lower Abbe number means MORE dispersion
    low_v = simulate_prism(60, 1.62, 25, 45, spectrum_samples=3)["angular_dispersion"]
    high_v = simulate_prism(60, 1.62, 70, 45, spectrum_samples=3)["angular_dispersion"]
    assert low_v > high_v


def test_snell_law_at_the_first_face():
    # n = 1.62, A = 60, theta1 = 45: r2 = 34.1 deg < critical angle 38.1 deg,
    # so this is a simple pass through two faces.
    A, n, theta1 = 60.0, 1.62, 45.0
    res = run(apex_angle=A, n_d=n, incidence_angle=theta1, abbe_number=36.4)
    ang = res["reference"]["angles"]
    assert ang is not None

    # Snell's law and the prism relation r1 + r2 = A
    assert abs(np.sin(np.radians(ang["theta1"])) - n * np.sin(np.radians(ang["r1"]))) < 1e-12
    assert abs(ang["r1"] + ang["r2"] - A) < 1e-12
    assert abs(np.sin(np.radians(ang["theta4"])) - n * np.sin(np.radians(ang["r2"]))) < 1e-12

    # r1 read back from the traced path: the angle between the inner ray
    # and the inward normal of the left face (counter-clockwise positive).
    pts = [np.array(p) for p in res["rays"][0]["points"]]
    inner = pts[2] - pts[1]
    inward = np.array([np.cos(np.radians(A / 2)), -np.sin(np.radians(A / 2))])
    r1_path = np.degrees(np.arctan2(inner[1], inner[0]) - np.arctan2(inward[1], inward[0]))
    assert abs(r1_path - ang["r1"]) < 1e-9


def test_critical_angle_decides_total_internal_reflection():
    # The same prism that passes light at 45 degrees traps it at 30 degrees.
    passes = run(apex_angle=60, n_d=1.62, incidence_angle=45, abbe_number=36.4)
    traps = run(apex_angle=60, n_d=1.62, incidence_angle=30, abbe_number=36.4)
    assert passes["reference"]["angles"] is not None
    assert traps["reference"]["angles"] is None
    assert any("Total internal reflection" in e for e in traps["reference"]["events"])
    # critical angle for n = 1.62 is about 38.1 degrees
    assert abs(traps["critical_angle"] - 38.1) < 0.05


def test_total_internal_reflection_inside_the_prism():
    # large apex angle: the beam cannot leave through the right face
    res = run(apex_angle=90, n_d=1.5168, incidence_angle=30)
    events = res["reference"]["events"]
    assert any("Total internal reflection" in e for e in events)
    # TIR must keep the path finite and well-formed
    for p in res["rays"][0]["points"]:
        assert np.all(np.isfinite(p))


def test_right_angle_reflecting_prism_turns_light_by_90_degrees():
    res = run(apex_angle=90, n_d=1.5, abbe_number=60, incidence_angle=0)
    ref = res["reference"]
    assert ref["emerged"]
    assert ref["events"] == [
        "Refracted into the prism at the left face",
        "Total internal reflection at the base",
        "Refracted out at the right face",
    ]
    assert abs(abs(ref["deviation"]) - 90.0) < 1e-9


def test_screen_hits_and_extents():
    res = run(screen_distance=30)
    ray = res["rays"][0]
    assert ray["screen_y"] is not None
    assert abs(ray["points"][-1][0] - res["screen_x"]) < 1e-9
    # the white (incident) segment starts left of the prism
    assert res["incident_start"][0] < res["prism"]["left"][0]


def test_path_is_continuous_and_json_safe_on_a_grid():
    for A, n_d, theta1, frac in itertools.product(
            (10, 45, 60, 90, 120), (1.0, 1.33, 1.7, 2.4), (-60, 0, 45, 85), (0.2, 0.5, 0.8)):
        res = simulate_prism(A, n_d, 50, theta1, entry_fraction=frac, spectrum_samples=3)
        json.dumps(res)
        for ray in res["rays"]:
            pts = np.array(ray["points"])
            assert np.all(np.isfinite(pts)) and len(pts) >= 2


def test_invalid_inputs():
    good = dict(apex_angle=60, n_d=1.5, abbe_number=60, incidence_angle=30)
    bad = [
        dict(apex_angle=3), dict(apex_angle=150), dict(apex_angle=float("nan")),
        dict(n_d=0.9), dict(n_d=3.5), dict(abbe_number=5), dict(abbe_number=500),
        dict(incidence_angle=90), dict(incidence_angle=-95), dict(entry_fraction=0.0),
        dict(entry_fraction=1.0), dict(wavelength_nm=300), dict(screen_distance=0),
        dict(spectrum_samples=0), dict(spectrum_samples=14), dict(spectrum_samples=2.5),
    ]
    for override in bad:
        kwargs = {**good, **override}
        try:
            simulate_prism(**kwargs)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
