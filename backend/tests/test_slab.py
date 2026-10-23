"""
Numerical tests for backend/simulations/slab.py
(glass slab and apparent depth)

Run from the backend folder:
    python tests/test_slab.py
(also works with:  pytest tests)
"""

import itertools
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.slab import (  # noqa: E402
    simulate_apparent_depth,
    simulate_slab,
    trace_apparent_ray,
)


def direction_angle(p, q):
    v = np.array(q) - np.array(p)
    return np.degrees(np.arctan2(v[1], v[0]))


# ============================ glass slab ============================

def test_emergent_ray_is_parallel_and_displacement_matches_formula():
    checked = 0
    for theta, t, n in itertools.product((-60, -20, 5, 30, 55, 80), (1, 4, 10), (1.2, 1.5, 2.4)):
        res = simulate_slab(theta, t, n, ray_count=3)
        assert res["status"] == "Transmitted"
        for ray in res["rays"]:
            pts = ray["points"]
            incident = direction_angle(pts[0], pts[1])
            emergent = direction_angle(pts[-2], pts[-1])
            assert abs(incident - emergent) < 1e-9, (theta, t, n)
        assert abs(res["deviation"]) < 1e-9
        # d = t sin(theta1 - theta2) / cos(theta2), measured from the traced geometry
        assert abs(res["lateral_displacement"] - res["lateral_displacement_formula"]) < 1e-9
        checked += 1
    assert checked == 54


def test_normal_incidence_goes_straight_through():
    res = simulate_slab(0, 5, 1.5)
    assert abs(res["lateral_displacement"]) < 1e-12
    assert abs(res["theta2"]) < 1e-12
    assert abs(res["path_length"] - 5.0) < 1e-12
    assert abs(res["optical_path"] - 7.5) < 1e-12


def test_snell_law_at_entry_and_exit():
    res = simulate_slab(40, 6, 1.6, n_in=1.0)
    n = 1.6
    pts = [np.array(p) for p in res["rays"][1]["points"]]
    d0 = (pts[1] - pts[0]) / np.linalg.norm(pts[1] - pts[0])
    d1 = (pts[2] - pts[1]) / np.linalg.norm(pts[2] - pts[1])
    d2 = (pts[3] - pts[2]) / np.linalg.norm(pts[3] - pts[2])
    # the face normal is the x-axis, so sin(angle) = |d_y|
    assert abs(1.0 * abs(d0[1]) - n * abs(d1[1])) < 1e-12
    assert abs(n * abs(d1[1]) - 1.0 * abs(d2[1])) < 1e-12
    assert abs(res["theta2"] - np.degrees(np.arcsin(np.sin(np.radians(40)) / 1.6))) < 1e-12


def test_displacement_scales_with_thickness_and_angle():
    d1 = simulate_slab(40, 2, 1.5)["lateral_displacement"]
    d2 = simulate_slab(40, 4, 1.5)["lateral_displacement"]
    assert abs(d2 - 2 * d1) < 1e-12                         # linear in thickness
    small = simulate_slab(10, 4, 1.5)["lateral_displacement"]
    large = simulate_slab(70, 4, 1.5)["lateral_displacement"]
    assert large > small                                    # grows with the angle
    assert simulate_slab(30, 4, 2.0)["lateral_displacement"] > simulate_slab(30, 4, 1.2)["lateral_displacement"]


def test_symmetry_for_negative_angles():
    a = simulate_slab(35, 5, 1.5)
    b = simulate_slab(-35, 5, 1.5)
    assert abs(a["lateral_displacement"] - b["lateral_displacement"]) < 1e-12
    assert abs(a["theta2"] + b["theta2"]) < 1e-12


def test_total_internal_reflection_at_the_entry_face():
    # light going from glass (1.5) into a less dense slab (1.2)
    res = simulate_slab(60, 4, 1.2, n_in=1.5)
    assert abs(res["critical_angle_entry"] - np.degrees(np.arcsin(1.2 / 1.5))) < 1e-12
    assert res["status"] == "Reflected at the entry face"
    assert res["events"] == ["Total internal reflection at the entry face"]
    pts = res["rays"][1]["points"]
    incident, reflected = direction_angle(pts[0], pts[1]), direction_angle(pts[1], pts[2])
    # mirror reflection about the face: d_x flips, d_y is unchanged
    assert abs(np.cos(np.radians(reflected)) + np.cos(np.radians(incident))) < 1e-12
    assert abs(np.sin(np.radians(reflected)) - np.sin(np.radians(incident))) < 1e-12
    assert res["lateral_displacement"] is None
    # below the critical angle it transmits
    assert simulate_slab(30, 4, 1.2, n_in=1.5)["status"] == "Transmitted"


def test_different_media_on_each_side():
    # n_in sin(theta1) = n_out sin(theta3), whatever the slab is
    res = simulate_slab(30, 5, 1.5, n_in=1.0, n_out=1.33)
    pts = res["rays"][1]["points"]
    out_angle = np.radians(direction_angle(pts[-2], pts[-1]))
    assert abs(1.0 * np.sin(np.radians(30)) - 1.33 * np.sin(out_angle)) < 1e-12
    assert res["lateral_displacement"] is None             # not parallel any more
    assert abs(res["deviation"]) > 1.0


def test_total_internal_reflection_at_the_exit_face():
    # Water (1.33) -> glass (1.5) -> air (1.0). At theta1 = 60 degrees the ray
    # enters (1.33 sin 60 = 1.15 < 1.5) but cannot leave into air (1.15 > 1.0).
    res = simulate_slab(60, 4, 1.5, n_in=1.33, n_out=1.0)
    assert res["events"] == [
        "Refracted into the slab",
        "Total internal reflection at the right face",
        "Refracted out through the left face",
    ]
    assert res["status"] == "Reflected back out through the entry face"
    for ray in res["rays"]:
        pts = np.array(ray["points"])
        assert np.all(np.isfinite(pts))
        out = pts[-1] - pts[-2]
        inc = pts[1] - pts[0]
        assert out[0] < 0 < inc[0]                          # it comes back out of the left face
        # the Snell invariant n sin(theta) is conserved, so the angle in the
        # left medium equals the incident angle: the slab acts like a mirror
        assert abs(abs(out[1] / np.linalg.norm(out)) - abs(inc[1] / np.linalg.norm(inc))) < 1e-12


def test_a_ray_that_enters_a_plane_slab_can_never_stay_trapped():
    # n sin(theta) is the same in every layer, so a ray that got in can always get out.
    for theta, n_in, n_slab, n_out, t in itertools.product(
            (-80, -45, 10, 45, 80), (1.0, 1.33, 1.7), (1.2, 1.5, 2.4), (1.0, 1.5), (1, 8)):
        res = simulate_slab(theta, t, n_slab, n_in=n_in, n_out=n_out)
        assert res["status"] != "Trapped inside the slab", (theta, n_in, n_slab, n_out)
        assert len(res["events"]) <= 3


def test_paraxial_apparent_shift_through_the_slab():
    res = simulate_slab(0, 6, 1.5)
    assert abs(res["apparent_shift"] - 6 * (1 - 1 / 1.5)) < 1e-12
    assert abs(res["apparent_thickness"] - 4.0) < 1e-12
    # the same slab in water (n = 1.33) shifts less
    assert simulate_slab(0, 6, 1.5, n_in=1.33)["apparent_shift"] < res["apparent_shift"]


def test_beam_rays_are_parallel_translations():
    res = simulate_slab(25, 5, 1.5, ray_count=5)
    assert len(res["rays"]) == 5
    shifts = [np.array(r["points"][-1]) - np.array(res["rays"][2]["points"][-1]) for r in res["rays"]]
    for r, s in zip(res["rays"], shifts):
        assert abs(s[0]) < 1e-9                             # same x
        assert abs(s[1] - (r["entry_height"] - res["rays"][2]["entry_height"])) < 1e-9


def test_slab_invalid_inputs_and_json():
    bad = [dict(incident_angle=90), dict(incident_angle=float("nan")), dict(thickness=0),
           dict(thickness=100), dict(n_slab=0), dict(n_slab=-1), dict(n_in=0),
           dict(n_out=-2), dict(ray_count=0), dict(ray_count=8), dict(ray_count=2.5)]
    good = dict(incident_angle=30, thickness=5, n_slab=1.5)
    for override in bad:
        try:
            simulate_slab(**{**good, **override})
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")
    for theta, n_in, n_out in itertools.product((-85, 0, 85), (1.0, 1.5), (None, 1.0, 1.7)):
        json.dumps(simulate_slab(theta, 5, 1.4, n_in=n_in, n_out=n_out))


# ============================ apparent depth ============================

def test_paraxial_apparent_depth():
    res = simulate_apparent_depth(10, 1.33, 1.0, max_angle=30, ray_count=5)
    assert abs(res["paraxial_apparent_depth"] - 10 / 1.33) < 1e-12
    assert abs(res["ratio"] - 1 / 1.33) < 1e-12
    centre = res["rays"][2]
    assert abs(centre["angle_in"]) < 1e-12
    assert abs(centre["apparent_depth"] - 10 / 1.33) < 1e-12
    # a ray very close to the vertical gives the same number
    r = trace_apparent_ray(10, 1.33, 1.0, 0.1)
    assert abs(r["apparent_depth"] - 10 / 1.33) < 1e-4


def test_backward_extension_meets_the_vertical_at_the_formula_depth():
    for phi in (5, 15, 30, 45):
        r = trace_apparent_ray(10, 1.33, 1.0, phi)
        hit = np.array(r["points"][1])
        top = np.array(r["points"][2])
        direction = (top - hit) / np.linalg.norm(top - hit)
        s = -hit[0] / direction[0]                          # back to x = 0
        y_axis = (hit + s * direction)[1]
        assert abs(-y_axis - r["apparent_depth"]) < 1e-9, phi
        # formula h tan(phi_w) / tan(phi_a)
        phi_a = np.arcsin(1.33 * np.sin(np.radians(phi)))
        assert abs(r["apparent_depth"] - 10 * np.tan(np.radians(phi)) / np.tan(phi_a)) < 1e-9


def test_snell_law_at_the_surface():
    for phi in (10, 25, 40):
        r = trace_apparent_ray(8, 1.5, 1.0, phi)
        assert abs(1.5 * np.sin(np.radians(phi)) - 1.0 * np.sin(np.radians(r["angle_out"]))) < 1e-12


def test_apparent_depth_gets_shallower_for_oblique_viewing():
    depths = [trace_apparent_ray(10, 1.33, 1.0, p)["apparent_depth"] for p in (1, 15, 30, 45)]
    assert all(a > b for a, b in zip(depths, depths[1:]))
    assert depths[0] < 10                                    # always shallower than reality


def test_caustic_matches_numerical_intersection_of_neighbouring_rays():
    h, nb, na = 10.0, 1.33, 1.0
    for phi in (5, 15, 30, 42):
        r = trace_apparent_ray(h, nb, na, phi)
        x_c, y_c = r["caustic"]

        # closed form for the height
        phi_a = np.arcsin(nb * np.sin(np.radians(phi)) / na)
        assert abs(y_c - (-h * (na / nb) * np.cos(phi_a) ** 3 / np.cos(np.radians(phi)) ** 3)) < 1e-12

        # independent check: intersect the back-extended lines of two close rays
        eps = 1e-3
        lines = []
        for p in (phi - eps, phi + eps):
            q = trace_apparent_ray(h, nb, na, p)
            hit, top = np.array(q["points"][1]), np.array(q["points"][2])
            lines.append((hit, (top - hit) / np.linalg.norm(top - hit)))
        (p1, o1), (p2, o2) = lines
        t = np.linalg.solve(np.array([[o1[0], -o2[0]], [o1[1], -o2[1]]]), p2 - p1)
        numeric = p1 + t[0] * o1
        assert abs(numeric[0] - x_c) < 1e-3 and abs(numeric[1] - y_c) < 1e-3, phi
        # and the caustic lies on this ray's own back-extension
        hit = np.array(r["points"][1]); top = np.array(r["points"][2])
        u = (top - hit) / np.linalg.norm(top - hit)
        v = np.array([x_c, y_c]) - hit
        assert abs(v[0] * u[1] - v[1] * u[0]) < 1e-9
    # near the vertical the caustic collapses onto the paraxial point
    near = trace_apparent_ray(h, nb, na, 0.01)["caustic"]
    assert abs(near[0]) < 1e-6 and abs(near[1] + h * na / nb) < 1e-5


def test_total_internal_reflection_beyond_the_critical_angle():
    res = simulate_apparent_depth(10, 1.33, 1.0, max_angle=60, ray_count=9)
    assert abs(res["critical_angle"] - np.degrees(np.arcsin(1 / 1.33))) < 1e-12
    for ray in res["rays"]:
        assert ray["tir"] == (abs(ray["angle_in"]) > res["critical_angle"])
        if ray["tir"]:
            hit, end = np.array(ray["points"][1]), np.array(ray["points"][2])
            assert end[1] < 0                                # reflected back down
            assert ray["apparent_depth"] is None
    assert res["tir_ray_count"] == sum(1 for r in res["rays"] if r["tir"]) > 0


def test_reversed_media_object_in_the_less_dense_medium():
    # object in air viewed from water: it looks deeper, and TIR cannot happen
    res = simulate_apparent_depth(10, 1.0, 1.33, max_angle=70, ray_count=7)
    assert res["critical_angle"] is None and res["tir_ray_count"] == 0
    assert res["paraxial_apparent_depth"] > 10


def test_symmetry_and_edge_cases():
    res = simulate_apparent_depth(8, 1.5, 1.0, max_angle=35, ray_count=7)
    for left, right in zip(res["rays"], reversed(res["rays"])):
        assert abs(left["angle_in"] + right["angle_in"]) < 1e-9
        assert abs(left["apparent_depth"] - right["apparent_depth"]) < 1e-9
    assert len(simulate_apparent_depth(8, 1.5, ray_count=1)["rays"]) == 1
    assert res["widest_apparent_depth"] < res["paraxial_apparent_depth"]


def test_apparent_depth_invalid_inputs_and_json():
    good = dict(depth=10, n_below=1.33)
    bad = [dict(depth=0), dict(depth=100), dict(n_below=0), dict(n_below=-1), dict(n_above=0),
           dict(max_angle=2), dict(max_angle=85), dict(ray_count=0), dict(ray_count=16),
           dict(depth=float("nan"))]
    for override in bad:
        try:
            simulate_apparent_depth(**{**good, **override})
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")
    for nb, na in itertools.product((1.0, 1.33, 2.4), (1.0, 1.5)):
        json.dumps(simulate_apparent_depth(10, nb, na, max_angle=75, ray_count=9))


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
