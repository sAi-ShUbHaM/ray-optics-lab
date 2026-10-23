"""
Numerical tests for backend/simulations/lens_image.py

Run from the backend folder:
    python tests/test_lens_image.py
(also works with:  pytest tests)
"""

import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.lens_image import calculate_lens_image  # noqa: E402

TOL = 1e-7


def distance_to_line(point, origin, direction):
    d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)
    v = np.asarray(point, float) - np.asarray(origin, float)
    return abs(v[0] * d[1] - v[1] * d[0])


def test_textbook_convex_examples():
    # f = 10, u = 30  -> v = 15, m = -0.5 (real, inverted, diminished)
    r = calculate_lens_image("convex", 10, 30, 4)
    assert abs(r["signed_image_distance"] - 15) < TOL
    assert abs(r["magnification"] - -0.5) < TOL
    assert abs(r["image_height"] - -2) < TOL
    assert (r["image_type"], r["orientation"], r["size"]) == (
        "Real", "Inverted", "Diminished")
    assert r["image_position"] == "Between F and 2F"

    # object at 2F -> image at 2F, same size
    r = calculate_lens_image("convex", 10, 20, 4)
    assert abs(r["signed_image_distance"] - 20) < TOL
    assert r["size"] == "Same Size" and r["image_position"] == "At 2F"

    # object between F and 2F -> enlarged real image beyond 2F
    r = calculate_lens_image("convex", 10, 15, 4)
    assert abs(r["signed_image_distance"] - 30) < TOL
    assert r["size"] == "Enlarged" and r["image_position"] == "Beyond 2F"

    # object inside F -> virtual, upright, enlarged (magnifying glass)
    r = calculate_lens_image("convex", 10, 5, 4)
    assert abs(r["signed_image_distance"] - -10) < TOL
    assert (r["image_type"], r["orientation"], r["size"]) == (
        "Virtual", "Upright", "Enlarged")


def test_concave_lens_always_virtual_upright_diminished():
    for d in (2, 5, 10, 25, 60):
        r = calculate_lens_image("concave", 10, d, 4)
        assert r["focal_length"] == -10
        assert r["image_type"] == "Virtual"
        assert r["orientation"] == "Upright" and r["size"] == "Diminished"
        assert -10 < r["signed_image_distance"] < 0
    # f = -10, u = -30 -> v = -7.5
    r = calculate_lens_image("concave", 10, 30, 4)
    assert abs(r["signed_image_distance"] - -7.5) < TOL


def test_object_at_focus_gives_infinity():
    r = calculate_lens_image("convex", 10, 10, 4)
    assert r["image_at_infinity"] and r["image_point"] is None
    assert r["image_type"] == "At Infinity"
    types = {ray["type"] for ray in r["principal_rays"]}
    assert "focal" not in types and {"parallel", "central"} <= types
    dirs = []
    for ray in r["principal_rays"]:
        v = np.array(ray["refracted"][1]) - np.array(ray["refracted"][0])
        dirs.append(v / np.linalg.norm(v))
    assert np.allclose(dirs[0], dirs[1], atol=1e-9)


def test_invalid_inputs():
    for args in [("mirror", 10, 10, 5), ("convex", 0, 10, 5),
                 ("convex", 10, -1, 5), ("convex", 10, 10, 0),
                 ("convex", float("nan"), 10, 5),
                 ("concave", 10, float("inf"), 5)]:
        try:
            calculate_lens_image(*args)
        except ValueError:
            continue
        raise AssertionError(f"{args} should raise ValueError")


def test_principal_rays_pass_through_image_tip():
    checked = 0
    for lt, f, d, h in itertools.product(
            ("convex", "concave"), (3, 6, 10, 20),
            (1.5, 4, 7, 10, 15, 20, 30, 60), (1, 3, 5, 10)):
        r = calculate_lens_image(lt, f, d, h)
        if r["image_at_infinity"]:
            continue
        tip = np.array(r["image_point"])
        O = np.array(r["object_point"])
        F2 = np.array(r["focus_2"])
        real = r["image_type"] == "Real"
        assert r["principal_rays"], (lt, f, d, h)

        for ray in r["principal_rays"]:
            H = np.array(ray["hit_point"])
            assert abs(H[0]) < TOL, "thin-lens rays bend at x = 0"
            assert np.allclose(ray["incident"][0], O)
            assert np.allclose(ray["incident"][1], H)
            assert np.allclose(ray["refracted"][0], H)

            direction = np.array(ray["refracted"][1]) - H
            assert distance_to_line(tip, H, direction) < 1e-6, (
                lt, f, d, h, ray["type"])

            ahead = np.dot(tip - H, direction)
            if real:
                assert ahead > 0 and ray["backward_extension"] is None
            else:
                assert ahead < 0 and ray["backward_extension"] is not None
                assert np.allclose(ray["backward_extension"][1], tip)

            if ray["type"] == "parallel":
                assert abs(H[1] - h) < TOL
                assert distance_to_line(F2, H, direction) < 1e-6
            elif ray["type"] == "central":
                assert np.allclose(H, [0, 0])
                # undeviated: refracted direction == incident direction
                inc = np.array([0, 0]) - O
                inc = inc / np.linalg.norm(inc)
                out = direction / np.linalg.norm(direction)
                assert np.allclose(inc, out, atol=1e-9)
            elif ray["type"] == "focal":
                out = direction / np.linalg.norm(direction)
                assert np.allclose(out, [1, 0], atol=1e-9)
                assert abs(H[1] - tip[1]) < 1e-6
                F1 = np.array(r["focus_1"])
                assert distance_to_line(F1, O, H - O) < 1e-6
            checked += 1

    assert checked > 500


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
