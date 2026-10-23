"""
Numerical tests for backend/simulations/optical_instruments.py

Run from the backend folder:
    python tests/test_optical_instruments.py
(also works with:  pytest tests)
"""

import itertools
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.optical_instruments import (  # noqa: E402
    simulate_microscope,
    simulate_telescope,
)

TOL = 1e-9


# ----------------------------- telescope -----------------------------

def test_keplerian_telescope_normal_adjustment():
    r = simulate_telescope("keplerian", 60, 6, 3, 4)
    assert abs(r["angular_magnification"] - -10.0) < TOL        # -f_o / f_e
    assert r["orientation"] == "Inverted"
    assert abs(r["separation"] - 66.0) < TOL                    # f_o + f_e
    assert r["final_image"]["at_infinity"] and r["normal_adjustment"]
    # intermediate image in the objective's focal plane, height f_o * tan(-theta)
    inter = r["intermediate_image"]
    assert abs(inter["x"] - 60.0) < 1e-9
    assert abs(inter["height"] - 60.0 * -np.tan(np.radians(3))) < 1e-9
    assert inter["kind"] == "Real object for eyepiece"


def test_galilean_telescope_is_upright():
    r = simulate_telescope("galilean", 60, 6, 3, 4)
    assert abs(r["angular_magnification"] - 10.0) < TOL         # +f_o / |f_e|
    assert r["orientation"] == "Upright"
    assert abs(r["separation"] - 54.0) < TOL                    # f_o - |f_e|
    assert r["final_image"]["at_infinity"]
    assert r["intermediate_image"]["kind"] == "Virtual object for eyepiece"
    assert r["exit_pupil"]["real"] is False                     # no real pupil


def test_afocal_exit_rays_are_parallel():
    for kind in ("keplerian", "galilean"):
        r = simulate_telescope(kind, 50, 5, 2, 3, ray_count=5)
        for bundle in ("axial", "off_axis"):
            slopes = [x["exit_slope"] for x in r["rays"] if x["bundle"] == bundle]
            assert max(slopes) - min(slopes) < 1e-12, (kind, bundle)
        axial = [x["exit_slope"] for x in r["rays"] if x["bundle"] == "axial"]
        assert abs(axial[0]) < 1e-12                            # on-axis beam stays on-axis


def test_exit_beam_width_equals_aperture_over_magnification():
    r = simulate_telescope("keplerian", 80, 8, 2, 5, ray_count=5)
    axial = [x["height_at_eyepiece"] for x in r["rays"] if x["bundle"] == "axial"]
    width = max(axial) - min(axial)
    expected = 2 * 5 / abs(r["angular_magnification"])
    assert abs(width - expected) < 1e-9
    assert abs(r["exit_pupil"]["diameter"] - expected) < 1e-9
    assert r["exit_pupil"]["real"] is True
    # eye relief for normal adjustment: f_e (f_o + f_e) / f_o
    assert abs(r["exit_pupil"]["distance_from_eyepiece"] - 8 * 88 / 80) < 1e-9


def test_exit_angle_is_magnification_times_entry_angle():
    r = simulate_telescope("keplerian", 100, 10, 1.0, 4)
    entry = -np.tan(np.radians(1.0))
    exit_slope = np.tan(np.radians(r["exit_angle"]))
    assert abs(exit_slope - r["angular_magnification"] * entry) < 1e-12


def test_defocus_moves_final_image_to_finite_distance():
    for kind, f_o, f_e, defocus in [("keplerian", 60, 6, -1.5), ("keplerian", 60, 6, 2.0),
                                    ("galilean", 60, 6, 1.0)]:
        r = simulate_telescope(kind, f_o, f_e, 2, 4, defocus=defocus)
        final = r["final_image"]
        assert not final["at_infinity"] and not r["normal_adjustment"]

        # independent check: lens equation, intermediate image is the object
        f_es = f_e if kind == "keplerian" else -f_e
        u = r["intermediate_image"]["x"] - r["separation"]       # signed object distance
        v = 1.0 / (1.0 / f_es + 1.0 / u)
        assert abs(final["x"] - (r["separation"] + v)) < 1e-6 * max(1, abs(v)), kind
        m = v / u
        assert abs(final["height"] - m * r["intermediate_image"]["height"]) < 1e-6


def test_virtual_extensions_only_when_image_is_virtual_and_finite():
    r = simulate_telescope("keplerian", 60, 6, 2, 4, defocus=-1.0)   # final image virtual
    assert r["final_image"]["kind"] == "Virtual"
    assert any(x["extensions"] for x in r["rays"] if x["bundle"] == "off_axis")
    r = simulate_telescope("keplerian", 60, 6, 2, 4)                  # at infinity
    assert not any(x["extensions"] for x in r["rays"])


def test_telescope_rays_are_json_safe_and_complete():
    for kind, n in itertools.product(("keplerian", "galilean"), (1, 3, 9)):
        r = simulate_telescope(kind, 40, 4, 5, 3, ray_count=n)
        json.dumps(r)
        assert len(r["rays"]) == 2 * n


def test_telescope_invalid_inputs():
    bad = [
        ("lens", 60, 6, 3, 4), ("keplerian", 0, 6, 3, 4), ("keplerian", 60, -6, 3, 4),
        ("keplerian", 60, 6, 0, 4), ("keplerian", 60, 6, 50, 4), ("keplerian", 60, 6, 3, 0),
        ("galilean", 5, 6, 3, 4),            # eyepiece longer than objective
        ("keplerian", 60, 6, float("nan"), 4),
    ]
    for args in bad:
        try:
            simulate_telescope(*args)
        except ValueError:
            continue
        raise AssertionError(f"{args} should raise ValueError")
    for kwargs in (dict(defocus=-100.0), dict(ray_count=0), dict(ray_count=2.5)):
        try:
            simulate_telescope("keplerian", 60, 6, 3, 4, **kwargs)
        except ValueError:
            continue
        raise AssertionError(f"{kwargs} should raise ValueError")


# ----------------------------- microscope -----------------------------

def test_microscope_final_image_at_infinity():
    r = simulate_microscope(1.0, 5.0, 1.1, 0.1, focus="infinity")
    ins = r["instrument"]
    assert abs(ins["intermediate_image_x"] - 11.0) < 1e-9
    assert abs(ins["objective_magnification"] - -10.0) < 1e-9
    assert abs(ins["eyepiece_magnification"] - 25.0 / 5.0) < TOL
    assert abs(ins["angular_magnification"] - 50.0) < 1e-9
    assert r["image_at_infinity"] and r["stages"][-1]["image_kind"] == "At infinity"
    # (L / f_o)(D / f_e) is EXACT when the final image is at infinity
    assert abs(ins["approx_magnification"] - ins["angular_magnification"]) < 1e-9
    assert abs(ins["tube_length"] - (ins["separation"] - 1.0 - 5.0)) < 1e-12


def test_microscope_final_image_at_near_point():
    r = simulate_microscope(1.0, 5.0, 1.1, 0.1, focus="near_point")
    ins = r["instrument"]
    assert abs(ins["eyepiece_magnification"] - (1 + 25.0 / 5.0)) < TOL
    assert abs(ins["angular_magnification"] - 60.0) < 1e-9
    last = r["stages"][-1]
    assert last["image_kind"] == "Virtual"
    assert abs(last["image_distance_signed"] - -25.0) < 1e-6    # image at D, in front of eyepiece
    # lateral magnification of the whole system equals the angular one here
    assert abs(abs(r["total_magnification"]) - 60.0) < 1e-6
    assert r["orientation"] == "Inverted"
    # the approximation is no longer exact at the near point
    assert abs(ins["approx_magnification"] - ins["angular_magnification"]) > 1.0


def test_microscope_matches_lens_system_stages():
    r = simulate_microscope(2.0, 10.0, 2.5, 0.2, focus="near_point", near_point=20.0)
    ins = r["instrument"]
    s1 = r["stages"][0]
    assert abs(s1["image_x"] - ins["intermediate_image_x"]) < 1e-9
    assert abs(s1["magnification"] - ins["objective_magnification"]) < 1e-9
    assert abs(r["stages"][-1]["image_distance_signed"] - -20.0) < 1e-6


def test_microscope_scales_with_objective_magnification():
    base = simulate_microscope(1.0, 5.0, 1.2, 0.1)["instrument"]["angular_magnification"]
    closer = simulate_microscope(1.0, 5.0, 1.1, 0.1)["instrument"]["angular_magnification"]
    assert closer > base                      # object nearer to F_o -> bigger m_o


def test_microscope_invalid_inputs():
    bad = [
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=0.9, object_height=0.1),
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=1.0, object_height=0.1),
        dict(objective_focal_length=0, eyepiece_focal_length=5, object_distance=2, object_height=0.1),
        dict(objective_focal_length=1, eyepiece_focal_length=-5, object_distance=2, object_height=0.1),
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=2, object_height=0),
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=2, object_height=0.1, focus="far"),
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=2, object_height=0.1, near_point=0),
        dict(objective_focal_length=1, eyepiece_focal_length=5, object_distance=float("nan"), object_height=0.1),
    ]
    for kwargs in bad:
        try:
            simulate_microscope(**kwargs)
        except ValueError:
            continue
        raise AssertionError(f"{kwargs} should raise ValueError")


def test_microscope_grid_is_json_safe():
    for f_o, f_e, focus in itertools.product((1, 3), (4, 10), ("infinity", "near_point")):
        json.dumps(simulate_microscope(f_o, f_e, f_o * 1.15, 0.2, focus=focus))


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
