"""
Numerical tests for backend/simulations/mirage.py

The ray integrator is checked against an independent method (quadrature of
the Snell invariant), against exact geometry (straight rays, horizon dip,
Earth's curvature) and against the textbook structure of mirages.

Run from the backend folder:
    python tests/test_mirage.py
(also works with:  pytest tests)
"""

import json
import os
import sys
import time
import warnings

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simulations.mirage import (  # noqa: E402
    EARTH_RADIUS,
    Atmosphere,
    find_images,
    simulate_mirage,
    trace_rays,
)

UNIFORM = 1e15      # a pressure scale height so large that pressure does not change


def uniform_air(curvature=False):
    return Atmosphere(15.0, 15.0, 1.0, 0.0, 0.0, 50.0, 10.0, curvature, scale_height=UNIFORM)


# ---------------------------------------------------------------- the air

def test_refractive_index_of_air():
    atm = Atmosphere(15.0, 15.0, 1.0, 6.5, 0.0, 50.0, 10.0, False)
    n, _ = atm.refractive_index(np.array(0.0))
    assert abs((float(n) - 1.0) - 2.93e-4) < 0.03e-4                    # 15 C, sea level
    # warmer air is thinner: smaller n
    hot = Atmosphere(15.0, 55.0, 0.3, 0.0, 0.0, 50.0, 10.0, False)
    assert float(hot.refractive_index(np.array(0.0))[0]) < float(n)


def test_analytic_derivatives_match_finite_differences():
    atm = Atmosphere(18.0, 4.0, 12.0, 6.5, 9.0, 40.0, 8.0, True)
    h = 1e-5
    for y in (0.0, 3.0, 12.0, 39.0, 41.0, 120.0):
        y = np.array(y)
        for func, dfunc in ((lambda v: atm.temperature(v)[0], lambda v: atm.temperature(v)[1]),
                            (lambda v: atm.refractive_index(v)[0], lambda v: atm.refractive_index(v)[1]),
                            (lambda v: atm.modified_index(v)[0], lambda v: atm.modified_index(v)[1])):
            numeric = (func(y + h) - func(y - h)) / (2 * h)
            assert abs(float(dfunc(y)) - float(numeric)) < 1e-6 * max(1.0, abs(float(numeric))) + 1e-12


def test_inversion_terms_never_overflow():
    atm = Atmosphere(15.0, 15.0, 1.0, 6.5, 10.0, 25.0, 0.5, True)
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        for y in (0.0, 25.0, 1e3, 1e5):
            T, dT = atm.temperature(np.array(y))
            assert np.isfinite(T) and np.isfinite(dT)


# ------------------------------------------------------- straight lines etc.

def test_uniform_air_gives_straight_rays():
    atm = uniform_air()
    alphas = np.radians(np.linspace(-0.4, 0.8, 25))
    out = trace_rays(atm, 3.0, alphas, 2000.0, 400)
    expected = 3.0 + 2000.0 * np.tan(alphas)
    ok = ~out["blocked"]
    assert np.all(np.abs(out["y"][-1][ok] - expected[ok]) < 1e-9)
    assert np.all(out["blocked"] == (expected <= 0.0))


def test_uniform_air_gives_one_true_upright_image():
    r = simulate_mirage(observer_height=1.7, object_distance=1500, object_height=10,
                        air_temperature=20, surface_temperature=20, lapse_rate=0.0,
                        earth_curvature=False, pressure_scale_height=UNIFORM)
    assert r["pattern"] == "U" and len(r["images"]) == 1
    im = r["images"][0]
    assert im["orientation"] == "Upright" and not im["fold"]
    assert not im["bottom_cut"] and not im["top_cut"]
    assert abs(im["alpha_bottom_deg"] - r["geometric"]["bottom_deg"]) < 1e-3
    assert abs(im["alpha_top_deg"] - r["geometric"]["top_deg"]) < 1e-3
    assert abs(im["magnification"] - 1.0) < 1e-2
    assert abs(r["displacement_arcmin"]) < 0.1 and abs(r["displacement_straight_arcmin"]) < 0.1
    assert r["description"].startswith("Normal view")
    # without refraction the apparent image is exactly where the object is
    assert abs(im["apparent_bottom"] - 0.0) < 0.05 and abs(im["apparent_top"] - 10.0) < 0.05


def test_snell_invariant_is_conserved_along_every_ray():
    scenes = [
        Atmosphere(25.0, 65.0, 0.15, 6.5, 0.0, 25.0, 4.0, False),     # hot road
        Atmosphere(18.0, 6.0, 20.0, 6.5, 0.0, 25.0, 4.0, True),       # cold sea, Earth
        Atmosphere(15.0, 15.0, 1.0, 6.5, 10.0, 25.0, 4.0, True),      # inversion, Earth
    ]
    for atm in scenes:
        alphas = np.radians(np.linspace(-0.3, 0.4, 15))
        out = trace_rays(atm, 6.0, alphas, 6000.0, 3000, keep_theta=True)
        m, _ = atm.modified_index(out["y"])
        invariant = m * np.cos(out["theta"])
        for k in range(len(alphas)):
            if out["blocked"][k]:
                continue
            col = invariant[:, k]
            assert np.max(np.abs(col - col[0])) < 1e-9, k


def quadrature_height(atm, y0, alpha_deg, distance, y_max=40.0, n=600001, u_cut=1e-3):
    """Height reached at `distance`, computed from the invariant m cos(theta) = C
    by quadrature. It is a different method from the ODE integration."""
    m = lambda y: atm.modified_index(np.asarray(y, float))[0]
    dm = lambda y: atm.modified_index(np.asarray(y, float))[1]

    C = float(m(y0)) * np.cos(np.radians(alpha_deg))
    lo, hi = 0.0, y0
    for _ in range(200):                        # turning height: m(y_t) = C
        mid = 0.5 * (lo + hi)
        if m(mid) < C:
            lo = mid
        else:
            hi = mid
    yt = 0.5 * (lo + hi)
    f_turn = np.sqrt(2.0 * C / float(dm(yt)))   # limit of the integrand at the turning point

    def cumulative(y_top):
        u = np.linspace(0.0, np.sqrt(y_top - yt), n)          # y = y_t + u^2
        with np.errstate(divide="ignore", invalid="ignore"):
            f = 2.0 * u / np.sqrt((m(yt + u ** 2) / C) ** 2 - 1.0)
        f = np.where(u < u_cut, f_turn, f)                    # round-off guard near u = 0
        return np.concatenate([[0.0], np.cumsum(0.5 * (f[1:] + f[:-1]) * np.diff(u))]), u

    down, _ = cumulative(y0)
    up, u = cumulative(y_max)
    total = down[-1] + up
    k = np.searchsorted(total, distance)
    frac = (distance - total[k - 1]) / (total[k] - total[k - 1])
    return yt + (u[k - 1] + frac * (u[k] - u[k - 1])) ** 2


def test_integrator_agrees_with_independent_quadrature():
    atm = Atmosphere(25.0, 65.0, 0.15, 6.5, 0.0, 25.0, 4.0, False)
    for alpha in (-0.20, -0.25, -0.30, -0.36):
        independent = quadrature_height(atm, 1.7, alpha, 2500.0)
        ode = float(trace_rays(atm, 1.7, np.radians([alpha]), 2500.0, 2000)["y"][-1][0])
        assert abs(ode - independent) < 1e-6, (alpha, ode, independent)
        assert ode > 5.0            # these rays really did turn around and climb back out


def test_result_does_not_depend_on_the_step_count():
    atm = Atmosphere(15.0, 15.0, 1.0, 6.5, 10.0, 25.0, 4.0, True)
    alphas = np.radians(np.linspace(-0.2, 0.5, 400))
    coarse = trace_rays(atm, 8.0, alphas, 25000.0, 900)
    fine = trace_rays(atm, 8.0, alphas, 25000.0, 3600)
    ok = ~coarse["blocked"] & ~fine["blocked"]
    assert np.sum(ok) > 100
    assert np.max(np.abs(coarse["y"][-1][ok] - fine["y"][-1][ok])) < 1e-3
    assert np.array_equal(coarse["blocked"], fine["blocked"])


# ---------------------------------------------------------- Earth's curvature

def test_horizon_dip():
    y0, X = 5.0, 30000.0
    alphas = np.radians(np.linspace(-0.12, -0.03, 4001))
    out = trace_rays(uniform_air(True), y0, alphas, X, 3000)
    first_valid = np.degrees(alphas[np.where(~out["blocked"])[0][0]])
    dip = np.degrees(np.sqrt(2.0 * y0 / EARTH_RADIUS))
    assert abs(first_valid + dip) < 3e-5, (first_valid, -dip)


def test_earth_curves_away_by_x_squared_over_2r():
    X, y0 = 30000.0, 200.0
    flat = trace_rays(uniform_air(False), y0, np.array([0.0]), X, 1000)["y"][-1][0]
    curved = trace_rays(uniform_air(True), y0, np.array([0.0]), X, 1000)["y"][-1][0]
    expected = X ** 2 / (2.0 * EARTH_RADIUS)                       # about 70.6 m
    assert abs(flat - y0) < 1e-9
    assert abs((curved - flat) - expected) < 0.02 * expected


# ------------------------------------------------------------ the image finder

def test_find_images_splits_a_fold_into_two_images():
    alphas = np.linspace(-1.0, 1.0, 401)
    y = 2.0 + 6.0 * alphas ** 2                 # minimum of 2 at alpha = 0, inside [0, 10]
    images = find_images(alphas, y, np.ones(401, dtype=bool), 10.0, 1000.0)
    assert [im["orientation"] for im in images] == ["Inverted", "Upright"]
    for im in images:
        assert im["fold"] and abs(im["visible_from"] - 2.0) < 1e-9
    assert images[0]["alpha_end"] < images[1]["alpha_start"] + 1e-12   # they meet at the fold


def test_find_images_monotonic_image_is_refined_exactly():
    alphas = np.linspace(-1.0, 1.0, 201)
    y = 5.0 + 10.0 * alphas                     # lands on [0, 10] for alpha in [-0.5, 0.5]
    (im,) = find_images(alphas, y, np.ones(201, dtype=bool), 10.0, 1000.0)
    assert im["orientation"] == "Upright" and not im["fold"]
    assert abs(im["alpha_bottom"] + 0.5) < 1e-12 and abs(im["alpha_top"] - 0.5) < 1e-12
    assert not im["bottom_cut"] and not im["top_cut"]
    assert abs(im["magnification"] - (1.0 * 1000.0 / 10.0)) < 1e-9


def test_find_images_cut_only_when_the_ground_really_hides_part_of_the_object():
    alphas = np.linspace(-1.0, 1.0, 201)
    valid = alphas > -0.5
    # the lowest unblocked ray lands almost exactly at the object's base: not a cut
    grazing = np.where(valid, 0.05 + 8.0 * (alphas + 0.5), 0.0)
    (im,) = find_images(alphas, grazing, valid, 10.0, 1000.0)
    assert not im["bottom_cut"]
    # the lowest unblocked ray lands 4 m up the object: the lower part is hidden
    hidden = np.where(valid, 4.0 + 5.0 * (alphas + 0.5), 0.0)
    (im,) = find_images(alphas, hidden, valid, 10.0, 1000.0)
    assert im["bottom_cut"] and abs(im["visible_from"] - 4.0) < 0.1
    # nothing lands on the object
    assert find_images(alphas, np.full(201, 50.0), np.ones(201, dtype=bool), 10.0, 1000.0) == []


# ------------------------------------------------------------- real mirages

def test_apparent_heights_follow_the_curvature_of_the_earth():
    # with no refraction at all, a ship beyond the horizon is "seen" lower, by X^2 / 2R
    # relative to a flat-earth line of sight; the apparent heights must still equal the
    # true heights of the object, whatever the distance
    for X in (5000.0, 20000.0):
        r = simulate_mirage(observer_height=8.0, object_distance=X, object_height=60.0,
                            air_temperature=15.0, surface_temperature=15.0, lapse_rate=0.0,
                            pressure_scale_height=UNIFORM)
        visible = [im for im in r["images"] if im["orientation"] == "Upright"]
        assert visible, X
        im = visible[0]
        assert abs(im["apparent_top"] - 60.0) < 0.1, (X, im["apparent_top"])
        if not im["bottom_cut"]:
            assert abs(im["apparent_bottom"]) < 0.1


def test_hot_road_gives_an_inferior_mirage():
    r = simulate_mirage()                                        # the default scene
    assert r["pattern"] == "IU" and len(r["images"]) == 2
    inverted, upright = r["images"]
    assert inverted["orientation"] == "Inverted" and upright["orientation"] == "Upright"
    # the inverted image sits BELOW the upright one, joined at a fold
    assert inverted["alpha_top_deg"] < upright["alpha_bottom_deg"]
    assert inverted["fold"] and upright["fold"]
    assert inverted["visible_from"] > 0.0 and upright["visible_from"] > 0.0   # base hidden
    assert 0.8 < inverted["magnification"] < 1.6                  # a mirror-like reflection
    assert abs(r["displacement_arcmin"]) < 1.0                    # the real object stays put
    assert r["description"].startswith("Inferior mirage")

    # the same scene without the hot layer shows only the normal image
    plain = simulate_mirage(surface_temperature=25.0)
    assert plain["pattern"] == "U" and not plain["images"][0]["fold"]


def test_hotter_road_hides_more_of_the_object_but_the_reflection_stays_a_mirror():
    folds, criticals, magnifications = [], [], []
    for surface in (35.0, 45.0, 55.0, 65.0, 80.0, 90.0):
        r = simulate_mirage(surface_temperature=surface)
        inverted = [im for im in r["images"] if im["orientation"] == "Inverted"]
        upright = [im for im in r["images"] if im["orientation"] == "Upright"]
        assert len(inverted) == 1 and len(upright) == 1, surface
        folds.append(upright[0]["visible_from"])
        criticals.append(r["critical_angle_deg"])
        magnifications.append(inverted[0]["magnification"])

    # the fold (the height below which the object is hidden) rises with the temperature
    assert all(a < b for a, b in zip(folds, folds[1:])), folds
    # a stronger layer can turn steeper rays around
    assert all(a < b for a, b in zip(criticals, criticals[1:])), criticals
    # but the inverted image stays a faithful mirror image: magnification about 1
    assert all(0.9 < m < 1.2 for m in magnifications), magnifications


def test_ordinary_air_is_not_called_a_mirage():
    """A ship sinking below the horizon in ordinary air is the normal, unrefracted-looking
    view, not a mirage, even though ordinary air bends light by about an arcminute."""
    ship = dict(observer_height=8.0, object_height=25.0, air_temperature=15.0,
                surface_temperature=15.0)

    near = simulate_mirage(object_distance=20000, **ship)
    middle = simulate_mirage(object_distance=30000, **ship)
    far = simulate_mirage(object_distance=40000, **ship)

    assert len(near["images"]) == 1 and near["images"][0]["bottom_cut"]
    assert near["images"][0]["visible_fraction"] > middle["images"][0]["visible_fraction"]
    assert far["images"] == []

    for r in (near, middle):
        assert r["description"].startswith("Normal view, but part of the object is hidden")
        assert "mirage" not in r["description"].lower()
        assert abs(r["displacement_arcmin"]) < 0.5            # nothing beyond ordinary refraction
        assert r["ordinary_air_image_count"] == 1
    # ordinary refraction really does raise things a little compared with straight light
    assert near["displacement_straight_arcmin"] > near["displacement_arcmin"] - 1e-9
    assert far["description"].startswith("The object cannot be seen")


def test_superior_mirages_over_cold_water():
    ship = dict(observer_height=8.0, object_height=25.0, air_temperature=18.0,
                surface_temperature=6.0, layer_thickness=15.0)

    # beyond the ordinary horizon: refraction brings the ship into view
    far = simulate_mirage(object_distance=45000, **ship)
    assert far["ordinary_air_image_count"] == 0 and len(far["images"]) >= 1
    assert far["images"][0]["orientation"] == "Upright"
    assert far["displacement_arcmin"] is None                  # nothing to compare with
    assert far["description"].startswith("Brought into view by refraction (superior mirage)")

    # nearer: the ship is visible in ordinary air too, but the cold layer lifts the image
    near = dict(ship, layer_thickness=40.0)
    lifted = simulate_mirage(object_distance=30000, **near)
    assert lifted["ordinary_air_image_count"] == 1 and len(lifted["images"]) == 1
    assert lifted["displacement_arcmin"] > 5.0                 # raised well above ordinary air
    assert lifted["description"].startswith("One raised upright image (superior mirage)")

    # a warm layer does the opposite: the object is lowered or hidden compared with ordinary air
    warm = simulate_mirage(object_distance=20000, observer_height=8.0, object_height=25.0,
                           air_temperature=18.0, surface_temperature=40.0, layer_thickness=15.0)
    assert warm["displacement_arcmin"] is None or warm["displacement_arcmin"] <= 0.5


def test_temperature_inversion_gives_stacked_images():
    r = simulate_mirage(observer_height=8.0, object_distance=25000, object_height=25.0,
                        air_temperature=15.0, surface_temperature=15.0,
                        inversion_strength=10.0, inversion_height=25.0,
                        inversion_thickness=4.0)
    assert r["pattern"] == "UIU"
    orientations = [im["orientation"] for im in r["images"]]
    assert orientations == ["Upright", "Inverted", "Upright"]
    assert "Fata Morgana" in r["description"]
    # the images are ordered upwards in the sky
    tops = [im["alpha_top_deg"] for im in r["images"]]
    bottoms = [im["alpha_bottom_deg"] for im in r["images"]]
    assert bottoms[1] > bottoms[0] and tops[2] > tops[1]


# ----------------------------------------------------------------- the output

def test_ray_paths_are_consistent():
    r = simulate_mirage()
    y0, X, h = r["observer_height"], r["object_distance"], r["object_height"]
    spacing = (r["fan"]["max_deg"] - r["fan"]["min_deg"]) / (r["fan"]["samples"] - 1)

    assert len(r["rays"]) >= 21
    for ray in r["rays"]:
        pts = np.array(ray["points"])
        assert abs(pts[0, 0]) < 1e-9 and abs(pts[0, 1] - y0) < 1e-9
        assert np.all(pts[:, 1] >= -1e-9) and np.all(np.diff(pts[:, 0]) > 0)
        if ray["status"] == "Hits the ground":
            assert abs(pts[-1, 1]) < 1e-9 and pts[-1, 0] < X
            assert ray["height_at_object"] is None
        else:
            assert abs(pts[-1, 0] - X) < 1e-6
            expected = ("Passes above the object" if ray["height_at_object"] > h
                        else "Hits the object")
            assert ray["status"] == expected

    # every image has rays drawn along both of its edges
    edges = [ray["angle_deg"] for ray in r["rays"] if ray["role"] == "image edge"]
    for im in r["images"]:
        for key in ("alpha_start_deg", "alpha_end_deg"):
            assert min(abs(a - im[key]) for a in edges) < 1.5 * spacing


def test_geometry_and_profile_fields():
    r = simulate_mirage(observer_height=8.0, object_distance=25000, object_height=25.0)
    g = r["geometric"]
    drop = 25000.0 ** 2 / (2.0 * EARTH_RADIUS)
    assert abs(g["top_deg"] - np.degrees(np.arctan((25.0 - drop - 8.0) / 25000.0))) < 1e-9
    assert abs(g["bottom_deg"] - np.degrees(np.arctan((0.0 - drop - 8.0) / 25000.0))) < 1e-9
    assert abs(g["horizon_dip_deg"] + np.degrees(np.sqrt(2 * 8.0 / EARTH_RADIUS))) < 1e-9
    assert abs(g["horizon_distance_km"] - np.sqrt(2 * EARTH_RADIUS * 8.0) / 1000.0) < 1e-9

    p = simulate_mirage()["profile"]                      # hot road
    n = len(p["heights"])
    assert n == 240 == len(p["temperature_c"]) == len(p["n_minus_1_e6"]) == len(p["dn_dy_e7"])
    assert p["temperature_c"][0] > p["temperature_c"][-1]           # hottest at the ground
    assert p["n_minus_1_e6"][0] < p["n_minus_1_e6"][-1]             # thinner air near the ground
    assert p["dn_dy_e7"][0] > 0                                     # n rises with height: rays bend up
    assert abs(p["ducting_threshold_e7"] + 1e7 / EARTH_RADIUS) < 1e-12

    cold = simulate_mirage(air_temperature=18.0, surface_temperature=6.0, layer_thickness=20.0,
                           observer_height=8.0, object_distance=30000, object_height=25.0)["profile"]
    assert cold["dn_dy_e7"][0] < 0                                  # n falls with height: rays bend down


def test_outputs_are_finite_for_extreme_settings_without_warnings():
    scenes = [
        dict(observer_height=0.2, object_distance=50, object_height=0.5),
        dict(observer_height=300, object_distance=150000, object_height=1000,
             air_temperature=-30, surface_temperature=-40),
        dict(layer_thickness=0.02, surface_temperature=90),
        dict(layer_thickness=300, surface_temperature=-40, air_temperature=40),
        dict(inversion_strength=30, inversion_thickness=0.5, inversion_height=2),
        dict(lapse_rate=-10, observer_height=50, object_distance=60000),
        dict(earth_curvature=False, object_distance=140000),
        dict(ray_count=5), dict(ray_count=41), dict(fan_scale=0.25), dict(fan_scale=4.0),
    ]
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        for kwargs in scenes:
            start = time.time()
            r = simulate_mirage(**kwargs)
            json.dumps(r, allow_nan=False)
            assert time.time() - start < 15.0, kwargs


def test_typical_scenes_are_fast_enough_for_sliders():
    for kwargs in (dict(),
                   dict(observer_height=8, object_distance=25000, object_height=25,
                        air_temperature=15, surface_temperature=15, inversion_strength=10),
                   dict(observer_height=8, object_distance=30000, object_height=25,
                        air_temperature=18, surface_temperature=6, layer_thickness=40)):
        start = time.time()
        simulate_mirage(**kwargs)
        assert time.time() - start < 3.0, kwargs


def test_invalid_inputs():
    bad = [
        dict(observer_height=0.1), dict(observer_height=500), dict(observer_height=float("nan")),
        dict(object_distance=10), dict(object_distance=200000), dict(object_height=0.1),
        dict(air_temperature=-60), dict(air_temperature=60), dict(surface_temperature=120),
        dict(layer_thickness=0.001), dict(layer_thickness=500), dict(lapse_rate=50),
        dict(inversion_strength=-1), dict(inversion_strength=40), dict(inversion_height=1.0),
        dict(inversion_thickness=0.1), dict(fan_scale=0.1), dict(fan_scale=9),
        dict(ray_count=4), dict(ray_count=42), dict(ray_count=10.5),
        dict(pressure_scale_height=10.0),
    ]
    for override in bad:
        try:
            simulate_mirage(**override)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
