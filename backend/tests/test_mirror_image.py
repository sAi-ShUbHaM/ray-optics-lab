"""
Numerical tests for backend/simulations/mirror_image.py

Run from the backend folder:
    python tests/test_mirror_image.py
(also works with:  pytest tests)
"""

import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.mirror_image import calculate_mirror_image  # noqa: E402

TOL = 1e-7


def distance_to_line(point, origin, direction):
    """Perpendicular distance from `point` to the infinite line."""
    d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)
    v = np.asarray(point, float) - np.asarray(origin, float)
    return abs(v[0] * d[1] - v[1] * d[0])


def test_textbook_example():
    r = calculate_mirror_image("concave", 10, 30, 5)
    assert abs(r["focal_length"] - -5) < TOL
    assert abs(r["signed_image_distance"] - -6) < TOL
    assert abs(r["image_height"] - -1) < TOL
    assert abs(r["magnification"] - -0.2) < TOL
    assert (r["image_type"], r["orientation"], r["size"]) == (
        "Real", "Inverted", "Diminished")
    assert r["image_position"] == "Between F and C"


def test_special_cases():
    r = calculate_mirror_image("concave", 10, 10, 5)      # object at C
    assert abs(r["magnification"] - -1) < TOL and r["image_position"] == "At C"

    r = calculate_mirror_image("concave", 10, 3, 5)       # inside F
    assert r["image_type"] == "Virtual" and r["orientation"] == "Upright"
    assert r["image_position"] == "Behind the mirror"

    r = calculate_mirror_image("convex", 10, 30, 5)
    assert r["image_type"] == "Virtual" and r["size"] == "Diminished"
    assert r["image_position"] == "Behind the mirror, between P and F"

    r = calculate_mirror_image("concave", 10, 5, 5)       # object at F
    assert r["image_at_infinity"] and r["image_point"] is None
    assert r["image_type"] == "At Infinity"


def test_invalid_inputs():
    for args in [("flat", 10, 10, 5), ("concave", 0, 10, 5),
                 ("concave", 10, -1, 5), ("concave", 10, 10, 0),
                 ("concave", float("nan"), 10, 5)]:
        try:
            calculate_mirror_image(*args)
        except ValueError:
            continue
        raise AssertionError(f"{args} should raise ValueError")


def test_principal_rays_hit_image_tip():
    radii = (4, 7, 10, 20)
    distances = (5.5, 8, 12, 25, 40, 60, 2, 3)
    heights = (1, 3, 5, 10)
    checked = 0

    for mt, R, d, h in itertools.product(
            ("concave", "convex"), radii, distances, heights):
        r = calculate_mirror_image(mt, R, d, h)
        if r["image_at_infinity"]:
            continue
        tip = np.array(r["image_point"])
        F = np.array(r["focus"])
        C = np.array(r["center"])
        O = np.array(r["object_point"])
        real = r["image_type"] == "Real"
        assert r["principal_rays"], (mt, R, d, h)

        for ray in r["principal_rays"]:
            H = np.array(ray["hit_point"])
            assert abs(H[0]) < TOL, "textbook rays reflect at plane x=0"
            assert np.allclose(ray["incident"][0], O)
            assert np.allclose(ray["incident"][1], H)
            assert np.allclose(ray["reflected"][0], H)

            direction = np.array(ray["reflected"][1]) - H
            assert distance_to_line(tip, H, direction) < 1e-6, (
                mt, R, d, h, ray["type"])

            ahead = np.dot(tip - H, direction)
            if real:
                assert ahead > 0 and ray["backward_extension"] is None
            else:
                assert ahead < 0 and ray["backward_extension"] is not None
                assert np.allclose(ray["backward_extension"][1], tip)

            if ray["type"] == "parallel":
                assert abs(H[1] - h) < TOL
                assert distance_to_line(F, H, direction) < 1e-6
            elif ray["type"] == "focal":
                u = direction / np.linalg.norm(direction)
                assert np.allclose(u, [-1, 0], atol=1e-9)
                assert abs(H[1] - tip[1]) < 1e-6
            elif ray["type"] == "pole":
                assert np.allclose(H, [0, 0])
                inc = np.array([0, 0]) - O
                inc = inc / np.linalg.norm(inc)
                out = direction / np.linalg.norm(direction)
                assert np.allclose(out, [-inc[0], inc[1]], atol=1e-9)
            elif ray["type"] == "centre":
                assert distance_to_line(C, O, H - O) < 1e-6
                assert distance_to_line(O, H, direction) < 1e-6
            checked += 1

    assert checked > 500


def test_object_at_focus_gives_parallel_reflected_rays():
    r = calculate_mirror_image("concave", 10, 5, 4)
    types = {ray["type"] for ray in r["principal_rays"]}
    assert "focal" not in types and {"parallel", "pole", "centre"} <= types
    dirs = []
    for ray in r["principal_rays"]:
        v = np.array(ray["reflected"][1]) - np.array(ray["reflected"][0])
        dirs.append(v / np.linalg.norm(v))
    for other in dirs[1:]:
        assert np.allclose(dirs[0], other, atol=1e-9)


def test_object_at_c_skips_degenerate_centre_ray():
    r = calculate_mirror_image("concave", 10, 10, 5)
    assert "centre" not in {ray["type"] for ray in r["principal_rays"]}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
