"""
Numerical tests for backend/simulations/rainbow.py

The exact vector ray trace through the drop is checked against the
closed-form rainbow theory.

Run from the backend folder:
    python tests/test_rainbow.py
(also works with:  pytest tests)
"""

import itertools
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.rainbow import (  # noqa: E402
    deviation_deg,
    fresnel_reflectance,
    rainbow_incidence,
    ray_weight,
    simulate_rainbow,
    trace_drop,
)


def test_known_water_rainbow_angles():
    n = 4.0 / 3.0
    # primary: cos^2 i = (n^2 - 1)/3, D_min ~ 138 deg -> bow at ~ 42 deg
    i1 = rainbow_incidence(n, 1)
    assert abs(np.cos(i1) ** 2 - (n * n - 1) / 3) < 1e-12
    assert abs(np.degrees(i1) - 59.39) < 0.01
    assert abs(deviation_deg(i1, n, 1) - 137.97) < 0.01
    assert abs(180 - deviation_deg(i1, n, 1) - 42.03) < 0.01
    # secondary: cos^2 i = (n^2 - 1)/8, D_min ~ 231 deg -> bow at ~ 51 deg
    i2 = rainbow_incidence(n, 2)
    assert abs(np.degrees(i2) - 71.83) < 0.01
    assert abs(deviation_deg(i2, n, 2) - 230.98) < 0.01
    assert abs(deviation_deg(i2, n, 2) - 180 - 50.98) < 0.01


def test_stationary_point_is_the_true_extremum_of_the_deviation():
    for n, k in itertools.product((1.2, 1.333, 1.5, 1.8), (1, 2)):
        i_min = rainbow_incidence(n, k)
        grid = np.linspace(0.001, np.pi / 2 - 0.001, 200001)
        dev = deviation_deg(grid, n, k)
        numeric = grid[np.argmin(dev)]
        assert abs(numeric - i_min) < 2e-4, (n, k)
        assert dev.min() >= deviation_deg(i_min, n, k) - 1e-6
        # derivative vanishes there
        h = 1e-6
        slope = (deviation_deg(i_min + h, n, k) - deviation_deg(i_min - h, n, k)) / (2 * h)
        assert abs(slope) < 1e-4


def test_ray_trace_matches_the_deviation_formula():
    checked = 0
    for n, k, b in itertools.product((1.33, 1.5, 1.8), (1, 2), np.linspace(0.02, 0.98, 25)):
        tr = trace_drop(float(b), n, k)
        i = np.arcsin(b)
        expected = float(deviation_deg(i, n, k) % 360.0)
        assert abs(tr["deviation"] - expected) < 1e-8, (n, k, b)
        checked += 1
    assert checked == 150


def test_inner_path_geometry():
    n, b = 1.333, 0.86
    for k in (1, 2):
        pts = [np.array(p) for p in trace_drop(b, n, k)["points"]]
        surface_points = pts[1:-1]                       # hits on the drop
        for p in surface_points:
            assert abs(np.linalg.norm(p) - 1.0) < 1e-12
        # every chord inside the drop has length 2 cos r
        r = np.arcsin(b / n)
        chords = [np.linalg.norm(surface_points[j + 1] - surface_points[j])
                  for j in range(len(surface_points) - 1)]
        assert len(chords) == k + 1       # entry -> reflection ... reflection -> exit
        for c in chords:
            assert abs(c - 2 * np.cos(r)) < 1e-12


def test_a_ray_never_suffers_total_internal_reflection_in_a_drop():
    # the inside angle r never exceeds the critical angle, so every ray escapes
    for n in (1.1, 1.333, 1.7, 1.95):
        for b in np.linspace(0.0, 0.999, 60):
            for k in (1, 2):
                trace_drop(float(b), n, k)


def test_colour_order_primary_and_secondary():
    res = simulate_rainbow(spectrum_samples=7)
    primary, secondary = res["primary"], res["secondary"]
    p_angles = [r["angle"] for r in primary]     # 400 nm ... 700 nm
    s_angles = [r["angle"] for r in secondary]
    assert all(a < b for a, b in zip(p_angles, p_angles[1:]))        # red on the OUTSIDE
    assert all(a > b for a, b in zip(s_angles, s_angles[1:]))        # red on the INSIDE
    assert 40.0 < p_angles[0] < 41.5 and 42.0 < p_angles[-1] < 43.0   # violet ~40.6, red ~42.4
    assert 50.0 < s_angles[-1] < 51.0 and 53.0 < s_angles[0] < 54.0
    assert res["alexander_band"][0] < res["alexander_band"][1]       # a real dark band
    assert 6.0 < res["alexander_band"][1] - res["alexander_band"][0] < 10.0


def test_more_dispersion_widens_the_bow():
    wide = simulate_rainbow(abbe_number=25)["primary"]
    narrow = simulate_rainbow(abbe_number=90)["primary"]
    assert (wide[-1]["angle"] - wide[0]["angle"]) > (narrow[-1]["angle"] - narrow[0]["angle"])


def test_higher_index_shrinks_the_primary_bow():
    angles = [simulate_rainbow(n_d=n)["primary"][3]["angle"] for n in (1.25, 1.333, 1.5, 1.8)]
    assert all(a > b for a, b in zip(angles, angles[1:]))
    assert abs(angles[2] - 22.8) < 1.0           # glass beads (n = 1.5) give a small bow


def test_brightness_has_a_sharp_edge_at_the_bow_and_a_dark_band():
    res = simulate_rainbow(spectrum_samples=7)
    h = res["histogram"]
    centres = np.array(h["centres"])
    green = h["series"][3]                        # 550 nm
    primary = np.array(green["primary"])
    secondary = np.array(green["secondary"])

    theta_p = res["primary"][3]["angle"]
    theta_s = res["secondary"][3]["angle"]

    # primary rays exist only INSIDE the bow (theta <= theta_p); none beyond it
    assert primary[centres > theta_p + 0.3].max() == 0.0
    assert primary[centres < theta_p - 0.3].max() > 0
    assert abs(centres[np.argmax(primary)] - theta_p) < 0.4
    # secondary rays exist only OUTSIDE its bow (theta >= theta_s)
    assert secondary[centres < theta_s - 0.3].max() == 0.0
    assert abs(centres[np.argmax(secondary)] - theta_s) < 0.4
    # between the two bows (Alexander's dark band) there is no light
    gap = (centres > theta_p + 0.4) & (centres < theta_s - 0.4)
    assert primary[gap].max() == 0.0 and secondary[gap].max() == 0.0
    # and the secondary bow is fainter than the primary
    assert secondary.max() < primary.max()


def test_fresnel_reflectance():
    n = 1.333
    r0 = float(fresnel_reflectance(1e-6, n))
    assert abs(r0 - ((n - 1) / (n + 1)) ** 2) < 1e-6                 # ~ 2 % at normal incidence
    assert float(fresnel_reflectance(np.radians(89.9), n)) > 0.9     # grazing: nearly total
    for i in np.radians([10, 30, 59.4, 80]):
        R = float(fresnel_reflectance(i, n))
        assert 0.0 < R < 1.0
        assert float(ray_weight(i, n, 2)) < float(ray_weight(i, n, 1))   # extra reflection costs light


def test_droplet_rays_split_by_colour():
    res = simulate_rainbow(impact_parameter=0.86, spectrum_samples=5)
    devs = [r["deviation"] for r in res["droplet"]]
    assert len(devs) == 5 and max(devs) - min(devs) > 0.5
    assert all(a > b for a, b in zip(devs, devs[1:]))                # violet is turned through more
    for ray in res["droplet"]:
        assert len(ray["points"]) == 2 + 1 + res["internal_reflections"] + 1
        assert abs(ray["refraction_angle"] - np.degrees(np.arcsin(0.86 / ray["n"]))) < 1e-9


def test_histogram_window_follows_the_bows_and_has_no_nan():
    # other liquids put the bows far from water's 42 / 51 degrees
    for n_d in (1.1, 1.25, 1.333, 1.5, 1.7, 1.95):
        res = simulate_rainbow(n_d=n_d, spectrum_samples=5)
        json.dumps(res, allow_nan=False)                    # raises on NaN / inf
        h = res["histogram"]
        angles = [r["angle"] for r in res["primary"] + res["secondary"]]
        # margin of at least 4 degrees on each side, except where the angle range ends
        assert h["angle_min"] <= max(0.0, min(angles) - 4.0)
        assert h["angle_max"] >= min(180.0, max(angles) + 4.0)
        peak = max(max(s["primary"]) for s in h["series"])
        assert abs(peak - 1.0) < 1e-12                      # normalised, never empty
        assert len(h["centres"]) == 125 == len(h["series"][0]["primary"])


def test_dark_band_exists_only_when_the_bows_do_not_overlap():
    water = simulate_rainbow(n_d=1.333)
    assert water["alexander_band"] is not None
    lo, hi = water["alexander_band"]
    assert lo < hi and abs(lo - 42.46) < 0.05 and abs(hi - 50.20) < 0.05
    # n = 1.25: the secondary bow (26-29 deg) lies INSIDE the primary (54-56 deg)
    low = simulate_rainbow(n_d=1.25)
    assert low["alexander_band"] is None
    assert max(r["angle"] for r in low["secondary"]) < min(r["angle"] for r in low["primary"])
    # n = 1.5 (glass beads): wide dark band between the small primary and far secondary
    glass = simulate_rainbow(n_d=1.5)
    assert glass["alexander_band"] is not None
    assert glass["alexander_band"][1] - glass["alexander_band"][0] > 50
    # the primary bow shrinks to (almost) a point as n approaches 2
    assert simulate_rainbow(n_d=1.95)["primary"][3]["angle"] < 1.0


def test_deviation_curves_are_smooth_with_one_minimum():
    for k in (1, 2):
        res = simulate_rainbow(internal_reflections=k)
        assert len(res["curves"]) == 3
        for curve in res["curves"]:
            pts = np.array(curve["points"])
            b_vals, d = pts[:, 0], pts[:, 1]
            steps = np.abs(np.diff(d))
            # a wrap error would be a jump of 100+ degrees; the curve really is steep
            # only at grazing incidence (b -> 1), so check the bulk more strictly
            assert steps.max() < 10.0
            assert steps[b_vals[:-1] < 0.95].max() < 1.0      # smooth away from grazing incidence
            assert d.min() > 100.0                              # never wraps down to 0
            assert abs(d[0] - (180.0 if k == 1 else 360.0)) < 1e-9  # b = 0: straight in, k reflections
            m = int(np.argmin(d))
            assert 0 < m < len(d) - 1                           # minimum inside the range
            assert np.all(np.diff(d[: m + 1]) < 1e-9)           # falls to the minimum ...
            assert np.all(np.diff(d[m:]) > -1e-9)               # ... then rises
    # the minimum of each curve is the rainbow ray of that wavelength:
    # compare with the closed form evaluated at the same refractive index
    for k in (1, 2):
        res = simulate_rainbow(internal_reflections=k)
        for curve in res["curves"]:
            n = res["cauchy_c0"] + res["cauchy_c1"] / (curve["wavelength_nm"] / 1000.0) ** 2
            expected = float(deviation_deg(rainbow_incidence(n, k), n, k))
            d = np.array([p[1] for p in curve["points"]])
            assert abs(d.min() - expected) < 0.01, (k, curve["wavelength_nm"])


def test_edge_cases_and_json():
    for b in (0.0, 0.5, 0.995):
        for k in (1, 2):
            json.dumps(simulate_rainbow(impact_parameter=b, internal_reflections=k))
    # at b = 0 the ray goes straight in and out (retro-reflected for k = 1)
    res = simulate_rainbow(impact_parameter=0.0, internal_reflections=1, spectrum_samples=3)
    assert abs(res["droplet"][0]["deviation"] - 180.0) < 1e-9


def test_invalid_inputs():
    bad = [dict(n_d=1.0), dict(n_d=2.1), dict(n_d=float("nan")), dict(abbe_number=5),
           dict(abbe_number=500), dict(impact_parameter=-0.1), dict(impact_parameter=1.0),
           dict(internal_reflections=3), dict(internal_reflections=0),
           dict(spectrum_samples=2), dict(spectrum_samples=14), dict(spectrum_samples=4.5)]
    for override in bad:
        try:
            simulate_rainbow(**override)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
