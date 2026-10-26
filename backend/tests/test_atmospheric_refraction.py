"""
Numerical tests for backend/simulations/atmospheric_refraction.py
and backend/physics/air.py

The refraction integral is checked against an independent method (integrating
the Hamiltonian ray equation d(n t)/ds = grad n in Cartesian coordinates, which
uses neither the Snell invariant nor the tan z integral), against the
plane-parallel limit, and against scaling laws and the standard atmosphere.

Run from the backend folder:
    python tests/test_atmospheric_refraction.py
(also works with:  pytest tests)
"""

import json
import os
import sys
import time
import warnings

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from physics.air import refractivity, standard_refractivity  # noqa: E402
from simulations.atmospheric_refraction import (  # noqa: E402
    EARTH_RADIUS,
    SUN_DIAMETER_DEG,
    TOP_HEIGHT,
    Atmosphere,
    Integration,
    apparent_from_true,
    bennett_arcmin,
    refraction_deg,
    simulate_atmospheric_refraction,
)


def standard(**kw):
    base = dict(temperature_c=10.0, pressure_hpa=1010.0, lapse_rate=6.5,
                tropopause_km=11.0, observer_height_m=0.0)
    base.update(kw)
    return Atmosphere(**base)


# ------------------------------------------------------------ the air

def test_edlen_refractivity_of_air():
    # Edlen's formula at sodium D: n - 1 = 2.771e-4 at 15 C
    assert abs(float(standard_refractivity(0.5893)) - 2.7713e-4) < 0.002e-4
    # shorter wavelengths are refracted more
    assert float(standard_refractivity(0.4)) > float(standard_refractivity(0.7))
    # the density scaling: n - 1 is proportional to P / T
    base = float(refractivity(288.15, 101325.0))
    assert abs(float(refractivity(288.15, 50662.5)) / base - 0.5) < 1e-12
    assert abs(float(refractivity(273.15, 101325.0)) / base - 288.15 / 273.15) < 1e-12
    assert abs(float(refractivity(273.15, 101325.0)) - 2.9235e-4) < 0.002e-4     # 0 C: the familiar 1.000293


def test_standard_atmosphere_matches_the_isa_tables():
    atm = Atmosphere(15.0, 1013.25, 6.5, 11.0, 0.0)
    # International Standard Atmosphere values at the tropopause and at 20 km
    assert abs(float(atm.temperature(11000.0)) - 216.65) < 1e-9
    assert abs(float(atm.pressure(11000.0)) - 22632.0) / 22632.0 < 1e-3
    assert abs(float(atm.pressure(20000.0)) - 5475.0) / 5475.0 < 2e-3
    assert abs(float(atm.pressure(0.0)) - 101325.0) < 1e-6
    y = np.linspace(0.0, 120000.0, 500)
    assert np.all(np.diff(atm.pressure(y)) < 0.0)                  # pressure always falls


def test_isothermal_atmosphere_is_a_pure_exponential():
    atm = Atmosphere(15.0, 1013.25, 0.0, 11.0, 0.0)               # no lapse rate at all
    scale = 288.15 / 0.0341632                                     # R T / (g M) in metres
    for y in (0.0, 3000.0, 9000.0, 30000.0):
        assert abs(float(atm.pressure(y)) / 101325.0 - np.exp(-y / scale)) < 2e-4


def test_density_gradient_matches_finite_differences():
    atm = Atmosphere(15.0, 1013.25, 6.5, 11.0, 0.0)
    h = 1.0
    for y in (0.0, 500.0, 5000.0, 10900.0, 11100.0, 30000.0):      # both sides of the tropopause
        numeric = (np.log(atm.refractivity(y + h)) - np.log(atm.refractivity(y - h))) / (2 * h)
        assert abs(float(atm.dln_refractivity_dy(y)) - float(numeric)) < 1e-8 + 1e-6 * abs(float(numeric))


# ------------------------------------------- the refraction integral itself

def hamiltonian_ray_refraction(atm, altitude_deg):
    """Refraction (radians) found by integrating the ray equation d(n t)/ds = grad n
    outwards from the observer. Independent of the Snell invariant and of the
    tan z integral used by the module."""
    r0 = EARTH_RADIUS

    def n_and_grad(x):
        r = np.hypot(*x)
        y = r - r0
        n1 = float(atm.refractivity(y))
        return 1.0 + n1, n1 * float(atm.dln_refractivity_dy(y)) * x / r

    x = np.array([0.0, r0])
    h = np.radians(altitude_deg)
    t = np.array([np.cos(h), np.sin(h)])
    n0, _ = n_and_grad(x)
    p = n0 * t

    def rhs(x, p):
        n, g = n_and_grad(x)
        return p / n, g

    for _ in range(400000):
        y = np.hypot(*x) - r0
        if y >= TOP_HEIGHT:
            break
        ds = float(np.clip(0.01 * (y + 300.0), 20.0, 3000.0))
        k1x, k1p = rhs(x, p)
        k2x, k2p = rhs(x + 0.5 * ds * k1x, p + 0.5 * ds * k1p)
        k3x, k3p = rhs(x + 0.5 * ds * k2x, p + 0.5 * ds * k2p)
        k4x, k4p = rhs(x + ds * k3x, p + ds * k3p)
        x = x + ds / 6.0 * (k1x + 2 * k2x + 2 * k3x + k4x)
        p = p + ds / 6.0 * (k1p + 2 * k2p + 2 * k3p + k4p)
    t_end = p / np.linalg.norm(p)
    return h - np.arctan2(t_end[1], t_end[0])                      # apparent - true altitude


def test_integral_agrees_with_an_independent_ray_trace():
    atm = standard()
    integ = Integration(atm, 0.0, 120000)
    for altitude in (0.0, 5.0, 30.0):
        ray = np.degrees(hamiltonian_ray_refraction(atm, altitude)) * 3600.0
        quadrature = np.degrees(integ.refraction(altitude)) * 3600.0
        assert abs(ray - quadrature) < 0.05, (altitude, ray, quadrature)   # arcseconds


def test_result_does_not_depend_on_the_integration_grid():
    atm = standard()
    fine = Integration(atm, 0.0, 300000)
    for altitude in (0.0, 5.0, 45.0):
        for points in (20000, 40000):
            coarse = Integration(atm, 0.0, points)
            diff = abs(np.degrees(coarse.refraction(altitude) - fine.refraction(altitude))) * 3600.0
            assert diff < 0.05, (altitude, points, diff)


def test_plane_parallel_limit_and_the_zenith():
    atm = standard()
    integ = Integration(atm, 0.0, 60000)
    n0m1 = float(atm.refractivity(0.0))
    # no refraction at the zenith
    assert abs(integ.refraction(90.0)) < 1e-15
    # high in the sky R = (n0 - 1) tan z; Earth's curvature changes it by only ~0.2 %
    for altitude in (80.0, 60.0):
        z = np.radians(90.0 - altitude)
        assert abs(integ.refraction(altitude) / (n0m1 * np.tan(z)) - 1.0) < 0.005
    # lower down the tan approximation badly overestimates
    z = np.radians(90.0 - 10.0)
    assert integ.refraction(10.0) < 0.97 * n0m1 * np.tan(z)


def test_refraction_always_decreases_with_altitude_and_is_positive():
    integ = Integration(standard(), 0.0, 40000)
    values = [refraction_deg(integ, float(h)) for h in np.linspace(0.0, 90.0, 91)]
    assert all(v > 0 for v in values[:-1]) and abs(values[-1]) < 1e-12
    assert all(a > b for a, b in zip(values, values[1:]))


def test_horizon_refraction_exceeds_the_suns_diameter():
    r = simulate_atmospheric_refraction(temperature=10.0, pressure=1010.0)
    horizon = r["horizon_refraction_arcmin"]
    assert 30.0 < horizon < 40.0
    assert horizon > SUN_DIAMETER_DEG * 60.0        # more than the whole 32' disc


def test_comparison_with_bennett_formula():
    # Bennett's formula is an empirical fit; a model built on the refractivity of dry
    # air agrees to about 0.15' above 2 degrees and within 1' at the horizon.
    r = simulate_atmospheric_refraction()
    for point in r["curve"]:
        h = point["apparent_altitude"]
        diff = abs(point["refraction_arcmin"] - point["bennett_arcmin"])
        if h >= 2.0 and h < 90.0:
            assert diff < 0.15, (h, diff)
        elif h < 2.0:
            assert diff < 1.0, (h, diff)


def test_refraction_scales_with_the_conditions():
    base = simulate_atmospheric_refraction(apparent_altitude=45.0)
    cold = simulate_atmospheric_refraction(apparent_altitude=45.0, temperature=-20.0)
    low = simulate_atmospheric_refraction(apparent_altitude=45.0, pressure=800.0)

    rho = lambda t, p: p / (t + 273.15)
    # high in the sky R is proportional to the density at the observer
    assert abs(cold["selected"]["refraction_arcsec"] / base["selected"]["refraction_arcsec"]
               - rho(-20, 1010) / rho(10, 1010)) < 0.01
    assert abs(low["selected"]["refraction_arcsec"] / base["selected"]["refraction_arcsec"]
               - 800.0 / 1010.0) < 0.01

    # at the horizon the dependence on temperature is steeper, about P T^(-3/2),
    # because colder air also has a smaller scale height
    cold_h = simulate_atmospheric_refraction(temperature=-20.0)["horizon_refraction_arcmin"]
    base_h = base["horizon_refraction_arcmin"]
    predicted = (283.15 / 253.15) ** 1.5
    assert abs(cold_h / base_h - predicted) / predicted < 0.05
    assert cold_h / base_h > rho(-20, 1010) / rho(10, 1010)         # steeper than the density ratio


def test_higher_observers_see_less_refraction():
    values = []
    for height in (0.0, 1000.0, 3000.0, 8000.0):
        # keep the sea-level weather fixed: derive the conditions at the observer
        atm = Atmosphere(15.0, 1013.25, 6.5, 11.0, 0.0)
        T = float(atm.temperature(height)) - 273.15
        P = float(atm.pressure(height)) / 100.0
        r = simulate_atmospheric_refraction(temperature=T, pressure=P, observer_height=height)
        values.append(r["horizon_refraction_arcmin"])
    assert all(a > b for a, b in zip(values, values[1:])), values
    assert values[-1] < 0.8 * values[0]


def test_dispersion_blue_is_refracted_more_than_red():
    r = simulate_atmospheric_refraction(apparent_altitude=45.0)
    d = r["dispersion"]
    assert len(d) == 7
    arc = [x["refraction_arcmin"] for x in d]
    assert all(a > b for a, b in zip(arc, arc[1:]))                 # decreasing from 400 to 700 nm
    # high in the sky the ratio is that of the refractivities
    ratio = d[0]["refraction_arcmin"] / d[-1]["refraction_arcmin"]
    expected = float(standard_refractivity(0.4) / standard_refractivity(0.7))
    assert abs(ratio / expected - 1.0) < 0.01
    # at the horizon the blue-red split is a large fraction of an arcminute
    assert 0.3 < r["horizon_dispersion_arcmin"] < 1.5


# ------------------------------------------------------------- the Sun

def test_apparent_and_true_altitude_are_consistent():
    integ = Integration(standard(), 0.0, 40000)
    horizon = refraction_deg(integ, 0.0)
    for true in (-horizon + 0.01, -0.3, 0.0, 1.0, 10.0, 45.0):
        app = apparent_from_true(integ, true)
        assert app is not None
        assert abs(app - refraction_deg(integ, app) - true) < 1e-7, true
    assert apparent_from_true(integ, -horizon - 0.05) is None        # hidden below the horizon


def test_the_sun_is_flattened_at_the_horizon_but_not_high_up():
    low = simulate_atmospheric_refraction(sun_true_altitude=0.0)["sun"]
    assert low["upper_limb"]["apparent_altitude"] > low["lower_limb"]["apparent_altitude"]
    assert 0.8 < low["flattening"] < 0.93                            # about a sixth shorter
    high = simulate_atmospheric_refraction(sun_true_altitude=30.0)["sun"]
    assert 0.998 < high["flattening"] <= 1.0
    # the lower limb is lifted more than the upper limb
    lift_lower = low["lower_limb"]["apparent_altitude"] - low["lower_limb"]["true_altitude"]
    lift_upper = low["upper_limb"]["apparent_altitude"] - low["upper_limb"]["true_altitude"]
    assert lift_lower > lift_upper > 0.0
    # a Sun that is too low is only partly visible
    partly = simulate_atmospheric_refraction(sun_true_altitude=-0.5)["sun"]
    assert partly["lower_limb"]["apparent_altitude"] is None and partly["flattening"] is None


def test_sun_rows_describe_the_disc():
    sun = simulate_atmospheric_refraction(sun_true_altitude=1.0)["sun"]
    rows = sun["rows"]
    assert len(rows) == 41
    assert abs(rows[20]["half_width_deg"] - SUN_DIAMETER_DEG / 2.0) < 1e-9     # the widest row
    assert rows[0]["half_width_deg"] < 1e-6 and rows[-1]["half_width_deg"] < 1e-6
    apparent = [r["apparent_altitude"] for r in rows]
    assert all(a < b for a, b in zip(apparent, apparent[1:]))                   # order preserved
    # rows reproduce the two exact limbs
    assert abs(apparent[0] - sun["lower_limb"]["apparent_altitude"]) < 0.002
    assert abs(apparent[-1] - sun["upper_limb"]["apparent_altitude"]) < 0.002


def test_standard_sunset_and_the_delay():
    r = simulate_atmospheric_refraction(latitude=0.0)
    s = r["sun"]["sunset"]
    # almanacs use -50' (-0.833 deg) for the Sun's centre at sunrise and sunset
    assert abs(s["true_centre_altitude_at_apparent_sunset"] + 0.833) < 0.02
    assert abs(s["true_centre_altitude_at_apparent_sunset"]
               + (r["horizon_refraction_arcmin"] / 60.0 + SUN_DIAMETER_DEG / 2.0)) < 1e-12
    # at the equator at an equinox the Sun descends 15 degrees per hour, vertically
    assert abs(s["delay_minutes"] - (r["horizon_refraction_arcmin"] / 60.0) / 0.25) < 1e-9
    assert 2.0 < s["delay_minutes"] < 2.6
    at_60 = simulate_atmospheric_refraction(latitude=60.0)["sun"]["sunset"]
    assert abs(at_60["delay_minutes"] / s["delay_minutes"] - 2.0) < 1e-6      # 1 / cos 60
    assert abs(at_60["extra_daylight_minutes"] - 2.0 * at_60["delay_minutes"]) < 1e-12


def test_colour_fringes_of_the_upper_limb():
    sun = simulate_atmospheric_refraction(sun_true_altitude=0.0)["sun"]
    fr = sun["colour_fringes"]
    alt = [f["apparent_altitude"] for f in fr]
    assert all(a is not None for a in alt)
    assert all(a > b for a, b in zip(alt, alt[1:]))        # blue limb highest, red lowest
    spread = (alt[0] - alt[-1]) * 60.0                      # arcminutes
    assert 0.3 < spread < 1.5


# ---------------------------------------------------- the path and the bending

def test_ray_path_lies_on_the_ground_side_of_the_straight_line():
    r = simulate_atmospheric_refraction(apparent_altitude=10.0)
    pts = np.array(r["path"]["points"])
    line = np.array(r["path"]["straight_line"])
    assert pts[0, 0] == 0.0 or abs(pts[0, 0]) < 1e-3
    assert np.all(np.diff(pts[:, 1]) > 0) and np.all(np.diff(pts[:, 0]) > 0)
    assert abs(pts[-1, 1] - 60.0) < 0.05
    # the ray bends towards the ground, so it reaches each height farther along
    assert np.all(pts[1:, 0] >= line[1:, 0] - 1e-6)
    assert pts[-1, 0] > line[-1, 0]
    assert r["path"]["max_horizontal_deviation_m"] > 100.0
    # the final slopes of the two differ by the refraction
    dx_ray = pts[-1, 0] - pts[-6, 0]
    dx_line = line[-1, 0] - line[-6, 0]
    dy = pts[-1, 1] - pts[-6, 1]
    assert dx_ray > dx_line and dy > 0


def test_where_the_bending_happens():
    r = simulate_atmospheric_refraction(apparent_altitude=10.0)
    b = r["bending"]
    frac = np.array(b["fraction"])
    assert abs(frac[-1] - 1.0) < 1e-2 and np.all(np.diff(frac) >= -1e-12)
    cumulative = np.array(b["cumulative_arcmin"])
    assert abs(cumulative[-1] - r["selected"]["refraction_arcmin"]) < 1e-6
    assert 3.0 < b["half_height_km"] < 9.0                  # most of it in the lower troposphere
    assert b["half_height_km"] < b["p90_height_km"] < 25.0


def test_air_profile_arrays():
    r = simulate_atmospheric_refraction(temperature=15.0, pressure=1013.25)
    a = r["air"]
    assert len(a["heights_km"]) == 121 == len(a["relative_density"])
    assert a["relative_density"][0] == 1.0 or abs(a["relative_density"][0] - 1.0) < 1e-12
    assert all(x > y for x, y in zip(a["relative_density"], a["relative_density"][1:]))
    assert abs(a["tropopause_km_above_observer"] - 11.0) < 1e-12
    assert abs(a["refractivity_at_observer_e6"] - 277.13) < 0.2


# --------------------------------------------------------------- robustness

def test_extreme_settings_are_finite_and_warning_free():
    scenes = [
        dict(temperature=-50.0, pressure=300.0, lapse_rate=0.0, tropopause_height=18.0),
        dict(temperature=50.0, pressure=1100.0, lapse_rate=12.0, tropopause_height=6.0),
        dict(observer_height=9000.0, temperature=-40.0, pressure=310.0, tropopause_height=12.0),
        dict(apparent_altitude=0.0), dict(apparent_altitude=90.0),
        dict(sun_true_altitude=-3.0), dict(sun_true_altitude=85.0), dict(latitude=80.0),
        dict(resolution=5000), dict(lapse_rate=0.0),
    ]
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        for kwargs in scenes:
            start = time.time()
            r = simulate_atmospheric_refraction(**kwargs)
            json.dumps(r, allow_nan=False)
            assert time.time() - start < 6.0, kwargs


def test_typical_scene_is_fast_enough_for_sliders():
    start = time.time()
    simulate_atmospheric_refraction()
    assert time.time() - start < 2.0


def test_invalid_inputs():
    bad = [
        dict(apparent_altitude=-1.0), dict(apparent_altitude=91.0),
        dict(apparent_altitude=float("nan")),
        dict(temperature=-60.0), dict(temperature=60.0),
        dict(pressure=200.0), dict(pressure=1200.0),
        dict(lapse_rate=-1.0), dict(lapse_rate=20.0),
        dict(tropopause_height=3.0), dict(tropopause_height=25.0),
        dict(observer_height=-5.0), dict(observer_height=20000.0),
        dict(observer_height=10000.0, tropopause_height=10.0),
        dict(sun_true_altitude=-5.0), dict(sun_true_altitude=90.0),
        dict(latitude=-5.0), dict(latitude=90.0),
        dict(resolution=100),
        dict(temperature=-50.0, lapse_rate=12.0, tropopause_height=18.0),     # stratosphere below 170 K
    ]
    for override in bad:
        try:
            simulate_atmospheric_refraction(**override)
        except ValueError:
            continue
        raise AssertionError(f"{override} should raise ValueError")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")
