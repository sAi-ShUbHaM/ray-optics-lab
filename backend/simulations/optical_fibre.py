import math

import numpy as np


# ---------------------------------------------------------------------
# Optical fibre (step-index) and light guiding by total internal reflection
# ---------------------------------------------------------------------
# A core of index n1 is wrapped in a cladding of index n2 < n1. Light that
# strikes the core-cladding boundary at more than the critical angle
#
#           theta_c = arcsin(n2 / n1)
#
# is totally reflected and stays in the core. A ray that enters the flat end of
# the fibre from a medium of index n0 at angle theta0 to the axis is refracted
# (Snell's law, n0 sin(theta0) = n1 sin(theta_r)) and then meets the wall at
#
#           phi = 90 degrees - |theta_r|
#
# The ray is guided when phi >= theta_c. That gives the acceptance angle:
#
#           n0 sin(theta_max) = sqrt(n1^2 - n2^2) = NA   (numerical aperture)
#
# Lengths below are measured in CORE DIAMETERS (the core is 1 wide), so the
# same drawing works for any real fibre. Real lengths only enter the totals.
#
# The core diameter does not change any ray angle. It decides how many times a
# ray bounces, and it decides how the fibre behaves as a WAVE guide:
#
#           V = pi d NA / lambda          (V number, d = core diameter)
#
# A step-index fibre carries a single mode when V < 2.405, and about V^2 / 2
# modes when V is large. (This goes beyond ray optics, so it is shown as an
# estimate.)
#
# Bent fibre: a straight section followed by a circular bend of radius R (the
# radius of the fibre axis). A ray parallel to the axis that is a distance y
# from the axis (towards the outer wall) meets the outer wall at
#     sin(i) = (R + y) / (R + a)        (a = core half-width)
# so even the rays that were guided in the straight fibre can leak where the
# fibre bends. All rays parallel to the axis stay guided only when
#     R >= a (n1 + n2) / (n1 - n2).
# ---------------------------------------------------------------------

SPEED_OF_LIGHT = 299_792_458.0      # m/s
HALF_WIDTH = 0.5                    # core half-width, in core diameters
CLADDING_DRAWN = 0.6                # drawn cladding thickness, in core diameters
LEAD_IN = 4.0                       # straight section before a bend, in core diameters
LEAK_LENGTH = 2.5                   # how far a leaking ray is followed
EPS = 1e-9
TIR_TOLERANCE = 1e-12
SINGLE_MODE_V = 2.405               # first zero of the Bessel function J0


def _validate(name, value, low, high):
    value = float(value)
    if not np.isfinite(value) or not (low <= value <= high):
        raise ValueError(f"{name} must be between {low:g} and {high:g}.")
    return value


# ---------------------------------------------------------------------
# Geometry of the fibre and ray tracing inside the core
# ---------------------------------------------------------------------

def _cross(u, v):
    return u[0] * v[1] - u[1] * v[0]


def _hit_segment(p, d, a, b):
    """Distance along the unit direction d to the segment a-b, and its normal."""
    e = (b[0] - a[0], b[1] - a[1])
    den = _cross(d, e)
    if abs(den) < 1e-14:
        return None
    w = (a[0] - p[0], a[1] - p[1])
    t = _cross(w, e) / den
    s = _cross(w, d) / den
    if t > EPS and -1e-9 <= s <= 1.0 + 1e-9:
        length = math.hypot(*e)
        return t, (-e[1] / length, e[0] / length)
    return None


def _hit_arc(p, d, centre, radius, phi_max):
    """Distance to the part of a circle with 0 <= phi <= phi_max, where the point
    at angle phi is centre + radius * (sin phi, -cos phi)."""
    fx, fy = p[0] - centre[0], p[1] - centre[1]
    b = fx * d[0] + fy * d[1]
    c = fx * fx + fy * fy - radius * radius
    disc = b * b - c
    if disc < 0.0:
        return None
    root = math.sqrt(disc)
    for t in sorted((-b - root, -b + root)):
        if t > EPS:
            qx, qy = p[0] + t * d[0], p[1] + t * d[1]
            phi = math.atan2(qx - centre[0], -(qy - centre[1]))
            if -1e-9 <= phi <= phi_max + 1e-9:
                return t, ((qx - centre[0]) / radius, (qy - centre[1]) / radius)
    return None


class FibreGeometry:
    """A straight fibre, or a straight lead-in followed by a circular bend."""

    def __init__(self, bend_radius, bend_angle_deg, view_length):
        a = HALF_WIDTH
        self.a = a
        self.bent = bend_radius > 0.0
        self.walls = []        # (name, kind, data)

        if self.bent:
            self.lead = LEAD_IN
            self.radius = float(bend_radius)
            self.bend_angle = math.radians(bend_angle_deg)
            self.centre = (self.lead, self.radius)
            end_inner = self.point_on_axis(self.bend_angle, -a)
            end_outer = self.point_on_axis(self.bend_angle, +a)
            self.walls = [
                ("lead upper wall", "line", ((0.0, a), (self.lead, a))),
                ("lead lower wall", "line", ((0.0, -a), (self.lead, -a))),
                ("inner wall", "arc", (self.radius - a, self.bend_angle)),
                ("outer wall", "arc", (self.radius + a, self.bend_angle)),
                ("end", "end", (end_inner, end_outer)),
            ]
        else:
            self.length = float(view_length)
            self.walls = [
                ("upper wall", "line", ((0.0, a), (self.length, a))),
                ("lower wall", "line", ((0.0, -a), (self.length, -a))),
                ("end", "end", ((self.length, -a), (self.length, a))),
            ]

    def point_on_axis(self, phi, offset=0.0):
        """Point on the bend at angle phi, `offset` outward from the axis."""
        r = self.radius + offset
        return (self.centre[0] + r * math.sin(phi), self.centre[1] - r * math.cos(phi))

    def nearest_hit(self, p, d):
        best = None
        for name, kind, data in self.walls:
            if kind in ("line", "end"):
                hit = _hit_segment(p, d, data[0], data[1])
            else:
                hit = _hit_arc(p, d, self.centre, data[0], data[1])
            if hit is not None and (best is None or hit[0] < best[0]):
                best = (hit[0], hit[1], name, kind)
        return best

    def outline(self):
        """Polylines for drawing the core and the cladding."""
        a, t = self.a, CLADDING_DRAWN
        if not self.bent:
            L = self.length
            return {
                "core_upper": [[0.0, a], [L, a]],
                "core_lower": [[0.0, -a], [L, -a]],
                "clad_upper": [[0.0, a + t], [L, a + t]],
                "clad_lower": [[0.0, -a - t], [L, -a - t]],
            }

        n = 72
        phis = [self.bend_angle * k / n for k in range(n + 1)]

        def arc(offset):
            r = max(self.radius + offset, 0.02)
            return [[self.centre[0] + r * math.sin(p), self.centre[1] - r * math.cos(p)] for p in phis]

        S = self.lead
        # the inner side of the bend is the +y side
        return {
            "core_upper": [[0.0, a], [S, a]] + arc(-a),
            "core_lower": [[0.0, -a], [S, -a]] + arc(+a),
            "clad_upper": [[0.0, a + t], [S, a + t]] + arc(-a - t),
            "clad_lower": [[0.0, -a - t], [S, -a - t]] + arc(+a + t),
        }


def trace_ray(geometry, origin, direction, n1, n2, max_events=120):
    """Follow one ray inside the core. It reflects at every wall it meets with
    sin(i) >= n2/n1 and escapes into the cladding where it does not."""
    p = (float(origin[0]), float(origin[1]))
    d = _unit(direction)
    points = [list(p)]
    reflections = []
    leak = None
    guided = True
    exited = False
    truncated = False

    for _ in range(max_events):
        hit = geometry.nearest_hit(p, d)
        if hit is None:
            truncated = True
            break

        t, normal, name, kind = hit
        q = (p[0] + t * d[0], p[1] + t * d[1])
        points.append([q[0], q[1]])

        if kind == "end":
            exited = True
            break

        d_dot_n = d[0] * normal[0] + d[1] * normal[1]
        cos_i = abs(d_dot_n)
        sin_i = math.sqrt(max(1.0 - cos_i * cos_i, 0.0))

        if n1 * sin_i >= n2 - TIR_TOLERANCE:
            # total internal reflection: r = d - 2 (d.n) n
            d = _unit((d[0] - 2.0 * d_dot_n * normal[0], d[1] - 2.0 * d_dot_n * normal[1]))
            p = q
            reflections.append([q[0], q[1]])
            continue

        # refraction into the cladding: Snell's law n1 sin(i) = n2 sin(t)
        guided = False
        sign = 1.0 if d_dot_n > 0 else -1.0
        n_out = (normal[0] * sign, normal[1] * sign)
        tangent = (d[0] - (d[0] * n_out[0] + d[1] * n_out[1]) * n_out[0],
                   d[1] - (d[0] * n_out[0] + d[1] * n_out[1]) * n_out[1])
        ratio = n1 / n2
        sin_t = ratio * sin_i
        cos_t = math.sqrt(max(1.0 - sin_t * sin_t, 0.0))
        d_out = _unit((ratio * tangent[0] + cos_t * n_out[0], ratio * tangent[1] + cos_t * n_out[1]))
        end = (q[0] + LEAK_LENGTH * d_out[0], q[1] + LEAK_LENGTH * d_out[1])
        points.append([end[0], end[1]])
        leak = {
            "point": [q[0], q[1]],
            "wall": name,
            "incidence_deg": math.degrees(math.asin(min(sin_i, 1.0))),
            "refracted_deg": math.degrees(math.asin(min(sin_t, 1.0))),
        }
        break

    return {
        "points": points,
        "reflections": reflections,
        "guided": guided and exited,
        "leaks": not guided,
        "leak": leak,
        "truncated": truncated,
        "reflection_count": len(reflections),
    }


def _unit(v):
    n = math.hypot(v[0], v[1])
    return (v[0] / n, v[1] / n)


# ---------------------------------------------------------------------
# Analytic results
# ---------------------------------------------------------------------

def numerical_aperture(n1, n2):
    return math.sqrt(max(n1 * n1 - n2 * n2, 0.0))


def acceptance_angle_deg(n1, n2, n0=1.0):
    """Largest entry angle (to the axis, in the outside medium) that is guided.
    90 degrees when every angle is accepted."""
    s = numerical_aperture(n1, n2) / n0
    return 90.0 if s >= 1.0 else math.degrees(math.asin(s))


def critical_angle_deg(n1, n2):
    return math.degrees(math.asin(n2 / n1))


def refracted_axial_angle_deg(entry_angle_deg, n1, n0=1.0):
    """Angle to the axis inside the core, or None if the ray cannot enter."""
    s = n0 * math.sin(math.radians(entry_angle_deg)) / n1
    if abs(s) >= 1.0:
        return None
    return math.degrees(math.asin(s))


def wall_incidence_deg(entry_angle_deg, n1, n0=1.0):
    theta_r = refracted_axial_angle_deg(entry_angle_deg, n1, n0)
    return None if theta_r is None else 90.0 - abs(theta_r)


def v_number(n1, n2, core_diameter_um, wavelength_nm):
    """V = pi d NA / lambda."""
    return math.pi * core_diameter_um * numerical_aperture(n1, n2) / (wavelength_nm / 1000.0)


def single_mode_cutoff_diameter_um(n1, n2, wavelength_nm):
    """Largest core diameter for which the fibre still carries a single mode."""
    return SINGLE_MODE_V * (wavelength_nm / 1000.0) / (math.pi * numerical_aperture(n1, n2))


def estimated_mode_count(v):
    """1 below the single-mode cutoff, otherwise the large-V estimate V^2 / 2."""
    return 1 if v <= SINGLE_MODE_V else max(2, int(round(v * v / 2.0)))


def minimum_bend_radius(n1, n2):
    """Smallest axis radius (in core diameters) for which every ray parallel to
    the axis is still guided around the bend."""
    return (n1 + n2) / (2.0 * (n1 - n2))


def reflections_in_length(theta_r_deg, length_diameters, entry_height_fraction=0.0):
    """How many times a ray reflects in a straight fibre of the given length
    (in core diameters). The ray starts at the given fraction of the core
    half-width above the axis."""
    t = math.tan(math.radians(abs(theta_r_deg)))
    if t < 1e-12:
        return 0
    a = HALF_WIDTH
    y0 = entry_height_fraction * a
    if theta_r_deg < 0:
        y0 = -y0
    first = (a - y0) / t                     # distance to the first wall
    if length_diameters < first:
        return 0
    return int(math.floor((length_diameters - first) / (1.0 / t))) + 1


# ---------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------

def simulate_optical_fibre(
    n_core=1.50,
    n_cladding=1.35,
    n_outside=1.0,
    entry_angle=20.0,
    entry_height=0.0,
    core_diameter_um=50.0,
    length_m=100.0,
    bend_radius=0.0,
    bend_angle=90.0,
    view_length=12.0,
    wavelength_nm=1550.0,
):
    n1 = _validate("Core index", n_core, 1.2, 3.0)
    n2 = _validate("Cladding index", n_cladding, 1.0, 3.0)
    n0 = _validate("Outside index", n_outside, 1.0, 1.6)
    theta0 = _validate("Entry angle", entry_angle, -89.0, 89.0)
    height = _validate("Entry height", entry_height, -0.95, 0.95)
    d_um = _validate("Core diameter", core_diameter_um, 1.0, 1000.0)
    length = _validate("Fibre length", length_m, 0.001, 1_000_000.0)
    radius_bend = float(bend_radius)
    if not np.isfinite(radius_bend) or not (radius_bend == 0.0 or 1.2 <= radius_bend <= 400.0):
        raise ValueError("Bend radius must be 0 (straight) or between 1.2 and 400 core diameters.")
    bend_deg = _validate("Bend angle", bend_angle, 10.0, 180.0)
    view = _validate("Drawn length", view_length, 4.0, 40.0)
    wavelength = _validate("Wavelength", wavelength_nm, 300.0, 2000.0)

    if n2 >= n1:
        raise ValueError("The core index must be larger than the cladding index, or the fibre cannot guide light.")
    if n0 >= n1:
        raise ValueError("The outside index must be smaller than the core index.")

    geometry = FibreGeometry(radius_bend, bend_deg, view)
    theta_c = critical_angle_deg(n1, n2)
    na = numerical_aperture(n1, n2)
    theta_max = acceptance_angle_deg(n1, n2, n0)
    all_accepted = na / n0 >= 1.0
    v = v_number(n1, n2, d_um, wavelength)

    def launch(entry_deg, h_fraction):
        """Origin and direction inside the core, or None if the ray cannot enter."""
        theta_r = refracted_axial_angle_deg(entry_deg, n1, n0)
        if theta_r is None:
            return None, None
        a = math.radians(theta_r)
        return (0.0, h_fraction * HALF_WIDTH), (math.cos(a), math.sin(a))

    # ----- the selected ray -----
    theta_r = refracted_axial_angle_deg(theta0, n1, n0)
    phi = wall_incidence_deg(theta0, n1, n0)
    guided_straight = phi is not None and n1 * math.sin(math.radians(phi)) >= n2 - TIR_TOLERANCE

    origin, direction = launch(theta0, height)
    path = trace_ray(geometry, origin, direction, n1, n2, max_events=400) if origin else None

    # ----- totals for the real fibre (straight) -----
    L_diam = length / (d_um * 1e-6)
    if theta_r is None:
        reflections_total = 0
    else:
        reflections_total = reflections_in_length(theta_r, L_diam, height)
    cos_r = math.cos(math.radians(theta_r)) if theta_r is not None else None
    stretch = None if cos_r is None else 1.0 / cos_r
    travel_ns = None if stretch is None else n1 * length * stretch / SPEED_OF_LIGHT * 1e9
    axial_ns = n1 * length / SPEED_OF_LIGHT * 1e9
    modal_ns = (n1 * length / SPEED_OF_LIGHT) * (n1 / n2 - 1.0) * 1e9

    selected = {
        "entry_angle": theta0,
        "refracted_angle": theta_r,
        "wall_incidence": phi,
        "margin_deg": None if phi is None else phi - theta_c,
        "guided_in_straight_fibre": bool(guided_straight),
        "enters": theta_r is not None,
        "inside_acceptance_cone": abs(theta0) <= theta_max + 1e-9,
        "reflections_total": int(reflections_total),
        "path_length_m": None if stretch is None else length * stretch,
        "path_stretch": stretch,
        "travel_time_ns": travel_ns,
        "delay_vs_axial_ns": None if travel_ns is None else travel_ns - axial_ns,
    }

    # ----- a fan of rays across the acceptance cone -----
    base = 40.0 if all_accepted else theta_max
    fan_angles = [-1.3 * base, -0.65 * base, 0.0, 0.65 * base, 1.3 * base]
    fan = []
    for angle in fan_angles:
        angle = max(-88.0, min(88.0, angle))
        o, dvec = launch(angle, 0.0)
        if o is None:
            continue
        ray = trace_ray(geometry, o, dvec, n1, n2, max_events=60)
        fan.append({
            "entry_angle": angle,
            "guided": ray["guided"],
            "points": ray["points"],
            "inside_acceptance_cone": abs(angle) <= theta_max + 1e-9,
        })

    # ----- wall incidence against entry angle -----
    sweep = []
    for k in range(-89, 90):
        phi_k = wall_incidence_deg(float(k), n1, n0)
        sweep.append({
            "entry_angle": float(k),
            "wall_incidence": phi_k,
            "guided": phi_k is not None and n1 * math.sin(math.radians(phi_k)) >= n2 - TIR_TOLERANCE,
        })

    # ----- bend -----
    r_min = minimum_bend_radius(n1, n2)
    bend = {
        "bent": geometry.bent,
        "radius_diameters": radius_bend if geometry.bent else None,
        "angle_deg": bend_deg if geometry.bent else None,
        "minimum_radius_diameters": r_min,
        "minimum_radius_um": r_min * d_um,
        "centre_ray_minimum_radius_diameters": n2 / (2.0 * (n1 - n2)),
    }

    outline = geometry.outline()
    xs = [pt[0] for key in outline for pt in outline[key]]
    ys = [pt[1] for key in outline for pt in outline[key]]
    for ray in fan + ([path] if path else []):
        for pt in ray["points"]:
            xs.append(pt[0])
            ys.append(pt[1])

    return {
        "valid": True,
        "fibre": {
            "n_core": n1,
            "n_cladding": n2,
            "n_outside": n0,
            "core_diameter_um": d_um,
            "length_m": length,
            "half_width": HALF_WIDTH,
            "cladding_drawn": CLADDING_DRAWN,
        },
        "numbers": {
            "critical_angle": theta_c,
            "numerical_aperture": na,
            "acceptance_angle": theta_max,
            "acceptance_cone": 2.0 * theta_max,
            "all_angles_accepted": all_accepted,
            "max_axial_angle": 90.0 - theta_c,
            "relative_index_difference": (n1 - n2) / n1,
            "modal_dispersion_ns": modal_ns,
            "modal_dispersion_ns_per_km": modal_ns * 1000.0 / length,
            "wavelength_nm": wavelength,
            "v_number": v,
            "single_mode": v <= SINGLE_MODE_V,
            "estimated_modes": estimated_mode_count(v),
            "single_mode_cutoff_diameter_um": single_mode_cutoff_diameter_um(n1, n2, wavelength),
        },
        "selected": selected,
        "path": path,
        "fan": fan,
        "sweep": sweep,
        "bend": bend,
        "outline": outline,
        "bounds": {
            "x_min": float(min(xs)), "x_max": float(max(xs)),
            "y_min": float(min(ys)), "y_max": float(max(ys)),
        },
    }
