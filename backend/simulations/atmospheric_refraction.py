import numpy as np

from physics.air import refractivity, standard_refractivity
from simulations.prism import wavelength_to_hex


# ---------------------------------------------------------------------
# Atmospheric (astronomical) refraction
# ---------------------------------------------------------------------
# Light from the Sun or a star bends as it passes through the whole depth of
# the atmosphere. Because the air gets thinner with height the ray curves
# towards the ground, so every object appears HIGHER than it really is.
#
# Geometry: the air is spherically layered around the Earth's centre
# (radius R_E). For a ray at radius r where the index is n and the angle
# from the local vertical is z (the zenith distance), Snell's law is
#
#           n r sin(z) = constant = n0 r0 sin(z0)
#
# (index n0, radius r0 and apparent zenith distance z0 at the observer).
# The total bending of the ray between space (n = 1) and the observer is
#
#           R = integral of tan(z) d(ln n)     from n = 1 to n = n0
#
# and the true zenith distance of the object (where it would be without
# air) is  z_true = z0 + R.
#
# Notes
#   * R ~ (n0 - 1) tan(z0) near the zenith (a plane-parallel atmosphere).
#   * At the horizon R is about 35 arcminutes: slightly more than the Sun's
#     whole diameter (32'). The Sun you see just touching the horizon has
#     already set geometrically.
#   * The air model is the International Standard Atmosphere shape: the
#     temperature falls linearly with height up to the tropopause, then is
#     constant; the pressure follows from hydrostatic balance. Conditions
#     (temperature, pressure) are those AT THE OBSERVER.
#   * Dry air, no weather: humidity, inversions and turbulence are ignored.
# ---------------------------------------------------------------------

EARTH_RADIUS = 6371000.0          # m
TOP_HEIGHT = 120000.0             # m above the observer: nothing of note lies above
GRAVITY = 9.80665
MOLAR_MASS_AIR = 0.0289644
GAS_CONSTANT = 8.31446
G_M_OVER_R = GRAVITY * MOLAR_MASS_AIR / GAS_CONSTANT      # K per metre of height / T
SUN_DIAMETER_DEG = 0.5333          # mean angular diameter of the Sun
KELVIN = 273.15

WAVELENGTHS_NM = (400.0, 450.0, 500.0, 550.0, 600.0, 650.0, 700.0)


def _validate(name, value, low, high):
    value = float(value)
    if not np.isfinite(value) or not (low <= value <= high):
        raise ValueError(f"{name} must be between {low:g} and {high:g}.")
    return value


class Atmosphere:
    """Temperature and pressure above the observer (height y = 0 at the observer)."""

    def __init__(self, temperature_c, pressure_hpa, lapse_rate, tropopause_km,
                 observer_height_m):
        self.t0 = temperature_c + KELVIN
        self.p0 = pressure_hpa * 100.0
        self.gamma = lapse_rate / 1000.0                       # K per metre
        # tropopause given above sea level; measured here from the observer
        self.y_tropo = max(tropopause_km * 1000.0 - observer_height_m, 500.0)
        self.t_tropo = self.t0 - self.gamma * self.y_tropo

    def temperature(self, y):
        y = np.asarray(y, dtype=float)
        return np.where(y <= self.y_tropo, self.t0 - self.gamma * y, self.t_tropo)

    def pressure(self, y):
        y = np.asarray(y, dtype=float)
        yt = np.minimum(y, self.y_tropo)

        if self.gamma > 1e-12:
            p_low = self.p0 * (1.0 - self.gamma * yt / self.t0) ** (G_M_OVER_R / self.gamma)
            p_tropo = self.p0 * (1.0 - self.gamma * self.y_tropo / self.t0) ** (G_M_OVER_R / self.gamma)
        else:
            p_low = self.p0 * np.exp(-G_M_OVER_R * yt / self.t0)
            p_tropo = self.p0 * np.exp(-G_M_OVER_R * self.y_tropo / self.t0)

        scale = self.t_tropo / G_M_OVER_R                      # scale height of the isothermal layer
        p_high = p_tropo * np.exp(-(y - self.y_tropo) / scale)
        return np.where(y <= self.y_tropo, p_low, p_high)

    def dln_refractivity_dy(self, y):
        """d ln(n - 1) / dy: density falls with height (hydrostatic balance)
        and the temperature changes (so does the density)."""
        y = np.asarray(y, dtype=float)
        T = self.temperature(y)
        dlnT = np.where(y <= self.y_tropo, -self.gamma / T, 0.0)
        return -G_M_OVER_R / T - dlnT

    def refractivity(self, y, wavelength_um=0.5893):
        return refractivity(self.temperature(y), self.pressure(y), wavelength_um)


class Integration:
    """Precomputed height grid for the refraction integral.

    Heights are y = u^2 (u = sqrt of the height above the observer), which
    packs points close to the observer, where the integrand changes fastest
    and, for a horizontal line of sight, has an integrable singularity."""

    def __init__(self, atm, observer_height_m, points=60000):
        self.atm = atm
        self.r0 = EARTH_RADIUS + observer_height_m
        u_max = np.sqrt(TOP_HEIGHT)
        self.step = u_max / points
        u = (np.arange(points) + 0.5) * self.step               # midpoint rule
        self.u = u
        self.y = u ** 2
        self.r = self.r0 + self.y
        self.dlnn = atm.dln_refractivity_dy(self.y)             # d ln(n-1)/dy

    def _index(self, wavelength_um):
        n1 = self.atm.refractivity(self.y, wavelength_um)
        n1_obs = self.atm.refractivity(0.0, wavelength_um)
        return 1.0 + n1, 1.0 + float(n1_obs), n1

    def refraction(self, apparent_altitude_deg, wavelength_um=0.5893, want_path=False):
        """Total refraction (radians) for an object at the given apparent altitude."""
        z0 = np.radians(90.0 - apparent_altitude_deg)
        n, n0, n1 = self._index(wavelength_um)

        K = n0 * self.r0 * np.sin(z0)
        s = K / (n * self.r)
        cos2 = np.maximum(1.0 - s * s, 1e-30)
        tan_z = s / np.sqrt(cos2)

        # d(ln n)/dy = (n - 1) / n * d ln(n - 1)/dy   (negative: n falls with height)
        dlnn_dy = (n1 / n) * self.dlnn
        integrand = tan_z * (-dlnn_dy) * 2.0 * self.u           # dy = 2 u du
        R = float(np.sum(integrand) * self.step)

        if not want_path:
            return R

        # horizontal distance travelled along the ground (arc length at the observer)
        dx = tan_z * (self.r0 / self.r) * 2.0 * self.u * self.step
        cumulative_R = np.cumsum(integrand) * self.step
        return R, np.cumsum(dx), cumulative_R


# ---------------------------------------------------------------------
# Reference formula and helpers
# ---------------------------------------------------------------------

def bennett_arcmin(apparent_altitude_deg, temperature_c=10.0, pressure_hpa=1010.0):
    """Bennett's (1982) empirical formula for the refraction in arcminutes, with
    the usual correction for the actual pressure and temperature. It is a fit to
    observations of the real atmosphere, so it differs a little from a model
    built on the refractivity of dry air."""
    h = np.asarray(apparent_altitude_deg, dtype=float)
    r = 1.0 / np.tan(np.radians(h + 7.31 / (h + 4.4)))
    return r * (pressure_hpa / 1010.0) * (283.0 / (273.0 + temperature_c))


def refraction_deg(integration, apparent_altitude_deg, wavelength_um=0.5893):
    return float(np.degrees(integration.refraction(apparent_altitude_deg, wavelength_um)))


def apparent_from_true(integration, true_altitude_deg, wavelength_um=0.5893):
    """Apparent altitude of an object whose TRUE altitude is given, or None if
    the object is below the apparent horizon (refraction cannot lift it into view).

    Solves h_app = h_true + R(h_app) by fixed-point iteration; R changes slowly
    with altitude (|dR/dh| < 0.2), so it converges in a few steps."""
    horizon = refraction_deg(integration, 0.0, wavelength_um)
    if true_altitude_deg + horizon < 0.0:
        return None

    h = max(true_altitude_deg + horizon, 0.0)
    for _ in range(40):
        new = true_altitude_deg + refraction_deg(integration, min(max(h, 0.0), 90.0), wavelength_um)
        new = max(new, 0.0)
        if abs(new - h) < 1e-10:
            h = new
            break
        h = new
    return float(min(h, 90.0))


def _quantile_height(heights_km, fraction, level):
    return float(np.interp(level, fraction, heights_km))


# ---------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------

def simulate_atmospheric_refraction(
    apparent_altitude=10.0,
    temperature=10.0,
    pressure=1010.0,
    lapse_rate=6.5,
    tropopause_height=11.0,
    observer_height=0.0,
    sun_true_altitude=0.0,
    latitude=45.0,
    resolution=30000,
):
    h_app = _validate("Apparent altitude", apparent_altitude, 0.0, 90.0)
    t_c = _validate("Temperature", temperature, -50.0, 50.0)
    p_hpa = _validate("Pressure", pressure, 300.0, 1100.0)
    gamma = _validate("Lapse rate", lapse_rate, 0.0, 12.0)
    h_trop = _validate("Tropopause height", tropopause_height, 6.0, 18.0)
    h_obs = _validate("Observer height", observer_height, 0.0, 10000.0)
    sun_h = _validate("Sun's true altitude", sun_true_altitude, -3.0, 85.0)
    lat = _validate("Latitude", latitude, 0.0, 80.0)
    res = int(_validate("Resolution", resolution, 5000, 200000))

    if h_obs >= h_trop * 1000.0 - 500.0:
        raise ValueError("The observer must be at least 0.5 km below the tropopause.")

    atm = Atmosphere(t_c, p_hpa, gamma, h_trop, h_obs)
    if atm.t_tropo < 170.0:
        raise ValueError("These settings give an unphysically cold stratosphere (below 170 K).")

    integ = Integration(atm, h_obs, res)

    # ----- the selected object -----
    R_sel = refraction_deg(integ, h_app)
    selected = {
        "apparent_altitude": h_app,
        "true_altitude": h_app - R_sel,
        "refraction_arcmin": R_sel * 60.0,
        "refraction_arcsec": R_sel * 3600.0,
        "bennett_arcmin": float(bennett_arcmin(h_app, t_c, p_hpa)) if h_app < 90.0 else 0.0,
        "zenith_distance": 90.0 - h_app,
        # the plane-parallel approximation R = (n0 - 1) tan z, which overestimates at low altitude
        "tan_approximation_arcmin": float(
            np.degrees(float(atm.refractivity(0.0)) * np.tan(np.radians(90.0 - h_app))) * 60.0
        ) if h_app > 0.0 else None,
    }

    # ----- the refraction curve -----
    grid = np.unique(np.round(np.concatenate([
        np.arange(0.0, 10.0001, 0.2),
        np.arange(10.0, 90.0001, 4.0),
        [0.5, 1, 2, 3, 5, 10, 20, 30, 45, 60, 75, 90],
    ]), 6))
    R_curve = np.array([refraction_deg(integ, float(h)) for h in grid])
    curve = [
        {
            "apparent_altitude": float(h),
            "true_altitude": float(h - R),
            "refraction_arcmin": float(R * 60.0),
            "bennett_arcmin": float(bennett_arcmin(h, t_c, p_hpa)) if h < 90.0 else 0.0,
        }
        for h, R in zip(grid, R_curve)
    ]

    horizon_R = float(R_curve[0])

    # ----- the ray path through the atmosphere (to 60 km) -----
    R_rad, x_cum, cum_R = integ.refraction(h_app, want_path=True)
    y_m = integ.y
    keep = np.where(y_m <= 60000.0)[0]
    picks = keep[np.unique(np.linspace(0, len(keep) - 1, 220).round().astype(int))]

    x_km = x_cum[picks] / 1000.0
    y_km = y_m[picks] / 1000.0

    # the straight line along the apparent direction (a straight line in real space)
    ha = np.radians(h_app)
    r0 = integ.r0
    # distance t along the straight line that reaches the same height above the ground
    # r(t)^2 = r0^2 + 2 t r0 sin h + t^2 = (r0 + y)^2
    r_target = r0 + y_m[picks]
    t_line = -r0 * np.sin(ha) + np.sqrt((r0 * np.sin(ha)) ** 2 + r_target ** 2 - r0 ** 2)
    phi_line = np.arctan2(t_line * np.cos(ha), r0 + t_line * np.sin(ha))
    x_line_km = r0 * phi_line / 1000.0

    # deviation of the ray from the straight line, measured at equal height
    deviation_m = (x_km - x_line_km) * 1000.0               # horizontal offset at the same height
    # (the ray lies on the ground side of the line, so it reaches a given height farther away)
    max_dev_m = float(np.max(np.abs(deviation_m))) if len(deviation_m) else 0.0

    path = {
        "points": [[float(a), float(b)] for a, b in zip(x_km, y_km)],
        "straight_line": [[float(a), float(b)] for a, b in zip(x_line_km, y_km)],
        "max_horizontal_deviation_m": max_dev_m,
        "top_km": float(y_km[-1]) if len(y_km) else 0.0,
    }

    # ----- where the bending happens -----
    cum_total = float(cum_R[-1])
    heights_km = (y_m / 1000.0)
    sel = np.unique(np.linspace(0, len(heights_km) - 1, 260).round().astype(int))
    frac_all = cum_R / cum_total if cum_total > 0 else np.zeros_like(cum_R)
    bending = {
        "heights_km": [float(v) for v in heights_km[sel]],
        "cumulative_arcmin": [float(np.degrees(v) * 60.0) for v in cum_R[sel]],
        "fraction": [float(v) for v in frac_all[sel]],
        "half_height_km": _quantile_height(heights_km, frac_all, 0.5) if cum_total > 0 else None,
        "p90_height_km": _quantile_height(heights_km, frac_all, 0.9) if cum_total > 0 else None,
    }

    # ----- the air itself -----
    air_y = np.linspace(0.0, 60000.0, 121)
    T = atm.temperature(air_y)
    P = atm.pressure(air_y)
    density = (P / T) / (atm.p0 / atm.t0)
    air = {
        "heights_km": [float(v / 1000.0) for v in air_y],
        "temperature_c": [float(v - KELVIN) for v in T],
        "pressure_hpa": [float(v / 100.0) for v in P],
        "relative_density": [float(v) for v in density],
        "tropopause_km_above_observer": float(atm.y_tropo / 1000.0),
        "refractivity_at_observer_e6": float(atm.refractivity(0.0) * 1e6),
    }

    # ----- colours: the refraction depends on the wavelength -----
    R_589 = refraction_deg(integ, h_app)
    dispersion = []
    for lam in WAVELENGTHS_NM:
        R_l = refraction_deg(integ, h_app, lam / 1000.0)
        dispersion.append({
            "wavelength_nm": lam,
            "color": wavelength_to_hex(lam),
            "refraction_arcmin": float(R_l * 60.0),
            "offset_arcsec": float((R_l - R_589) * 3600.0),
            "refractivity_e6": float(
                float(refractivity(atm.t0, atm.p0, lam / 1000.0)) * 1e6),
        })

    R_h400 = refraction_deg(integ, 0.0, 0.4)
    R_h700 = refraction_deg(integ, 0.0, 0.7)

    # ----- the Sun -----
    half = SUN_DIAMETER_DEG / 2.0
    upper_true = sun_h + half
    lower_true = sun_h - half

    def limb(true_alt):
        app = apparent_from_true(integ, true_alt)
        return {"true_altitude": float(true_alt),
                "apparent_altitude": None if app is None else float(app)}

    upper, lower, centre = limb(upper_true), limb(lower_true), limb(sun_h)

    # the disc, row by row, for drawing: apparent altitude of each row of the true disc
    curve_true = grid - R_curve                  # increasing: h_true as a function of h_app
    rows = []
    for k in range(41):
        y_true = lower_true + (upper_true - lower_true) * k / 40.0
        half_width = float(np.sqrt(max(half ** 2 - (y_true - sun_h) ** 2, 0.0)))
        app = None if y_true < curve_true[0] else float(np.interp(y_true, curve_true, grid))
        rows.append({
            "true_altitude": float(y_true),
            "half_width_deg": half_width,
            "apparent_altitude": app,
        })

    vertical = None
    flattening = None
    if upper["apparent_altitude"] is not None and lower["apparent_altitude"] is not None:
        vertical = upper["apparent_altitude"] - lower["apparent_altitude"]
        flattening = vertical / SUN_DIAMETER_DEG

    # colour fringes: the apparent altitude of the Sun's upper limb in each colour
    fringes = []
    for lam in WAVELENGTHS_NM:
        app = apparent_from_true(integ, upper_true, lam / 1000.0)
        fringes.append({
            "wavelength_nm": lam,
            "color": wavelength_to_hex(lam),
            "apparent_altitude": None if app is None else float(app),
        })

    # standard sunrise / sunset: the upper limb just touches the apparent horizon
    centre_at_sunset = -(horizon_R + half)
    delay_minutes = horizon_R / (0.25 * np.cos(np.radians(lat)))      # equinox, 15 deg per hour

    sun = {
        "diameter_deg": SUN_DIAMETER_DEG,
        "true_centre_altitude": sun_h,
        "upper_limb": upper,
        "lower_limb": lower,
        "centre": centre,
        "apparent_vertical_diameter_deg": vertical,
        "flattening": flattening,
        "rows": rows,
        "colour_fringes": fringes,
        "sunset": {
            "refraction_at_horizon_arcmin": horizon_R * 60.0,
            "true_centre_altitude_at_apparent_sunset": float(centre_at_sunset),
            "delay_minutes": float(delay_minutes),
            "extra_daylight_minutes": float(2.0 * delay_minutes),
            "latitude": lat,
        },
    }

    return {
        "valid": True,
        "conditions": {
            "temperature_c": t_c,
            "pressure_hpa": p_hpa,
            "lapse_rate": gamma,
            "tropopause_height_km": h_trop,
            "observer_height_m": h_obs,
        },
        "selected": selected,
        "curve": curve,
        "horizon_refraction_arcmin": horizon_R * 60.0,
        "horizon_dispersion_arcmin": float((R_h400 - R_h700) * 60.0),
        "path": path,
        "bending": bending,
        "air": air,
        "dispersion": dispersion,
        "sun": sun,
        "integration_points": res,
    }
