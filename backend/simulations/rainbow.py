import numpy as np

from physics.refraction import refract
from simulations.prism import (
    cauchy_coefficients,
    refractive_index,
    wavelength_to_hex,
)


# ---------------------------------------------------------------------
# Rainbows: light inside a spherical drop (unit radius)
# ---------------------------------------------------------------------
#   * Sunlight travels along +x. A ray at height b (the impact parameter,
#     b = sin i for a unit drop) hits the drop at incidence angle i.
#   * It refracts into the drop:        sin i = n sin r
#   * It is reflected k times inside   (k = 1 primary bow, k = 2 secondary)
#   * It refracts out again.
#
#   Total deviation (the angle the ray is turned through, clockwise):
#         D = k*180 + 2 i - 2 (k + 1) r
#   Angle from the anti-solar point (the direction you look to see a bow):
#         theta = | 180 - (D mod 360) |
#
#   A bow forms where D is stationary (dD/di = 0), because many rays then
#   leave in nearly the same direction (a caustic):
#         cos^2 i = (n^2 - 1) / (k (k + 2))
#   Water (n = 1.333): primary D_min = 138 deg -> bow at 42 deg,
#                      secondary at 51 deg, on the other side of the dark
#                      band between them (Alexander's dark band).
#
#   Dispersion makes n depend on wavelength (Cauchy fit, as in the prism
#   module), so each colour has its own bow angle. Red is on the OUTSIDE of
#   the primary bow and on the INSIDE of the secondary bow.
#
#   Brightness uses Fresnel reflectance for unpolarised light: a ray that is
#   reflected k times carries a weight (1 - R)^2 R^k, so the secondary bow
#   is fainter than the primary. This is geometric optics only: it does not
#   include the supernumerary bows that wave optics (Airy theory) predicts.
# ---------------------------------------------------------------------

LAMBDAS_DEFAULT = (400.0, 700.0)
START_X = -2.6
EXIT_LENGTH = 2.4


def _pt(p):
    return [float(p[0]), float(p[1])]


def _wrap_theta(deviation_deg):
    """Angle from the anti-solar point, in [0, 180]."""
    return np.abs(((180.0 - deviation_deg) + 180.0) % 360.0 - 180.0)


# ---------------------------------------------------------------------
# Closed-form helpers (work on numbers or numpy arrays)
# ---------------------------------------------------------------------

def refraction_angle(i_rad, n):
    return np.arcsin(np.sin(i_rad) / n)


def deviation_deg(i_rad, n, k):
    """Total deviation D (degrees, not wrapped)."""
    r = refraction_angle(i_rad, n)
    return np.degrees(k * np.pi + 2.0 * i_rad - 2.0 * (k + 1) * r)


def rainbow_incidence(n, k):
    """Incidence angle (radians) at the stationary deviation, or None."""
    c2 = (n * n - 1.0) / (k * (k + 2.0))
    if not (0.0 < c2 < 1.0):
        return None
    return float(np.arccos(np.sqrt(c2)))


def fresnel_reflectance(i_rad, n):
    """Unpolarised Fresnel reflectance for light entering index n from air.
    The same value applies to the internal reflection at the matching angle."""
    sin_r = np.sin(i_rad) / n
    r = np.arcsin(np.clip(sin_r, -1.0, 1.0))
    cos_i, cos_r = np.cos(i_rad), np.cos(r)

    with np.errstate(divide="ignore", invalid="ignore"):
        rs = ((cos_i - n * cos_r) / (cos_i + n * cos_r)) ** 2
        rp = ((n * cos_i - cos_r) / (n * cos_i + cos_r)) ** 2

    return 0.5 * (rs + rp)


def ray_weight(i_rad, n, k):
    """Fraction of the light that follows the path with k internal reflections."""
    R = fresnel_reflectance(i_rad, n)
    return (1.0 - R) ** 2 * R ** k


# ---------------------------------------------------------------------
# Vector ray trace through the drop
# ---------------------------------------------------------------------

def trace_drop(b, n, k):
    """Exact path of one ray: refract in, reflect k times, refract out."""
    d = np.array([1.0, 0.0])
    start = np.array([START_X, b])
    q = np.array([-np.sqrt(1.0 - b * b), b])          # first hit on the unit circle

    points = [start, q.copy()]

    entered = refract(d, q, 1.0, n)
    if entered is None:                                # cannot happen for n >= 1
        raise ValueError("The ray cannot enter the drop.")
    d = entered / np.linalg.norm(entered)

    for _ in range(k):
        t = -2.0 * np.dot(q, d)                        # chord length (|q| = 1)
        q = q + t * d
        points.append(q.copy())
        d = d - 2.0 * np.dot(d, q) * q                 # reflect at the inner surface
        d = d / np.linalg.norm(d)

    t = -2.0 * np.dot(q, d)
    q = q + t * d
    points.append(q.copy())

    leaving = refract(d, q, n, 1.0)
    if leaving is None:                                # inside angle <= critical angle
        raise ValueError("The ray cannot leave the drop (total internal reflection).")
    d_out = leaving / np.linalg.norm(leaving)

    points.append(q + d_out * EXIT_LENGTH)

    dev = float((0.0 - np.degrees(np.arctan2(d_out[1], d_out[0]))) % 360.0)
    return {"points": points, "deviation": dev, "direction": d_out}


# ---------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------

def simulate_rainbow(
    n_d=1.333,
    abbe_number=55.8,
    impact_parameter=0.86,
    internal_reflections=1,
    spectrum_samples=7,
):
    n_d = float(n_d)
    abbe_number = float(abbe_number)
    b = float(impact_parameter)

    if not np.isfinite(n_d) or not (1.05 <= n_d <= 1.95):
        raise ValueError("n_d must be between 1.05 and 1.95 (a rainbow needs n < 2).")
    if not np.isfinite(abbe_number) or not (10.0 <= abbe_number <= 200.0):
        raise ValueError("Abbe number must be between 10 and 200.")
    if not np.isfinite(b) or not (0.0 <= b <= 0.995):
        raise ValueError("Impact parameter must be between 0 and 0.995.")
    if int(internal_reflections) != internal_reflections or int(internal_reflections) not in (1, 2):
        raise ValueError("internal_reflections must be 1 (primary) or 2 (secondary).")
    k = int(internal_reflections)
    if int(spectrum_samples) != spectrum_samples or not (3 <= int(spectrum_samples) <= 13):
        raise ValueError("spectrum_samples must be a whole number from 3 to 13.")
    spectrum_samples = int(spectrum_samples)

    c0, c1 = cauchy_coefficients(n_d, abbe_number)
    wavelengths = list(np.linspace(LAMBDAS_DEFAULT[0], LAMBDAS_DEFAULT[1], spectrum_samples))

    i_sel = float(np.arcsin(b))

    # --- the chosen ray, one path per colour ---
    droplet = []
    for lam in wavelengths:
        n = refractive_index(lam, c0, c1)
        tr = trace_drop(b, n, k)
        droplet.append({
            "wavelength_nm": float(lam),
            "color": wavelength_to_hex(lam),
            "n": float(n),
            "refraction_angle": float(np.degrees(refraction_angle(i_sel, n))),
            "points": [_pt(p) for p in tr["points"]],
            "deviation": tr["deviation"],
            "angle_from_antisolar": float(_wrap_theta(tr["deviation"])),
            "weight": float(ray_weight(i_sel, n, k)),
        })

    # --- bow angles for both orders, every colour ---
    bows = {}
    for order, name in ((1, "primary"), (2, "secondary")):
        rows = []
        for lam in wavelengths:
            n = refractive_index(lam, c0, c1)
            i_min = rainbow_incidence(n, order)
            if i_min is None:
                continue
            d_min = float(deviation_deg(i_min, n, order))
            rows.append({
                "wavelength_nm": float(lam),
                "color": wavelength_to_hex(lam),
                "n": float(n),
                "incidence_angle": float(np.degrees(i_min)),
                "impact_parameter": float(np.sin(i_min)),
                "deviation": d_min,
                "angle": float(_wrap_theta(d_min % 360.0)),
                "weight": float(ray_weight(i_min, n, order)),
            })
        bows[name] = rows

    primary, secondary = bows["primary"], bows["secondary"]

    # Alexander's dark band lies between the bows. It exists only when the
    # primary bow is inside the secondary one (true for water); for a
    # low-index liquid the secondary bow falls inside the primary, the two
    # regions overlap, and there is no dark band.
    alexander = None
    if primary and secondary:
        outer_primary = max(r["angle"] for r in primary)
        inner_secondary = min(r["angle"] for r in secondary)
        if outer_primary < inner_secondary:
            alexander = [float(outer_primary), float(inner_secondary)]

    # --- deviation versus impact parameter (for the graph) ---
    b_grid = np.linspace(0.0, 0.999, 500)
    i_grid = np.arcsin(b_grid)
    curve_lams = [LAMBDAS_DEFAULT[0], 550.0, LAMBDAS_DEFAULT[1]]
    curves = []
    for lam in curve_lams:
        n = refractive_index(lam, c0, c1)
        # not wrapped: for k = 2 the curve runs smoothly from 360 down to its
        # minimum and back up, so wrapping at 360 would draw a false spike at b = 0
        dev = deviation_deg(i_grid, n, k)
        curves.append({
            "wavelength_nm": lam,
            "color": wavelength_to_hex(lam),
            "points": [[float(x), float(y)] for x, y in zip(b_grid, dev)],
        })

    # --- brightness versus angle (geometric optics with Fresnel weights) ---
    # The window follows the bows (they move with the refractive index), so it
    # always contains both bows with a margin on each side.
    bow_angles = [r["angle"] for r in primary] + [r["angle"] for r in secondary]
    a_min = max(0.0, min(bow_angles) - 5.0)
    a_max = min(180.0, max(bow_angles) + 5.0)
    if a_max - a_min < 20.0:
        a_max = min(180.0, a_min + 20.0)

    bin_count = 125
    edges = np.linspace(a_min, a_max, bin_count + 1)
    width = float(edges[1] - edges[0])
    centres = 0.5 * (edges[:-1] + edges[1:])

    rng_b = (np.arange(400000) + 0.5) / 400000.0         # uniform in b
    rng_i = np.arcsin(rng_b)

    series = []
    for lam in wavelengths:
        n = refractive_index(lam, c0, c1)
        entry = {"wavelength_nm": float(lam), "color": wavelength_to_hex(lam)}
        for order, name in ((1, "primary"), (2, "secondary")):
            theta = _wrap_theta(deviation_deg(rng_i, n, order) % 360.0)
            weights = rng_b * ray_weight(rng_i, n, order)       # b: area element
            counts, _ = np.histogram(theta, bins=edges, weights=weights)
            entry[name] = counts
        series.append(entry)

    peak = max(float(np.max(s["primary"])) for s in series)
    if not peak > 0.0:                      # defensive: never divide by zero
        peak = 1.0
    for s in series:
        s["primary"] = [float(v / peak) for v in s["primary"]]
        s["secondary"] = [float(v / peak) for v in s["secondary"]]

    histogram = {
        "angle_min": float(a_min),
        "angle_max": float(a_max),
        "bin_width": width,
        "centres": [float(c) for c in centres],
        "series": series,
    }

    return {
        "valid": True,
        "n_d": n_d,
        "abbe_number": abbe_number,
        "cauchy_c0": float(c0),
        "cauchy_c1": float(c1),
        "internal_reflections": k,
        "impact_parameter": b,
        "incidence_angle": float(np.degrees(i_sel)),
        "droplet": droplet,
        "primary": primary,
        "secondary": secondary,
        "alexander_band": alexander,
        "curves": curves,
        "histogram": histogram,
        "critical_angle": float(np.degrees(np.arcsin(1.0 / n_d))),
    }
