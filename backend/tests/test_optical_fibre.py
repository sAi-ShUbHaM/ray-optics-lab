"""
Numerical tests for backend/simulations/optical_fibre.py

The exact ray tracer (reflection, Snell's law, circular bend) is checked against
the textbook formulas: critical angle, numerical aperture, acceptance angle,
reflection count, the minimum bend radius, and modal dispersion.

Run from the backend folder:
    python tests/test_optical_fibre.py
(also works with:  pytest tests)
"""

import itertools
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.optical_fibre import (  # noqa: E402
    HALF_WIDTH,
    SPEED_OF_LIGHT,
    FibreGeometry,
    acceptance_angle_deg,
    SINGLE_MODE_V,
    critical_angle_deg,
    estimated_mode_count,
    minimum_bend_radius,
    single_mode_cutoff_diameter_um,
    v_number,
    numerical_aperture,
    reflections_in_length,
    refracted_axial_angle_deg,
    simulate_optical_fibre,
    trace_ray,
    wall_incidence_deg,
)

INDEX_SETS = [(1.50, 1.35, 1.0), (1.48, 1.46, 1.0), (1.62, 1.45, 1.0),
              (1.50, 1.00, 1.0), (1.46, 1.40, 1.33), (2.00, 1.44, 1.0)]


def run(**kw):
    return simulate_optical_fibre(**kw)


def straight_trace(n1, n2, n0, theta0, h=0.0, view=30.0):
    geometry = FibreGeometry(0.0, 90.0, view)
    theta_r = math.radians(refracted_axial_angle_deg(theta0, n1, n0))
    return trace_ray(geometry, (0.0, h * HALF_WIDTH), (math.cos(theta_r), math.sin(theta_r)),
                     n1, n2, max_events=2000)


# ---------------------------------------------------------------------
# Formulas
# ---------------------------------------------------------------------

def test_numerical_aperture_and_acceptance_angle():
    for n1, n2, n0 in INDEX_SETS:
        na = numerical_aperture(n1, n2)
        assert abs(na - math.sqrt(n1 ** 2 - n2 ** 2)) < 1e-12
        theta_max = acceptance_angle_deg(n1, n2, n0)
        if na / n0 < 1.0:
            assert abs(n0 * math.sin(math.radians(theta_max)) - na) < 1e-9
        else:
            assert theta_max == 90.0                      # every angle is accepted


def test_known_textbook_values():
    # glass core 1.50 in 1.35 cladding, in air
    assert abs(numerical_aperture(1.5, 1.35) - 0.65383) < 1e-4
    assert abs(acceptance_angle_deg(1.5, 1.35) - 40.83) < 0.01
    assert abs(critical_angle_deg(1.5, 1.35) - 64.158) < 0.01
    # a typical telecom fibre has a small acceptance angle
    assert abs(acceptance_angle_deg(1.48, 1.46) - 14.03) < 0.01


def test_critical_angle_and_max_axial_angle():
    for n1, n2, n0 in INDEX_SETS:
        r = run(n_core=n1, n_cladding=n2, n_outside=n0)["numbers"]
        assert abs(math.sin(math.radians(r["critical_angle"])) - n2 / n1) < 1e-12
        assert abs(math.cos(math.radians(r["max_axial_angle"])) - n2 / n1) < 1e-12
        assert abs(r["relative_index_difference"] - (n1 - n2) / n1) < 1e-12


def test_wall_incidence_is_ninety_minus_axial_angle():
    for n1, n2, n0 in INDEX_SETS:
        for angle in (-60, -20, 0, 7, 33):
            theta_r = refracted_axial_angle_deg(angle, n1, n0)
            assert abs(wall_incidence_deg(angle, n1, n0) - (90.0 - abs(theta_r))) < 1e-12


# ---------------------------------------------------------------------
# The ray tracer against the acceptance angle
# ---------------------------------------------------------------------

def test_tracer_guides_exactly_the_rays_inside_the_acceptance_cone():
    checked = 0
    for (n1, n2, n0), h in itertools.product(INDEX_SETS, (0.0, 0.6, -0.8)):
        theta_max = acceptance_angle_deg(n1, n2, n0)
        for k in range(-170, 171, 3):
            theta0 = k / 2.0
            if abs(abs(theta0) - theta_max) < 1e-3:
                continue                                  # skip the exact boundary
            ray = straight_trace(n1, n2, n0, theta0, h)
            assert ray["guided"] == (abs(theta0) < theta_max), (n1, n2, n0, theta0, h)
            checked += 1
    assert checked > 1000


def test_reflections_obey_total_internal_reflection_geometry():
    ray = straight_trace(1.5, 1.35, 1.0, 25.0, 0.3, view=20.0)
    theta_r = math.radians(refracted_axial_angle_deg(25.0, 1.5, 1.0))
    pts = ray["reflections"]
    assert len(pts) >= 3
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        assert abs(abs(y0) - HALF_WIDTH) < 1e-9 and abs(abs(y1) - HALF_WIDTH) < 1e-9
        assert y0 * y1 < 0                                # bounces between opposite walls
        assert abs(abs((y1 - y0) / (x1 - x0)) - math.tan(theta_r)) < 1e-9
    # inside the core the ray never leaves the walls
    assert all(abs(p[1]) <= HALF_WIDTH + 1e-9 for p in ray["points"])


def test_reflection_count_matches_the_formula():
    for theta0, h, view in [(10, 0.0, 30), (25, 0.5, 30), (-25, 0.5, 30), (35, -0.7, 25),
                            (0.5, 0.0, 40), (30, 0.0, 12.5)]:
        ray = straight_trace(1.5, 1.35, 1.0, theta0, h, view)
        theta_r = refracted_axial_angle_deg(theta0, 1.5, 1.0)
        assert ray["reflection_count"] == reflections_in_length(theta_r, view, h), (theta0, h)


def test_axial_ray_never_reflects():
    r = run(entry_angle=0.0, entry_height=0.0)
    assert r["path"]["guided"] and r["path"]["reflection_count"] == 0
    assert r["selected"]["reflections_total"] == 0
    assert abs(r["selected"]["path_stretch"] - 1.0) < 1e-12


def test_mirror_symmetry():
    a = run(entry_angle=22.0, entry_height=0.4)["path"]["points"]
    b = run(entry_angle=-22.0, entry_height=-0.4)["path"]["points"]
    assert len(a) == len(b)
    for p, q in zip(a, b):
        assert abs(p[0] - q[0]) < 1e-9 and abs(p[1] + q[1]) < 1e-9


# ---------------------------------------------------------------------
# Rays that are not guided
# ---------------------------------------------------------------------

def test_leaking_ray_obeys_snells_law_at_the_wall():
    r = run(n_core=1.5, n_cladding=1.35, entry_angle=60.0)
    leak = r["path"]["leak"]
    assert not r["path"]["guided"] and leak is not None
    assert leak["incidence_deg"] < r["numbers"]["critical_angle"]
    lhs = 1.5 * math.sin(math.radians(leak["incidence_deg"]))
    rhs = 1.35 * math.sin(math.radians(leak["refracted_deg"]))
    assert abs(lhs - rhs) < 1e-9
    assert leak["refracted_deg"] > leak["incidence_deg"]  # bends away from the normal


def test_ray_just_inside_and_just_outside_the_cone():
    theta_max = acceptance_angle_deg(1.5, 1.35)
    assert run(entry_angle=theta_max - 0.2)["path"]["guided"]
    assert not run(entry_angle=theta_max + 0.2)["path"]["guided"]


def test_fan_and_sweep_agree_with_the_acceptance_cone():
    r = run()
    theta_max = r["numbers"]["acceptance_angle"]
    assert len(r["fan"]) == 5
    for ray in r["fan"]:
        assert ray["guided"] == (abs(ray["entry_angle"]) <= theta_max)
        assert ray["inside_acceptance_cone"] == ray["guided"]
    assert len(r["sweep"]) == 179
    for item in r["sweep"]:
        assert item["guided"] == (abs(item["entry_angle"]) <= theta_max + 1e-9)
    # the wall incidence falls as the entry angle grows
    values = [s["wall_incidence"] for s in r["sweep"] if s["entry_angle"] >= 0]
    assert all(a >= b for a, b in zip(values, values[1:]))


def test_all_angles_accepted_when_na_exceeds_the_outside_index():
    r = run(n_core=1.5, n_cladding=1.0, entry_angle=70.0)
    assert r["numbers"]["all_angles_accepted"] and r["numbers"]["acceptance_angle"] == 90.0
    assert r["path"]["guided"]


# ---------------------------------------------------------------------
# Bends
# ---------------------------------------------------------------------

def test_minimum_bend_radius_formula():
    # R_min = a (n1 + n2) / (n1 - n2) with a = half a core diameter
    for n1, n2, _ in INDEX_SETS:
        expected = HALF_WIDTH * (n1 + n2) / (n1 - n2)
        assert abs(minimum_bend_radius(n1, n2) - expected) < 1e-12
    assert abs(minimum_bend_radius(1.5, 1.35) - 9.5) < 1e-12


def test_bend_guides_axis_parallel_rays_exactly_above_the_critical_radius():
    # a ray parallel to the axis at height h meets the outer wall with
    # sin(i) = (R - h) / (R + a); it is guided when R >= (n1 h + n2 a) / (n1 - n2)
    n1, n2 = 1.50, 1.35
    for fraction in (-0.5, 0.0, 0.5, 0.95):
        h = fraction * HALF_WIDTH
        r_crit = (n1 * h + n2 * HALF_WIDTH) / (n1 - n2)
        above = run(n_core=n1, n_cladding=n2, entry_angle=0.0, entry_height=fraction,
                    bend_radius=r_crit * 1.03)["path"]
        below = run(n_core=n1, n_cladding=n2, entry_angle=0.0, entry_height=fraction,
                    bend_radius=r_crit * 0.97)["path"]
        assert above["guided"], (fraction, r_crit)
        assert not below["guided"] and below["leak"]["wall"] == "outer wall", (fraction, r_crit)


def test_every_axis_parallel_ray_is_guided_above_the_minimum_radius():
    n1, n2 = 1.50, 1.35
    r_min = minimum_bend_radius(n1, n2)
    for fraction in (-0.95, -0.5, 0.0, 0.5, 0.95):
        assert run(n_core=n1, n_cladding=n2, entry_angle=0.0, entry_height=fraction,
                   bend_radius=r_min * 1.02)["path"]["guided"]
    # just below it the ray at the inner edge leaks
    assert not run(n_core=n1, n_cladding=n2, entry_angle=0.0, entry_height=0.95,
                   bend_radius=r_min * 0.9)["path"]["guided"]


def test_bend_reports_its_geometry():
    r = run(bend_radius=15.0, bend_angle=120.0)
    assert r["bend"]["bent"] and r["bend"]["radius_diameters"] == 15.0
    assert r["bend"]["angle_deg"] == 120.0
    assert abs(r["bend"]["minimum_radius_um"] - r["bend"]["minimum_radius_diameters"] * 50.0) < 1e-9
    top = r["outline"]["core_upper"][-1]
    assert abs(top[0] - (4.0 + 14.5 * math.sin(math.radians(120)))) < 1e-9
    assert not run()["bend"]["bent"]


# ---------------------------------------------------------------------
# Totals for the real fibre
# ---------------------------------------------------------------------

def test_path_length_travel_time_and_delay():
    r = run(n_core=1.5, n_cladding=1.35, entry_angle=20.0, length_m=1000.0)
    s = r["selected"]
    theta_r = math.radians(refracted_axial_angle_deg(20.0, 1.5))
    assert abs(s["path_stretch"] - 1.0 / math.cos(theta_r)) < 1e-12
    assert abs(s["path_length_m"] - 1000.0 / math.cos(theta_r)) < 1e-9
    assert abs(s["travel_time_ns"] - 1.5 * 1000.0 / math.cos(theta_r) / SPEED_OF_LIGHT * 1e9) < 1e-6
    axial = 1.5 * 1000.0 / SPEED_OF_LIGHT * 1e9
    assert abs(s["delay_vs_axial_ns"] - (s["travel_time_ns"] - axial)) < 1e-9
    assert s["delay_vs_axial_ns"] > 0


def test_modal_dispersion_equals_the_delay_of_the_steepest_guided_ray():
    n1, n2 = 1.5, 1.35
    r = run(n_core=n1, n_cladding=n2, length_m=2000.0)
    steepest = math.acos(n2 / n1)                         # the critical ray inside the core
    delay = (n1 * 2000.0 / SPEED_OF_LIGHT) * (1.0 / math.cos(steepest) - 1.0) * 1e9
    assert abs(r["numbers"]["modal_dispersion_ns"] - delay) < 1e-6
    assert abs(r["numbers"]["modal_dispersion_ns"] - (n1 * 2000.0 / SPEED_OF_LIGHT) * (n1 / n2 - 1.0) * 1e9) < 1e-9
    assert abs(r["numbers"]["modal_dispersion_ns_per_km"] - r["numbers"]["modal_dispersion_ns"] / 2.0) < 1e-9


def test_total_reflections_scale_with_length_and_inverse_with_diameter():
    base = run(entry_angle=20.0, length_m=100.0, core_diameter_um=50.0)["selected"]["reflections_total"]
    longer = run(entry_angle=20.0, length_m=200.0, core_diameter_um=50.0)["selected"]["reflections_total"]
    thinner = run(entry_angle=20.0, length_m=100.0, core_diameter_um=25.0)["selected"]["reflections_total"]
    assert abs(longer / base - 2.0) < 1e-3
    assert abs(thinner / base - 2.0) < 1e-3


# ---------------------------------------------------------------------
# Core diameter: wave-guide behaviour (V number)
# ---------------------------------------------------------------------

def test_v_number_formula():
    # V = pi d NA / lambda, with d and lambda in the same unit
    na = math.sqrt(1.5 ** 2 - 1.35 ** 2)
    assert abs(v_number(1.5, 1.35, 50.0, 850.0) - math.pi * 50.0 * na / 0.850) < 1e-9
    # a typical 50 micrometre multimode fibre at 850 nm carries about a thousand modes
    v = v_number(1.48, 1.46, 50.0, 850.0)
    assert 40.0 < v < 50.0
    assert 900 <= estimated_mode_count(v) <= 1100


def test_v_number_scales_with_diameter_and_inverse_wavelength():
    base = v_number(1.5, 1.35, 20.0, 1000.0)
    assert abs(v_number(1.5, 1.35, 40.0, 1000.0) / base - 2.0) < 1e-12
    assert abs(v_number(1.5, 1.35, 20.0, 500.0) / base - 2.0) < 1e-12


def test_single_mode_cutoff_diameter():
    tried = 0
    for n1, n2, _ in INDEX_SETS[:3]:
        for wavelength in (633.0, 850.0, 1310.0, 1550.0):
            d_c = single_mode_cutoff_diameter_um(n1, n2, wavelength)
            assert abs(v_number(n1, n2, d_c, wavelength) - SINGLE_MODE_V) < 1e-9
            # only diameters the simulation accepts (1 to 1000 micrometres)
            if 1.0 <= d_c * 0.98:
                below = run(n_core=n1, n_cladding=n2, core_diameter_um=d_c * 0.98, wavelength_nm=wavelength)["numbers"]
                assert below["single_mode"] and below["estimated_modes"] == 1
                tried += 1
            if 1.0 <= d_c * 1.05 <= 1000.0:
                above = run(n_core=n1, n_cladding=n2, core_diameter_um=d_c * 1.05, wavelength_nm=wavelength)["numbers"]
                assert not above["single_mode"] and above["estimated_modes"] >= 2
                tried += 1
    assert tried >= 6


def test_core_diameter_changes_the_v_number_and_the_mode_count_in_the_simulation():
    thin = run(core_diameter_um=5.0)["numbers"]
    thick = run(core_diameter_um=100.0)["numbers"]
    assert thin["v_number"] < thick["v_number"]
    assert thick["estimated_modes"] > thin["estimated_modes"] >= 1
    assert abs(thick["v_number"] / thin["v_number"] - 20.0) < 1e-9
    # but not a single ray angle
    assert thin["critical_angle"] == thick["critical_angle"]
    assert thin["numerical_aperture"] == thick["numerical_aperture"]
    assert thin["acceptance_angle"] == thick["acceptance_angle"]


def test_mode_count_estimate():
    assert estimated_mode_count(1.0) == 1 and estimated_mode_count(SINGLE_MODE_V) == 1
    assert estimated_mode_count(2.5) >= 2
    assert estimated_mode_count(20.0) == 200


# ---------------------------------------------------------------------
# Robustness
# ---------------------------------------------------------------------

def test_output_is_finite_json():
    for kw in [dict(), dict(bend_radius=8.0), dict(entry_angle=85.0), dict(entry_angle=-85.0, bend_radius=3.0),
               dict(n_core=1.48, n_cladding=1.46, length_m=1e5), dict(n_outside=1.45, n_core=1.5, n_cladding=1.4)]:
        json.dumps(run(**kw), allow_nan=False)


def test_bounds_contain_everything_that_is_drawn():
    r = run(bend_radius=10.0, entry_angle=30.0)
    b = r["bounds"]
    for key in r["outline"].values():
        for x, y in key:
            assert b["x_min"] - 1e-9 <= x <= b["x_max"] + 1e-9 and b["y_min"] - 1e-9 <= y <= b["y_max"] + 1e-9
    for x, y in r["path"]["points"]:
        assert b["x_min"] - 1e-9 <= x <= b["x_max"] + 1e-9 and b["y_min"] - 1e-9 <= y <= b["y_max"] + 1e-9


def test_fast_enough_for_live_sliders():
    start = time.time()
    for kw in [dict(), dict(bend_radius=12.0), dict(entry_angle=-40.0, bend_radius=30.0, bend_angle=180.0)]:
        run(**kw)
    assert time.time() - start < 1.0


def test_invalid_inputs():
    bad = [
        dict(n_core=1.3, n_cladding=1.4), dict(n_core=1.5, n_cladding=1.5),     # cladding not smaller
        dict(n_core=1.5, n_cladding=1.4, n_outside=1.5),                         # outside not smaller
        dict(n_core=0.9), dict(n_core=4.0), dict(n_cladding=0.5), dict(n_outside=2.0),
        dict(entry_angle=90.0), dict(entry_angle=-95.0), dict(entry_angle=float("nan")),
        dict(entry_height=1.0), dict(core_diameter_um=0.0), dict(length_m=0.0),
        dict(bend_radius=0.5), dict(bend_radius=1000.0), dict(bend_radius=-3.0),
        dict(bend_angle=5.0), dict(bend_angle=200.0), dict(view_length=1.0),
        dict(wavelength_nm=100.0), dict(wavelength_nm=5000.0), dict(wavelength_nm=float("nan")),
    ]
    for override in bad:
        try:
            run(**override)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
