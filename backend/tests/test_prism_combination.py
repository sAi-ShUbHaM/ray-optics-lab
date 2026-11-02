"""
Numerical tests for backend/simulations/prism_combination.py

The exact tracer is checked against: the single prism simulation, the exact
single-prism formula, and limits that must hold exactly (identical glasses
cemented together make one bigger prism, a prism turned over against an
identical one makes a flat plate), Snell's law at every surface, and the
thin-prism formulas for the achromatic and direct-vision pairs.

Run from the backend folder:
    python tests/test_prism_combination.py
(also works with:  pytest tests)
"""

import json
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.prism import (  # noqa: E402
    analytic_deviation,
    cauchy_coefficients,
    refractive_index,
    simulate_prism,
)
from simulations.prism_combination import (  # noqa: E402
    build_surfaces,
    ideal_second_apex,
    simulate_prism_combination,
    thin_prism_estimates,
    trace_through,
)

CROWN = dict(n=1.517, v=64.2)
FLINT = dict(n=1.620, v=36.4)
DENSE_FLINT = dict(n=1.785, v=25.7)


def pair(a1, a2, g1=CROWN, g2=FLINT, **kw):
    return simulate_prism_combination(
        apex_angle_1=a1, n_d_1=g1["n"], abbe_number_1=g1["v"],
        apex_angle_2=a2, n_d_2=g2["n"], abbe_number_2=g2["v"], **kw)


def single_prism_deviation(apex, glass, theta1, lam_nm):
    surfaces, _ = build_surfaces([(apex, 1.0)], theta1, 0.0)
    coeffs = cauchy_coefficients(glass["n"], glass["v"])
    result = trace_through(
        surfaces[0].point - np.array([14.0, 0.0]), np.array([1.0, 0.0]), surfaces,
        lambda g: refractive_index(lam_nm, *coeffs), 100.0)
    return result["deviation"]


# ---------------------------------------------------------------------
# Agreement with the single prism simulation and the exact formula
# ---------------------------------------------------------------------

def test_single_prism_matches_the_existing_prism_simulation():
    checked = 0
    for apex, glass, theta1 in [(30, CROWN, 25), (45, CROWN, 40), (60, FLINT, 50), (20, DENSE_FLINT, 15), (35, FLINT, 30)]:
        reference = simulate_prism(apex, glass["n"], glass["v"], theta1, spectrum_samples=7)
        for ray in reference["rays"]:
            if ray["deviation"] is None:
                continue
            mine = single_prism_deviation(apex, glass, theta1, ray["wavelength_nm"])
            assert abs(mine - ray["deviation"]) < 1e-9, (apex, glass, theta1, ray["wavelength_nm"])
            checked += 1
    assert checked >= 25


def test_single_prism_matches_the_textbook_formula():
    for apex, n, theta1 in [(60, 1.5, 40), (40, 1.7, 25), (25, 1.52, 10)]:
        glass = dict(n=n, v=60.0)
        mine = single_prism_deviation(apex, glass, theta1, 589.3)
        assert abs(mine - analytic_deviation(theta1, apex, n)) < 1e-9


# ---------------------------------------------------------------------
# Exact limits
# ---------------------------------------------------------------------

def test_two_cemented_prisms_of_one_glass_make_one_bigger_prism():
    for a1, a2, theta1 in [(10, 15, 20), (20, 25, 30), (5, 40, 10)]:
        result = pair(a1, a2, g1=CROWN, g2=CROWN, arrangement="same", incidence_angle=theta1, gap=0.0)
        for ray in result["rays"]:
            expected = single_prism_deviation(a1 + a2, CROWN, theta1, ray["wavelength_nm"])
            assert abs(ray["deviation"] - expected) < 1e-9, (a1, a2, theta1)


def test_a_prism_against_its_mirror_image_is_a_flat_plate():
    for gap in (0.0, 0.5, 3.0):
        for theta1 in (0, 20, -35):
            result = pair(15, 15, g1=FLINT, g2=FLINT, arrangement="opposite", incidence_angle=theta1, gap=gap)
            for ray in result["rays"]:
                assert abs(ray["deviation"]) < 1e-9, (gap, theta1, ray["wavelength_nm"])
            # the emerging ray is parallel to the incident ray but displaced
            end = np.array(result["rays"][3]["points"][-1])
            assert abs(end[1] - 0.0) > 1e-6 or theta1 == 0


def test_parallel_faces_with_an_air_gap_act_like_the_cemented_joint():
    cemented = pair(12, 7, arrangement="opposite", incidence_angle=25, gap=0.0)
    gapped = pair(12, 7, arrangement="opposite", incidence_angle=25, gap=2.0)
    for a, b in zip(cemented["rays"], gapped["rays"]):
        assert abs(a["deviation"] - b["deviation"]) < 1e-9
    assert len(cemented["faces"]) == 3 and len(gapped["faces"]) == 4
    assert abs(gapped["faces"][1]["normal_angle"] - gapped["faces"][2]["normal_angle"]) < 1e-12


# ---------------------------------------------------------------------
# Physics at every surface
# ---------------------------------------------------------------------

def test_snell_invariant_at_every_surface():
    checked = 0
    for kw in [dict(), dict(arrangement="same"), dict(incidence_angle=40, gap=1.0),
               dict(incidence_angle=-30, arrangement="same"), dict(gap=2.5, incidence_angle=10)]:
        r = pair(12, 9, **kw)
        for step in r["reference"]["steps"]:
            lhs = step["n_before"] * math.sin(math.radians(step["incidence_angle"]))
            rhs = step["n_after"] * math.sin(math.radians(step["refraction_angle"]))
            assert abs(lhs - rhs) < 1e-9
            checked += 1
    assert checked >= 15


def test_bends_at_the_surfaces_add_up_to_the_total_deviation():
    for kw in [dict(), dict(arrangement="same", incidence_angle=30), dict(gap=1.5, incidence_angle=-20)]:
        r = pair(14, 8, **kw)
        total = sum(step["bend"] for step in r["reference"]["steps"])
        assert abs(total - r["reference"]["deviation"]) < 1e-9


def test_the_emerging_direction_matches_the_last_refraction():
    r = pair(10, 5)
    last = r["reference"]["steps"][-1]
    assert abs(last["direction_angle"] + r["reference"]["deviation"]) < 1e-9   # incident ray is at 0 degrees


# ---------------------------------------------------------------------
# Thin prisms: the textbook rules for the two classic combinations
# ---------------------------------------------------------------------

def test_ideal_second_apex_formulas():
    a2_ach, a2_dv = ideal_second_apex(4.0, 1.517, 64.2, 1.620, 36.4)
    assert abs((1.517 - 1.0) * 4.0 / 64.2 - (1.620 - 1.0) * a2_ach / 36.4) < 1e-12
    assert abs((1.517 - 1.0) * 4.0 - (1.620 - 1.0) * a2_dv) < 1e-12


def test_same_direction_deviations_add_for_thin_prisms():
    r = pair(2.0, 1.5, arrangement="same", incidence_angle=0.0)
    first = r["summary"]["first_alone"]["mean_deviation"]
    second = r["summary"]["second_alone"]["mean_deviation"]
    assert abs(r["summary"]["mean_deviation"] - (first + second)) < 0.01 * (first + second)
    thin_mean, thin_disp = thin_prism_estimates(2.0, 1.517, 64.2, 1.5, 1.620, 36.4, +1.0)
    assert abs(r["summary"]["mean_deviation"] - thin_mean) < 0.01 * thin_mean
    assert abs(r["summary"]["angular_dispersion"] - thin_disp) < 0.03 * abs(thin_disp)


def test_achromatic_pair_removes_most_of_the_dispersion():
    a2, _ = ideal_second_apex(4.0, CROWN["n"], CROWN["v"], FLINT["n"], FLINT["v"])
    r = pair(4.0, a2, arrangement="opposite", incidence_angle=0.0)
    s = r["summary"]
    assert abs(s["first_alone"]["angular_dispersion"]) > 0.02
    assert abs(s["angular_dispersion"]) < 0.05 * abs(s["first_alone"]["angular_dispersion"])
    assert s["dispersion_left"] < 0.05
    # but it still bends the light
    assert s["mean_deviation"] > 0.3 * s["first_alone"]["mean_deviation"]


def test_direct_vision_pair_removes_the_mean_deviation_and_keeps_the_spectrum():
    _, a2 = ideal_second_apex(4.0, CROWN["n"], CROWN["v"], DENSE_FLINT["n"], DENSE_FLINT["v"])
    r = pair(4.0, a2, g2=DENSE_FLINT, arrangement="opposite", incidence_angle=0.0)
    s = r["summary"]
    assert abs(s["mean_deviation"]) < 0.02 * s["first_alone"]["mean_deviation"]
    assert abs(s["angular_dispersion"]) > abs(s["first_alone"]["angular_dispersion"])


def test_a_wrong_second_prism_does_not_cancel():
    a2_ach, _ = ideal_second_apex(4.0, CROWN["n"], CROWN["v"], FLINT["n"], FLINT["v"])
    too_big = pair(4.0, a2_ach * 1.6, arrangement="opposite", incidence_angle=0.0)["summary"]
    ideal = pair(4.0, a2_ach, arrangement="opposite", incidence_angle=0.0)["summary"]
    assert abs(too_big["angular_dispersion"]) > 5 * abs(ideal["angular_dispersion"])


def test_the_achromatic_pair_flattens_the_deviation_curve():
    a2, _ = ideal_second_apex(4.0, CROWN["n"], CROWN["v"], FLINT["n"], FLINT["v"])
    r = pair(4.0, a2, arrangement="opposite", incidence_angle=0.0)
    pair_values = [p["pair"] for p in r["curve"]]
    first_values = [p["first_alone"] for p in r["curve"]]
    assert (max(pair_values) - min(pair_values)) < 0.1 * (max(first_values) - min(first_values))
    assert all(a >= b for a, b in zip(first_values, first_values[1:]))        # blue bends more than red


# ---------------------------------------------------------------------
# The prisms are drawn as triangles
# ---------------------------------------------------------------------

def _on_line(point, face):
    """Is the point on the (infinite) line of the face?"""
    psi = math.radians(face["normal_angle"])
    nx, ny = math.cos(psi), math.sin(psi)
    return abs((point[0] - face["point"][0]) * nx + (point[1] - face["point"][1]) * ny) < 1e-9


def test_each_prism_is_a_triangle_whose_apex_is_where_its_faces_meet():
    for kw in [dict(), dict(arrangement="same"), dict(gap=2.0), dict(incidence_angle=-25, apex_angle_1=40, apex_angle_2=15, arrangement="same")]:
        r = simulate_prism_combination(**kw)
        faces = r["faces"]
        entry_faces = [faces[0]] + ([faces[1]] if r["cemented"] else [faces[2]])
        exit_faces = [faces[1], faces[2]] if r["cemented"] else [faces[1], faces[3]]
        for outline, entry, exit_ in zip(r["outlines"], entry_faces, exit_faces):
            apex, b1, b2 = outline["polygon"]
            assert _on_line(apex, entry) and _on_line(apex, exit_)         # the apex lies on both faces
            assert abs(abs(apex[1]) - 7.0) < 1e-9                          # 7 units from the beam
            assert abs(b1[1] + math.copysign(7.0, apex[1])) < 1e-9 and abs(b2[1] + math.copysign(7.0, apex[1])) < 1e-9
            assert (apex[1] > 0) != outline["turned_over"]


def test_the_apex_of_the_triangle_has_the_apex_angle():
    r = simulate_prism_combination(apex_angle_1=40.0, apex_angle_2=15.0, arrangement="same", incidence_angle=10.0)
    for outline in r["outlines"]:
        apex, b1, b2 = outline["polygon"]
        v1 = (b1[0] - apex[0], b1[1] - apex[1])
        v2 = (b2[0] - apex[0], b2[1] - apex[1])
        angle = math.degrees(math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (math.hypot(*v1) * math.hypot(*v2))))
        assert abs(angle - outline["apex_angle"]) < 1e-6


def test_cemented_prisms_share_a_face_and_turned_over_prisms_point_opposite_ways():
    r = simulate_prism_combination()                       # cemented, second prism turned over
    p1, p2 = r["outlines"][0]["polygon"], r["outlines"][1]["polygon"]
    assert p1[0][1] > 0 > p2[0][1]
    shared = [v for v in p1 if any(abs(v[0] - w[0]) < 1e-9 and abs(v[1] - w[1]) < 1e-9 for w in p2)]
    assert len(shared) == 2                                # one common edge
    same = simulate_prism_combination(arrangement="same")  # both apexes up and at the same point
    a, b = same["outlines"][0]["apex"], same["outlines"][1]["apex"]
    assert abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9


def test_the_beam_meets_the_faces_inside_the_triangles_for_ordinary_settings():
    for kw in [dict(), dict(arrangement="same"), dict(gap=1.0), dict(incidence_angle=45), dict(incidence_angle=-30)]:
        assert simulate_prism_combination(**kw)["reference"]["inside_faces"], kw

# ---------------------------------------------------------------------
# Rays that fail, and robustness
# ---------------------------------------------------------------------

def test_total_internal_reflection_stops_the_ray():
    r = pair(55, 20, g1=dict(n=2.0, v=30.0), g2=dict(n=2.0, v=30.0), arrangement="same", incidence_angle=30)
    assert not r["summary"]["all_emerged"]
    bad = [ray for ray in r["rays"] if not ray["emerged"]]
    assert bad and all(ray["deviation"] is None and ray["screen_y"] is None for ray in bad)
    assert any("Total internal reflection" in e for e in bad[0]["events"])


def test_default_pair_is_well_formed():
    r = simulate_prism_combination()
    assert r["valid"] and r["summary"]["all_emerged"] and r["reference"]["inside_faces"]
    assert len(r["outlines"]) == 2 and all(len(o["polygon"]) == 3 for o in r["outlines"])
    assert len(r["rays"]) == 7 and len(r["curve"]) == 31
    ys = [ray["screen_y"] for ray in r["rays"]]
    assert all(y is not None for y in ys)


def test_output_is_finite_json_and_fast():
    start = time.time()
    for kw in [dict(), dict(arrangement="same"), dict(gap=3.0, incidence_angle=35), dict(spectrum_samples=1),
               dict(incidence_angle=-20, apex_angle_1=30, apex_angle_2=20, arrangement="same")]:
        json.dumps(simulate_prism_combination(**kw), allow_nan=False)
    assert time.time() - start < 1.0


def test_invalid_inputs():
    bad = [
        dict(apex_angle_1=0.5), dict(apex_angle_2=70.0), dict(n_d_1=1.0), dict(n_d_2=3.0),
        dict(abbe_number_1=5.0), dict(abbe_number_2=500.0), dict(incidence_angle=75.0),
        dict(gap=-1.0), dict(gap=20.0), dict(arrangement="sideways"), dict(spectrum_samples=0),
        dict(spectrum_samples=20), dict(screen_distance=1.0), dict(incidence_angle=float("nan")),
        dict(apex_angle_1=60.0, apex_angle_2=60.0, arrangement="same", incidence_angle=-60.0),  # a face would tilt past 80 degrees
    ]
    for override in bad:
        try:
            simulate_prism_combination(**override)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
