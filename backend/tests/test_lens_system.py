"""
Numerical tests for backend/simulations/lens_system.py

The ray-based result is checked against an INDEPENDENT calculation:
the sequential thin-lens equation 1/v = 1/f + 1/u applied lens by lens.

Run from the backend folder:
    python tests/test_lens_system.py
(also works with:  pytest tests)
"""

import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.lens_system import simulate_lens_system  # noqa: E402

TOL = 1e-7


def convex(f):
    return {"lens_type": "convex", "focal_length": f}


def concave(f):
    return {"lens_type": "concave", "focal_length": f}


def sequential(fs, seps, d, h):
    """Independent lens-by-lens thin-lens calculation.
    Returns (image_x, image_height) of each stage, or None for infinity."""
    xs = [0.0]
    for s in seps:
        xs.append(xs[-1] + s)
    obj_x, obj_h = -d, h
    out = []
    for xk, fk in zip(xs, fs):
        u = obj_x - xk                      # negative = real object
        inv_v = 1.0 / fk + 1.0 / u
        if abs(inv_v) < 1e-12:
            return out + [None]
        v = 1.0 / inv_v
        m = v / u
        obj_x, obj_h = xk + v, m * obj_h
        out.append((obj_x, obj_h))
    return out


def test_two_lens_equivalent_focal_length_formula():
    # 1/f = 1/f1 + 1/f2 - s/(f1 f2)
    for f1, f2, s in [(10, 10, 5), (15, 20, 8), (10, -20, 4), (-10, 25, 3)]:
        kinds = [convex if x > 0 else concave for x in (f1, f2)]
        r = simulate_lens_system(
            [kinds[0](abs(f1)), kinds[1](abs(f2))], [s], 50, 3)
        expected_power = 1 / f1 + 1 / f2 - s / (f1 * f2)
        assert abs(r["system_power"] - expected_power) < 1e-12
        assert abs(r["system_focal_length"] - 1 / expected_power) < 1e-9


def test_lenses_in_contact_add_their_powers():
    r = simulate_lens_system([convex(20), convex(30)], [0.0], 60, 4)
    assert abs(r["system_power"] - (1 / 20 + 1 / 30)) < 1e-12
    assert abs(r["system_focal_length"] - 12.0) < 1e-9
    # a convex + equal concave pair in contact has no power
    r = simulate_lens_system([convex(15), concave(15)], [0.0], 40, 4)
    assert r["afocal"] and r["system_focal_length"] is None


def test_ray_images_match_sequential_thin_lens_equation():
    checked = 0
    fs_options = [(10, 10), (15, -20), (-12, 25), (8, 6)]
    for (f1, f2), sep, d, h in itertools.product(
            fs_options, (0.0, 4.0, 12.0, 30.0), (7, 15, 35, 60), (2, 5)):
        lens = [convex(abs(f)) if f > 0 else concave(abs(f)) for f in (f1, f2)]
        r = simulate_lens_system(lens, [sep], d, h)
        ref = sequential([f1, f2], [sep], d, h)
        for stage, expected in zip(r["stages"], ref):
            if expected is None:
                assert stage["image_at_infinity"]
                break
            assert not stage["image_at_infinity"]
            assert abs(stage["image_x"] - expected[0]) < 1e-6 * max(1, abs(expected[0])), (
                f1, f2, sep, d, h)
            assert abs(stage["image_height"] - expected[1]) < 1e-6 * max(1, abs(expected[1]))
            checked += 1
    assert checked > 100


def test_total_magnification_is_product_of_stage_magnifications():
    r = simulate_lens_system([convex(10), convex(15), convex(20)], [25, 30], 18, 3)
    ms = [s["magnification"] for s in r["stages"]]
    assert all(m is not None for m in ms)
    assert abs(r["total_magnification"] - np.prod(ms)) < 1e-9


def test_virtual_object_for_second_lens():
    # lens 1 would form its image BEHIND lens 2 -> lens 2 sees a virtual object
    r = simulate_lens_system([convex(10), convex(10)], [8.0], 20, 3)
    s1, s2 = r["stages"]
    assert abs(s1["image_x"] - 20.0) < 1e-9           # v1 = 20 > separation 8
    assert s2["object_kind"] == "Virtual object"
    assert s2["object_distance_signed"] > 0
    ref = sequential([10, 10], [8.0], 20, 3)
    assert abs(s2["image_x"] - ref[1][0]) < 1e-9


def test_intermediate_image_at_infinity():
    # object at the focal point of lens 1 -> parallel light between lenses
    r = simulate_lens_system([convex(10), convex(15)], [20.0], 10, 3)
    s1, s2 = r["stages"]
    assert s1["image_at_infinity"] and s2["object_kind"] == "At infinity"
    # final image sits in the back focal plane of lens 2, height -h f2/f1
    assert abs(s2["image_x"] - (20.0 + 15.0)) < 1e-9
    assert abs(s2["image_height"] - (-3 * 15 / 10)) < 1e-9


def test_afocal_system_has_no_power():
    r = simulate_lens_system([convex(20), convex(5)], [25.0], 80, 3)
    assert r["afocal"] and abs(r["system_power"]) < 1e-12
    assert r["back_focal_x"] is None


def test_back_focal_point_is_where_parallel_light_focuses():
    # With a very distant object, the image should sit at the back focal point.
    r = simulate_lens_system([convex(12), convex(9)], [6.0], 1e6, 1.0)
    fx = r["back_focal_x"]
    assert abs(r["stages"][-1]["image_x"] - fx) < 1e-3


def test_all_rays_pass_through_the_final_image_tip():
    for lenses, seps, d, h in [
        ([convex(10), convex(15)], [12.0], 30, 4),
        ([convex(10), concave(20)], [6.0], 25, 3),
        ([concave(15), convex(10)], [5.0], 20, 2),
        ([convex(10), convex(10), convex(10)], [15.0, 15.0], 25, 3),
    ]:
        r = simulate_lens_system(lenses, seps, d, h)
        if r["image_at_infinity"]:
            continue
        tip = np.array(r["image_point"])
        for ray in r["rays"]:
            (x1, y1), (x2, y2) = ray["points"][-2], ray["points"][-1]
            direction = np.array([x2 - x1, y2 - y1])
            direction /= np.linalg.norm(direction)
            v = tip - np.array([x1, y1])
            cross = abs(v[0] * direction[1] - v[1] * direction[0])
            assert cross < 1e-6, (ray["type"], cross)


def test_orientation_and_type_classification():
    # two convex lenses far apart: real, upright (two inversions).
    # Stage 1 image at x = 30; lens 2 at x = 45, so u2 = -15, v2 = 30.
    r = simulate_lens_system([convex(10), convex(10)], [45.0], 15, 3)
    assert r["image_type"] == "Real" and r["orientation"] == "Upright"
    assert abs(r["total_magnification"] - 4.0) < 1e-9
    # single-stage-like case: convex then weak concave -> inverted real
    r = simulate_lens_system([convex(10), concave(100)], [5.0], 30, 3)
    assert r["orientation"] == "Inverted"


def test_focal_ray_skipped_only_when_degenerate():
    r = simulate_lens_system([convex(10), convex(10)], [10.0], 10, 3)
    assert {x["type"] for x in r["rays"]} == {"parallel", "central"}
    r = simulate_lens_system([convex(10), convex(10)], [10.0], 25, 3)
    assert {x["type"] for x in r["rays"]} == {"parallel", "central", "focal"}


def test_json_safe_over_a_grid():
    import json
    kinds = [convex(8), concave(12), convex(20)]
    for combo in itertools.product(kinds, repeat=2):
        for sep, d in itertools.product((0, 5, 20), (4, 10, 40)):
            json.dumps(simulate_lens_system(list(combo), [sep], d, 2))


def test_invalid_inputs():
    good = [convex(10), convex(10)]
    bad = [
        dict(lenses=[convex(10)], separations=[], object_distance=20, object_height=3),
        dict(lenses=good, separations=[], object_distance=20, object_height=3),
        dict(lenses=good, separations=[5, 5], object_distance=20, object_height=3),
        dict(lenses=good, separations=[-1], object_distance=20, object_height=3),
        dict(lenses=good, separations=[5], object_distance=0, object_height=3),
        dict(lenses=good, separations=[5], object_distance=20, object_height=-1),
        dict(lenses=[convex(0), convex(10)], separations=[5], object_distance=20, object_height=3),
        dict(lenses=[{"lens_type": "mirror", "focal_length": 5}, convex(10)],
             separations=[5], object_distance=20, object_height=3),
        dict(lenses=good, separations=[float("nan")], object_distance=20, object_height=3),
        dict(lenses=[convex(10)] * 5, separations=[5] * 4, object_distance=20, object_height=3),
    ]
    for kwargs in bad:
        try:
            simulate_lens_system(**kwargs)
        except ValueError:
            continue
        raise AssertionError(f"{kwargs} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
