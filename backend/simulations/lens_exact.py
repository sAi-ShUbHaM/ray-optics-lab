import numpy as np

from physics.refraction import refract, validate_refractive_indices


# ---------------------------------------------------------------------
# Exact lens model: two spherical surfaces, refraction by Snell's law
# ---------------------------------------------------------------------
#   * Light travels left to right (+x); the lens sits in air (n = 1).
#   * The lens is centred on x = 0:
#         front vertex V1 = (-t/2, 0)      back vertex V2 = (+t/2, 0)
#   * Surface radii use the Cartesian sign convention:
#         R > 0  centre of curvature is to the RIGHT of the vertex
#         R < 0  centre of curvature is to the LEFT  of the vertex
#         R = 0  means a FLAT surface (infinite radius)
#     Biconvex lens: R1 > 0, R2 < 0.     Biconcave lens: R1 < 0, R2 > 0.
#
# Paraxial (Gaussian) thick-lens formulas, c = 1/R (c = 0 for flat):
#     power  P = 1/f = (n-1) [ c1 - c2 + (n-1) t c1 c2 / n ]
#     principal-plane offsets   h1 = -f (n-1) t c2 / n   (from V1)
#                               h2 = -f (n-1) t c1 / n   (from V2)
#     F2 = V2 + h2 + f          F1 = V1 + h1 - f
#
# The ray tracer does NOT use these formulas. They are the paraxial
# reference that the exact rays are compared against.
# ---------------------------------------------------------------------

EPS = 1e-9
MIN_EDGE = 0.05          # smallest allowed glass thickness at the rim
FLAT = 1e-12


def _unit(v):
    v = np.asarray(v, dtype=float)
    length = float(np.linalg.norm(v))
    if length < 1e-12:
        raise ValueError("Zero-length direction.")
    return v / length


def _pt(p):
    return [float(p[0]), float(p[1])]


class Surface:
    """One spherical (or flat) refracting surface of the lens."""

    def __init__(self, vertex_x, radius):
        self.v = float(vertex_x)
        self.R = float(radius)
        self.flat = abs(self.R) < FLAT

        if not self.flat:
            self.cx = self.v + self.R
            self.r = abs(self.R)
            # sign of (x - cx) on the branch that contains the vertex
            self.side = -1.0 if self.R > 0 else 1.0

    def x_at(self, y):
        if self.flat:
            return self.v
        return self.cx + self.side * np.sqrt(max(0.0, self.r ** 2 - y * y))

    def normal_at(self, p):
        if self.flat:
            return np.array([1.0, 0.0])
        return _unit(np.array(p) - np.array([self.cx, 0.0]))

    def intersect(self, origin, direction):
        """Nearest forward hit on the vertex-side branch, or None."""
        o = np.asarray(origin, float)
        d = np.asarray(direction, float)

        if self.flat:
            if abs(d[0]) < 1e-12:
                return None
            t = (self.v - o[0]) / d[0]
            return o + t * d if t > EPS else None

        ox, oy = o[0] - self.cx, o[1]
        b = 2.0 * (ox * d[0] + oy * d[1])
        c = ox * ox + oy * oy - self.r ** 2
        disc = b * b - 4.0 * c
        if disc < 0:
            return None

        root = np.sqrt(disc)
        for t in sorted(((-b - root) / 2.0, (-b + root) / 2.0)):
            if t <= EPS:
                continue
            p = o + t * d
            if self.side * (p[0] - self.cx) >= -1e-9:
                return p
        return None

    def profile(self, aperture, points=81):
        ys = np.linspace(aperture, -aperture, points)
        return [[float(self.x_at(y)), float(y)] for y in ys]


# ---------------------------------------------------------------------
# Paraxial reference data
# ---------------------------------------------------------------------

def paraxial_properties(n, r1, r2, t):
    c1 = 0.0 if abs(r1) < FLAT else 1.0 / r1
    c2 = 0.0 if abs(r2) < FLAT else 1.0 / r2

    power = (n - 1.0) * (c1 - c2 + (n - 1.0) * t * c1 * c2 / n)
    thin_power = (n - 1.0) * (c1 - c2)

    v1, v2 = -t / 2.0, t / 2.0

    props = {
        "power": power,
        "focal_length": None,
        "focal_length_thin": (1.0 / thin_power) if abs(thin_power) > 1e-12 else None,
        "h1_x": None, "h2_x": None,
        "focus_1_x": None, "focus_2_x": None,
        "back_focal_distance": None,
        "front_focal_distance": None,
    }

    if abs(power) < 1e-12:
        return props

    f = 1.0 / power
    h1 = -f * (n - 1.0) * t * c2 / n
    h2 = -f * (n - 1.0) * t * c1 / n

    props.update({
        "focal_length": f,
        "h1_x": v1 + h1,
        "h2_x": v2 + h2,
        "focus_1_x": v1 + h1 - f,
        "focus_2_x": v2 + h2 + f,
        "back_focal_distance": f + h2,
        "front_focal_distance": -(f - h1),
    })
    return props


def classify_shape(r1, r2, power):
    f1, f2 = abs(r1) < FLAT, abs(r2) < FLAT

    if f1 and f2:
        return "Flat glass plate (no power)"
    if (not f1 and r1 > 0 and not f2 and r2 < 0):
        return "Biconvex"
    if (not f1 and r1 < 0 and not f2 and r2 > 0):
        return "Biconcave"
    if (f2 and r1 > 0) or (f1 and r2 < 0):
        return "Plano-convex"
    if (f2 and r1 < 0) or (f1 and r2 > 0):
        return "Plano-concave"
    return "Converging meniscus" if power > 0 else "Diverging meniscus"


def effective_aperture(s1, s2, requested):
    """
    Largest usable half-height <= requested such that
      * it stays inside both spheres, and
      * the glass is at least MIN_EDGE thick everywhere up to it.
    """
    a = float(requested)
    for s in (s1, s2):
        if not s.flat:
            a = min(a, 0.98 * s.r)

    ys = np.linspace(0.0, a, 2001)
    for i, y in enumerate(ys):
        if s2.x_at(y) - s1.x_at(y) < MIN_EDGE:
            a = float(ys[max(i - 1, 0)])
            break
    return a


# ---------------------------------------------------------------------
# Exact ray tracing through the two surfaces
# ---------------------------------------------------------------------

def _extend_to_x(point, direction, x_end, fallback=30.0):
    if direction[0] > 1e-9:
        t = (x_end - point[0]) / direction[0]
        if t > 0:
            return point + t * direction
    return point + fallback * direction


def trace_ray(origin, direction, s1, s2, n, aperture, x_end, image_x):
    origin = np.asarray(origin, float)
    d = _unit(direction)
    points = [origin]

    result = {
        "status": "OK",
        "ok": False,
        "hit_1": None,
        "hit_2": None,
        "exit_direction": None,
        "axis_crossing_x": None,
        "crossing_ahead": None,
        "y_at_image_plane": None,
    }

    def finish(status, end=None):
        if end is not None:
            points.append(end)
        result["status"] = status
        result["points"] = [_pt(p) for p in points]
        return result

    # --- front surface: air -> glass ---------------------------------
    p1 = s1.intersect(origin, d)
    if p1 is None or abs(p1[1]) > aperture + 1e-9:
        return finish("Misses the lens aperture",
                      _extend_to_x(origin, d, x_end))

    points.append(p1)
    result["hit_1"] = _pt(p1)

    d1 = refract(d, s1.normal_at(p1), 1.0, n)
    if d1 is None:
        return finish("Total internal reflection at the front surface")

    # --- back surface: glass -> air ----------------------------------
    p2 = s2.intersect(p1, d1)
    if p2 is None:
        return finish("Lost inside the lens",
                      p1 + 5.0 * d1)

    points.append(p2)
    result["hit_2"] = _pt(p2)

    if abs(p2[1]) > aperture + 1e-9:
        return finish("Leaves through the lens edge")

    d2 = refract(d1, s2.normal_at(p2), n, 1.0)
    if d2 is None:
        return finish("Total internal reflection inside the lens")

    points.append(_extend_to_x(p2, d2, x_end))

    result["ok"] = True
    result["exit_direction"] = _pt(d2)

    if abs(d2[1]) > 1e-12:
        t = -p2[1] / d2[1]
        result["axis_crossing_x"] = float(p2[0] + t * d2[0])
        result["crossing_ahead"] = bool(t > 0)

    if image_x is not None and abs(d2[0]) > 1e-12:
        t = (image_x - p2[0]) / d2[0]
        result["y_at_image_plane"] = float(p2[1] + t * d2[1])

    return finish("OK")


def simulate_exact_lens(
    n,
    r1,
    r2,
    thickness,
    aperture,
    source="parallel",
    object_distance=30.0,
    source_height=0.0,
    ray_count=9,
):
    source = str(source).lower()
    n = float(n)
    r1 = float(r1)
    r2 = float(r2)
    t = float(thickness)
    aperture_requested = float(aperture)
    object_distance = float(object_distance)
    source_height = float(source_height)

    if source not in ("parallel", "point"):
        raise ValueError("source must be 'parallel' or 'point'.")

    n, _ = validate_refractive_indices(n, 1.0)

    for name, value in (
        ("r1", r1), ("r2", r2), ("Thickness", t), ("Aperture", aperture_requested),
        ("Object distance", object_distance), ("Source height", source_height),
    ):
        if not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")

    if t < MIN_EDGE:
        raise ValueError(f"Thickness must be at least {MIN_EDGE}.")
    if aperture_requested <= 0:
        raise ValueError("Aperture must be greater than zero.")
    if abs(r1) < FLAT and abs(r2) < FLAT:
        pass  # a flat plate is allowed; it simply has no power
    if int(ray_count) != ray_count or not (1 <= int(ray_count) <= 31):
        raise ValueError("ray_count must be a whole number from 1 to 31.")
    ray_count = int(ray_count)

    if source == "point" and object_distance <= t / 2.0:
        raise ValueError("The object must be in front of the lens.")

    s1 = Surface(-t / 2.0, r1)
    s2 = Surface(t / 2.0, r2)

    a = effective_aperture(s1, s2, aperture_requested)
    if a <= 1e-6:
        raise ValueError(
            "These radii and this thickness leave no usable lens aperture."
        )

    props = paraxial_properties(n, r1, r2, t)
    f = props["focal_length"]

    # --- paraxial image (Gaussian optics between the principal planes) ---
    paraxial_image = None
    image_plane_x = None

    if source == "parallel":
        x_start = -25.0
        if props["focus_2_x"] is not None:
            image_plane_x = props["focus_2_x"]
            paraxial_image = [image_plane_x, 0.0]
    else:
        x_start = -object_distance
        if f is not None:
            s = props["h1_x"] + object_distance      # object -> H1
            inv = 1.0 / f - 1.0 / s
            if abs(inv) > 1e-12:
                s_img = 1.0 / inv                    # H2 -> image
                m = -s_img / s
                image_plane_x = props["h2_x"] + s_img
                paraxial_image = [image_plane_x, m * source_height]

    # --- where rays are drawn to ---
    if f is not None and f > 0 and props["focus_2_x"] is not None:
        x_end = props["focus_2_x"] + max(0.6 * f, 5.0)
    else:
        x_end = t / 2.0 + 30.0
    if image_plane_x is not None and image_plane_x > x_end - 2.0 and image_plane_x < 150:
        x_end = image_plane_x + 5.0

    # --- ray fan ---
    heights = (
        np.array([0.0]) if ray_count == 1
        else np.linspace(-0.9 * a, 0.9 * a, ray_count)
    )

    rays = []
    for index, y in enumerate(heights):
        if source == "parallel":
            origin = [x_start, float(y)]
            direction = [1.0, 0.0]
        else:
            origin = [x_start, source_height]
            direction = [s1.v - x_start, float(y) - source_height]

        info = trace_ray(origin, direction, s1, s2, n, a, x_end, image_plane_x)
        info["index"] = index
        info["entry_height"] = float(y)
        rays.append(info)

    # --- aberration summary ---
    good = [r for r in rays if r["ok"]]
    blur = None
    lsa = None
    marginal_crossing = None

    ys = [r["y_at_image_plane"] for r in good if r["y_at_image_plane"] is not None]
    if len(ys) >= 2:
        blur = float(max(ys) - min(ys))

    if source_height == 0.0 and image_plane_x is not None:
        crossing = [
            (abs(r["entry_height"]), r["axis_crossing_x"])
            for r in good if r["axis_crossing_x"] is not None
            and abs(r["entry_height"]) > 1e-9
        ]
        if crossing:
            _, marginal_crossing = max(crossing, key=lambda item: item[0])
            lsa = float(marginal_crossing - image_plane_x)

    return {
        "valid": True,
        "ray_model": "exact_spherical_surfaces",
        "n": n,
        "r1": r1,
        "r2": r2,
        "thickness": t,
        "aperture_requested": aperture_requested,
        "aperture": a,
        "aperture_limited": bool(a < aperture_requested - 1e-9),
        "shape": classify_shape(r1, r2, props["power"]),
        "power": props["power"],
        "focal_length": f,
        "focal_length_thin": props["focal_length_thin"],
        "converging": bool(f is not None and f > 0),
        "back_focal_distance": props["back_focal_distance"],
        "front_focal_distance": props["front_focal_distance"],
        "vertex_1": [s1.v, 0.0],
        "vertex_2": [s2.v, 0.0],
        "principal_plane_1_x": props["h1_x"],
        "principal_plane_2_x": props["h2_x"],
        "focus_1": None if props["focus_1_x"] is None else [props["focus_1_x"], 0.0],
        "focus_2": None if props["focus_2_x"] is None else [props["focus_2_x"], 0.0],
        "surface_1": s1.profile(a),
        "surface_2": s2.profile(a),
        "source": source,
        "object_distance": object_distance,
        "source_height": source_height,
        "x_start": x_start,
        "x_end": x_end,
        "paraxial_image": paraxial_image,
        "image_plane_x": image_plane_x,
        "blur_height": blur,
        "marginal_axis_crossing_x": marginal_crossing,
        "longitudinal_aberration": lsa,
        "rays": rays,
    }
