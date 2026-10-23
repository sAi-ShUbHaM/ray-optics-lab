"""
Numerical tests for backend/simulations/lens_exact.py

The key idea: for rays very close to the axis, the exact ray tracer
(Snell's law at two spherical surfaces) must agree with the paraxial
thick-lens formulas. For rays far from the axis it must NOT, and that
difference is spherical aberration.

Run from the backend folder:
    python tests/test_lens_exact.py
(also works with:  pytest tests)
"""

import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.lens_exact import (  # noqa: E402
    Surface,
    paraxial_properties,
    simulate_exact_lens,
)

SHAPES = {
    "biconvex": (12.0, -12.0),
    "plano-convex (flat right)": (12.0, 0.0),
    "plano-convex (flat left)": (0.0, -12.0),
    "biconcave": (-12.0, 12.0),
    "plano-concave (flat right)": (-12.0, 0.0),
    "plano-concave (flat left)": (0.0, 12.0),
    "converging meniscus": (8.0, 20.0),
    "diverging meniscus": (-20.0, -8.0),
}


def test_lensmakers_formula():
    # thin lens: 1/f = (n-1)(1/R1 - 1/R2)
    p = paraxial_properties(1.5, 20.0, -20.0, 0.05)
    assert abs(p["focal_length"] - 20.0) < 0.01
    assert abs(p["focal_length_thin"] - 20.0) < 1e-9

    # plano-convex, R = 10, n = 1.5 -> f = 20
    p = paraxial_properties(1.5, 10.0, 0.0, 0.05)
    assert abs(p["focal_length_thin"] - 20.0) < 1e-9

    # known thick lens: n=1.5, R1=10, R2=-10, t=2 -> f = 10.3448, BFD = 9.6552
    p = paraxial_properties(1.5, 10.0, -10.0, 2.0)
    assert abs(p["focal_length"] - 10.344828) < 1e-5
    assert abs(p["back_focal_distance"] - 9.655172) < 1e-5

    # converging / diverging signs
    assert paraxial_properties(1.5, 12, -12, 1)["focal_length"] > 0
    assert paraxial_properties(1.5, -12, 12, 1)["focal_length"] < 0


def test_surface_geometry():
    s = Surface(-1.0, 10.0)            # centre of curvature on the right
    assert abs(s.x_at(0.0) - -1.0) < 1e-12
    assert s.x_at(5.0) > s.x_at(0.0)   # curves away to the right
    s = Surface(1.0, -10.0)            # centre on the left
    assert abs(s.x_at(0.0) - 1.0) < 1e-12
    assert s.x_at(5.0) < s.x_at(0.0)   # curves away to the left
    flat = Surface(0.5, 0.0)
    assert flat.x_at(3.0) == 0.5


def test_parallel_rays_near_axis_match_paraxial_focus():
    """Exact tracer == thick-lens formula for tiny ray heights."""
    checked = 0
    for (name, (r1, r2)), n, t in itertools.product(
            SHAPES.items(), (1.4, 1.5, 1.9), (0.3, 1.0, 3.0)):
        res = simulate_exact_lens(n, r1, r2, t, aperture=0.1,
                                  source="parallel", ray_count=5)
        f = res["focal_length"]
        n_ok = 0
        for ray in res["rays"]:
            if ray["status"] == "Leaves through the lens edge":
                # Genuine: in a thick diverging lens a ray entering inside
                # the aperture can spread beyond the rim before it exits.
                assert abs(ray["points"][2][1]) > res["aperture"], (name, n, t)
                continue
            assert ray["ok"], (name, n, t, ray["status"])
            n_ok += 1
            if abs(ray["entry_height"]) < 1e-9:
                assert ray["axis_crossing_x"] is None  # on-axis ray
                continue
            x_cross = ray["axis_crossing_x"]
            # relative error is O(h^2); h <= 0.09 here
            err = abs(x_cross - res["focus_2"][0])
            assert err < 2e-3 * max(abs(f), 1.0), (name, n, t, err)
            # converging lens focuses ahead of H2, diverging is virtual
            assert ray["crossing_ahead"] == (f > 0), (name, n, t)
            checked += 1
        assert n_ok >= 3, (name, n, t)
    assert checked > 100


def test_point_source_near_axis_matches_gaussian_image():
    for (r1, r2), d in itertools.product(
            [(12, -12), (12, 0), (0, -12), (8, 20)], (20, 35, 60)):
        res = simulate_exact_lens(1.5, r1, r2, 1.0, aperture=0.05,
                                  source="point", object_distance=d,
                                  ray_count=3)
        x_img = res["paraxial_image"][0]
        for ray in res["rays"]:
            if abs(ray["entry_height"]) < 1e-9:
                continue
            assert abs(ray["axis_crossing_x"] - x_img) < 2e-3 * abs(x_img), (
                r1, r2, d)


def test_spherical_aberration_marginal_rays_cross_early():
    res = simulate_exact_lens(1.5, 15.0, -15.0, 2.0, aperture=7.0,
                              source="parallel", ray_count=9)
    f2 = res["focus_2"][0]
    # Use the upper half of the beam only (the lower half mirrors it).
    crossings = {r["entry_height"]: r["axis_crossing_x"]
                 for r in res["rays"]
                 if r["axis_crossing_x"] is not None
                 and r["entry_height"] > 1e-9}
    heights = sorted(crossings)
    # each higher ray crosses closer to the lens than the one before it
    xs = [crossings[h] for h in heights]
    assert all(b < a for a, b in zip(xs, xs[1:])), xs
    assert res["longitudinal_aberration"] < -1.0       # marginal ray early
    assert xs[0] < f2 and res["blur_height"] > 0.5

    # shrinking the aperture shrinks the blur (towards the paraxial case)
    small = simulate_exact_lens(1.5, 15.0, -15.0, 2.0, aperture=1.5,
                                source="parallel", ray_count=9)
    assert small["blur_height"] < res["blur_height"] / 5


def test_curved_side_towards_beam_has_less_aberration():
    """Classic result: for a plano-convex lens focusing a distant source,
    the curved face should point at the source."""
    curved_first = simulate_exact_lens(1.5, 15.0, 0.0, 2.0, aperture=6.0,
                                       source="parallel", ray_count=9)
    flat_first = simulate_exact_lens(1.5, 0.0, -15.0, 2.0, aperture=6.0,
                                     source="parallel", ray_count=9)
    assert abs(curved_first["longitudinal_aberration"]) < abs(
        flat_first["longitudinal_aberration"])


def test_snell_law_at_both_surfaces():
    res = simulate_exact_lens(1.6, 14.0, -10.0, 2.5, aperture=6.0,
                              source="parallel", ray_count=7)
    n = 1.6
    s1 = Surface(-1.25, 14.0)
    s2 = Surface(1.25, -10.0)
    checked = 0
    for ray in res["rays"]:
        if not ray["ok"]:
            continue
        o, p1, p2, end = [np.array(p) for p in ray["points"]]
        d0 = (p1 - o) / np.linalg.norm(p1 - o)
        d1 = (p2 - p1) / np.linalg.norm(p2 - p1)
        d2 = (end - p2) / np.linalg.norm(end - p2)

        def sin_between(a, b):
            return abs(a[0] * b[1] - a[1] * b[0])    # |a x b|

        n1v = s1.normal_at(p1)
        n2v = s2.normal_at(p2)
        assert abs(1.0 * sin_between(d0, n1v) - n * sin_between(d1, n1v)) < 1e-9
        assert abs(n * sin_between(d1, n2v) - 1.0 * sin_between(d2, n2v)) < 1e-9
        # both hit points really lie on their spheres
        assert abs(np.hypot(p1[0] - s1.cx, p1[1]) - 14.0) < 1e-9
        assert abs(np.hypot(p2[0] - s2.cx, p2[1]) - 10.0) < 1e-9
        checked += 1
    assert checked >= 5


def test_flat_plate_has_no_power_and_displaces_rays():
    res = simulate_exact_lens(1.5, 0.0, 0.0, 2.0, aperture=5.0,
                              source="parallel", ray_count=5)
    assert res["focal_length"] is None and res["shape"].startswith("Flat")
    for ray in res["rays"]:       # parallel rays stay parallel and unmoved
        assert ray["ok"]
        assert abs(ray["exit_direction"][1]) < 1e-12
        assert abs(ray["points"][-1][1] - ray["entry_height"]) < 1e-9


def test_aperture_is_limited_when_geometry_requires_it():
    # tight radius: aperture cannot exceed the sphere radius
    res = simulate_exact_lens(1.5, 4.0, -4.0, 1.0, aperture=10.0)
    assert res["aperture_limited"] and res["aperture"] < 4.0
    # thin biconvex lens: the rim would pinch to zero thickness
    res = simulate_exact_lens(1.5, 10.0, -10.0, 0.3, aperture=8.0)
    assert res["aperture_limited"]
    assert all(r["ok"] for r in res["rays"])
    # a generous lens keeps the requested aperture
    res = simulate_exact_lens(1.5, 40.0, -40.0, 3.0, aperture=5.0)
    assert not res["aperture_limited"] and abs(res["aperture"] - 5.0) < 1e-9


def test_missing_rays_are_reported_not_dropped():
    # point source far above the axis: some rays miss the lens
    res = simulate_exact_lens(1.5, 12.0, -12.0, 2.0, aperture=4.0,
                              source="point", object_distance=10.0,
                              source_height=20.0, ray_count=9)
    assert len(res["rays"]) == 9
    statuses = {r["status"] for r in res["rays"]}
    assert "Misses the lens aperture" in statuses
    for r in res["rays"]:
        assert len(r["points"]) >= 2


def test_grid_never_crashes_and_always_returns_json_safe_data():
    import json
    for (r1, r2), n, t, src in itertools.product(
            list(SHAPES.values()), (1.2, 1.5, 2.4), (0.2, 4.0),
            ("parallel", "point")):
        res = simulate_exact_lens(n, r1, r2, t, aperture=6.0, source=src,
                                  object_distance=25.0, source_height=2.0,
                                  ray_count=7)
        json.dumps(res)
        assert res["valid"] and len(res["rays"]) == 7


def test_invalid_inputs():
    bad = [
        dict(n=0, r1=10, r2=-10, thickness=1, aperture=3),
        dict(n=-1.5, r1=10, r2=-10, thickness=1, aperture=3),
        dict(n=float("nan"), r1=10, r2=-10, thickness=1, aperture=3),
        dict(n=1.5, r1=10, r2=-10, thickness=0, aperture=3),
        dict(n=1.5, r1=10, r2=-10, thickness=1, aperture=0),
        dict(n=1.5, r1=float("inf"), r2=-10, thickness=1, aperture=3),
        dict(n=1.5, r1=10, r2=-10, thickness=1, aperture=3, ray_count=0),
        dict(n=1.5, r1=10, r2=-10, thickness=1, aperture=3, ray_count=2.5),
        dict(n=1.5, r1=10, r2=-10, thickness=1, aperture=3, source="laser"),
        dict(n=1.5, r1=10, r2=-10, thickness=4, aperture=3,
             source="point", object_distance=1.0),
    ]
    for kwargs in bad:
        try:
            simulate_exact_lens(**kwargs)
        except ValueError:
            continue
        raise AssertionError(f"{kwargs} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
