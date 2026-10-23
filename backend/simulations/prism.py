import numpy as np

from physics.refraction import refract


# ---------------------------------------------------------------------
# Triangular prism with dispersion
# ---------------------------------------------------------------------
# Geometry (isosceles prism, apex up):
#     apex  = (0, H)            base corners = (-b, 0) and (+b, 0)
#     b = H tan(A/2)            A = apex angle, H = 10 (fixed size)
#   Light enters through the LEFT face and normally leaves through the
#   RIGHT face; the base is also a real surface (total internal
#   reflection there gives a reflecting prism).
#
# Angle convention for the incident ray
#   The incidence angle theta1 is measured from the INWARD normal of the
#   left face. Positive theta1 = the inward normal rotated
#   counter-clockwise (the ray travels more steeply upward).
#   Light reaching the minimum-deviation position has theta1 > 0 and runs
#   parallel to the base inside the prism.
#
# Deviation delta = (angle of the incident ray) - (angle of the emergent
#   ray), so a ray bent towards the base has delta > 0.
#
# Textbook formulas (simple pass through two faces)
#   sin(theta1) = n sin(r1)        r2 = A - r1        sin(theta4) = n sin(r2)
#   delta = theta1 + theta4 - A
#   minimum deviation: n = sin((A + d_min)/2) / sin(A/2)
#   thin prism:        delta ~ (n - 1) A
#
# Dispersion model (Cauchy):   n(lambda) = C0 + C1 / lambda^2   (lambda in um)
#   fitted so that n(589.3 nm) = n_d and the Abbe number
#   V = (n_d - 1) / (n_F - n_C) matches the value you give.
# ---------------------------------------------------------------------

PRISM_HEIGHT = 10.0
LAMBDA_D = 0.5893     # um, sodium D line
LAMBDA_F = 0.4861     # um, hydrogen F line
LAMBDA_C = 0.6563     # um, hydrogen C line
EPS = 1e-7


def _pt(p):
    return [float(p[0]), float(p[1])]


def _unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def _angle_deg(v):
    return float(np.degrees(np.arctan2(v[1], v[0])))


def _wrap_deg(a):
    """Wrap an angle to (-180, 180]."""
    a = (a + 180.0) % 360.0 - 180.0
    return 180.0 if a == -180.0 else a


# ---------------------------------------------------------------------
# Material and colour
# ---------------------------------------------------------------------

def cauchy_coefficients(n_d, abbe_number):
    """Return (C0, C1) so that n(589.3 nm) = n_d and V_d = abbe_number."""
    inv_f = 1.0 / LAMBDA_F ** 2
    inv_c = 1.0 / LAMBDA_C ** 2
    inv_d = 1.0 / LAMBDA_D ** 2

    dispersion = (n_d - 1.0) / abbe_number          # n_F - n_C
    c1 = dispersion / (inv_f - inv_c)
    c0 = n_d - c1 * inv_d
    return c0, c1


def refractive_index(wavelength_nm, c0, c1):
    lam = wavelength_nm / 1000.0
    return c0 + c1 / lam ** 2


def wavelength_to_hex(nm):
    """Approximate visible colour of a wavelength (D. Bruton's algorithm)."""
    w = float(nm)

    if 380 <= w < 440:
        r, g, b = -(w - 440) / 60.0, 0.0, 1.0
    elif 440 <= w < 490:
        r, g, b = 0.0, (w - 440) / 50.0, 1.0
    elif 490 <= w < 510:
        r, g, b = 0.0, 1.0, -(w - 510) / 20.0
    elif 510 <= w < 580:
        r, g, b = (w - 510) / 70.0, 1.0, 0.0
    elif 580 <= w < 645:
        r, g, b = 1.0, -(w - 645) / 65.0, 0.0
    elif 645 <= w <= 780:
        r, g, b = 1.0, 0.0, 0.0
    else:
        r = g = b = 0.0

    if 380 <= w < 420:
        factor = 0.3 + 0.7 * (w - 380) / 40.0
    elif 420 <= w < 700:
        factor = 1.0
    elif 700 <= w <= 780:
        factor = 0.3 + 0.7 * (780 - w) / 80.0
    else:
        factor = 0.0

    def channel(c):
        return int(round(255 * (c * factor) ** 0.8)) if c > 0 else 0

    return "#{:02x}{:02x}{:02x}".format(channel(r), channel(g), channel(b))


# ---------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------

class PrismGeometry:
    def __init__(self, apex_angle_deg, height=PRISM_HEIGHT):
        half = np.radians(apex_angle_deg) / 2.0
        b = height * np.tan(half)

        self.height = height
        self.half_angle = half
        self.apex = np.array([0.0, height])
        self.left = np.array([-b, 0.0])
        self.right = np.array([b, 0.0])

        # (name, start, end, outward normal)
        self.faces = [
            ("left face", self.left, self.apex,
             np.array([-np.cos(half), np.sin(half)])),
            ("right face", self.apex, self.right,
             np.array([np.cos(half), np.sin(half)])),
            ("base", self.left, self.right, np.array([0.0, -1.0])),
        ]

    def nearest_hit(self, p, d, skip=None):
        """Nearest face crossed by the ray p + t d, as (t, face index)."""
        best = None

        for index, (_, a, b, _) in enumerate(self.faces):
            if index == skip:
                continue

            edge = b - a
            # solve p + t d = a + s edge
            matrix = np.array([[d[0], -edge[0]], [d[1], -edge[1]]])
            if abs(np.linalg.det(matrix)) < 1e-12:
                continue

            t, s = np.linalg.solve(matrix, a - p)

            if t > EPS and -1e-9 <= s <= 1 + 1e-9:
                if best is None or t < best[0]:
                    best = (float(t), index)

        return best


def trace_ray(origin, direction, n, geometry, end_x, max_events=8):
    """
    Follow a ray through the prism, refracting or totally reflecting at
    every surface it meets.
    """
    d = _unit(direction)
    d_in = d.copy()
    p = np.array(origin, dtype=float)

    points = [p.copy()]
    events = []
    normals = []          # (point, outward normal) at every interaction
    inside = False
    emerged = False
    last_face = None
    first_angle = None

    for _ in range(max_events):
        hit = geometry.nearest_hit(p, d, skip=last_face)
        if hit is None:
            break

        t, index = hit
        q = p + t * d
        name, _, _, normal = geometry.faces[index]

        points.append(q.copy())
        normals.append((q.copy(), normal))

        if not inside:
            new_d = refract(d, normal, 1.0, n)
            if new_d is None:
                new_d = d - 2.0 * np.dot(d, normal) * normal
                events.append(f"Reflected at the {name}")
            else:
                inside = True
                events.append(f"Refracted into the prism at the {name}")
                if first_angle is None:
                    first_angle = name
        else:
            new_d = refract(d, normal, n, 1.0)
            if new_d is None:
                new_d = d - 2.0 * np.dot(d, normal) * normal
                events.append(f"Total internal reflection at the {name}")
            else:
                inside = False
                events.append(f"Refracted out at the {name}")

        d = _unit(new_d)
        p = q
        last_face = index

        if not inside:
            emerged = True
            break

    # extend the last segment
    if emerged or not inside:
        if d[0] > 1e-6 and end_x > p[0]:
            length = min((end_x - p[0]) / d[0], 80.0)
        else:
            length = 25.0
        end = p + d * length
    else:
        end = p + d * 4.0
        events.append("Trapped inside the prism")

    points.append(end)

    deviation = None
    if emerged:
        deviation = _wrap_deg(_angle_deg(d_in) - _angle_deg(d))

    return {
        "points": points,
        "events": events,
        "normals": normals,
        "emerged": emerged,
        "deviation": deviation,
        "exit_direction": d,
    }


# ---------------------------------------------------------------------
# Textbook formulas
# ---------------------------------------------------------------------

def analytic_deviation(theta1_deg, apex_deg, n):
    """delta = theta1 + theta4 - A for a simple two-face pass (degrees),
    or None if the ray is totally internally reflected at the second face."""
    t1 = np.radians(theta1_deg)
    A = np.radians(apex_deg)

    r1 = np.arcsin(np.sin(t1) / n)
    r2 = A - r1
    s4 = n * np.sin(r2)

    if abs(s4) > 1.0:
        return None

    return float(np.degrees(t1 + np.arcsin(s4) - A))


def minimum_deviation(apex_deg, n):
    """(delta_min, theta1_at_min) in degrees, or None if none exists."""
    s = n * np.sin(np.radians(apex_deg) / 2.0)
    if s > 1.0:
        return None

    d_min = 2.0 * np.degrees(np.arcsin(s)) - apex_deg
    return float(d_min), float((d_min + apex_deg) / 2.0)


# ---------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------

def simulate_prism(
    apex_angle,
    n_d,
    abbe_number,
    incidence_angle,
    entry_fraction=0.5,
    spectrum_samples=7,
    wavelength_nm=550.0,
    screen_distance=25.0,
):
    apex_angle = float(apex_angle)
    n_d = float(n_d)
    abbe_number = float(abbe_number)
    incidence_angle = float(incidence_angle)
    entry_fraction = float(entry_fraction)
    wavelength_nm = float(wavelength_nm)
    screen_distance = float(screen_distance)

    for name, value in (
        ("Apex angle", apex_angle), ("n_d", n_d), ("Abbe number", abbe_number),
        ("Incidence angle", incidence_angle), ("Entry position", entry_fraction),
        ("Wavelength", wavelength_nm), ("Screen distance", screen_distance),
    ):
        if not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")

    if not (5.0 <= apex_angle <= 120.0):
        raise ValueError("Apex angle must be between 5 and 120 degrees.")
    if not (1.0 <= n_d <= 3.0):
        raise ValueError("n_d must be between 1 and 3.")
    if not (10.0 <= abbe_number <= 200.0):
        raise ValueError("Abbe number must be between 10 and 200.")
    if not (-89.0 <= incidence_angle <= 89.0):
        raise ValueError("Incidence angle must be between -89 and 89 degrees.")
    if not (0.1 <= entry_fraction <= 0.9):
        raise ValueError("Entry position must be between 0.1 and 0.9.")
    if not (380.0 <= wavelength_nm <= 780.0):
        raise ValueError("Wavelength must be between 380 and 780 nm.")
    if not (1.0 <= screen_distance <= 100.0):
        raise ValueError("Screen distance must be between 1 and 100.")
    if int(spectrum_samples) != spectrum_samples or not (1 <= int(spectrum_samples) <= 13):
        raise ValueError("spectrum_samples must be a whole number from 1 to 13.")
    spectrum_samples = int(spectrum_samples)

    c0, c1 = cauchy_coefficients(n_d, abbe_number)
    geometry = PrismGeometry(apex_angle)

    # --- incident ray: aimed at a point on the left face ---
    inward = -geometry.faces[0][3]
    angle = np.arctan2(inward[1], inward[0]) + np.radians(incidence_angle)
    direction = np.array([np.cos(angle), np.sin(angle)])

    entry_point = geometry.left + entry_fraction * (geometry.apex - geometry.left)
    origin = entry_point - direction * 16.0

    screen_x = float(geometry.right[0] + screen_distance)

    # --- wavelengths to trace ---
    if spectrum_samples == 1:
        wavelengths = [wavelength_nm]
    else:
        wavelengths = list(np.linspace(400.0, 700.0, spectrum_samples))

    rays = []
    for lam in wavelengths:
        n = refractive_index(lam, c0, c1)
        result = trace_ray(origin, direction, n, geometry, screen_x)

        screen_y = None
        end = result["points"][-1]
        if result["emerged"] and abs(end[0] - screen_x) < 1e-6:
            screen_y = float(end[1])

        rays.append({
            "wavelength_nm": float(lam),
            "color": wavelength_to_hex(lam),
            "n": float(n),
            "deviation": result["deviation"],
            "emerged": result["emerged"],
            "events": result["events"],
            "points": [_pt(p) for p in result["points"]],
            "screen_y": screen_y,
        })

    # --- reference ray at the sodium D line (cards, normals, formulas) ---
    ref = trace_ray(origin, direction, n_d, geometry, screen_x)

    simple_pass = (
        ref["emerged"]
        and len(ref["events"]) == 2
        and ref["events"][0].endswith("left face")
        and ref["events"][1].endswith("right face")
    )

    angles = None
    if simple_pass:
        r1 = float(np.degrees(np.arcsin(np.sin(np.radians(incidence_angle)) / n_d)))
        r2 = apex_angle - r1
        theta4 = float(np.degrees(np.arcsin(np.clip(n_d * np.sin(np.radians(r2)), -1, 1))))
        angles = {"theta1": incidence_angle, "r1": r1, "r2": r2, "theta4": theta4}

    # --- spectrum summary ---
    good = [r for r in rays if r["deviation"] is not None]
    angular_dispersion = None
    spread = None

    if len(good) >= 2:
        angular_dispersion = float(good[0]["deviation"] - good[-1]["deviation"])

    ys = [r["screen_y"] for r in rays if r["screen_y"] is not None]
    if len(ys) >= 2:
        spread = float(max(ys) - min(ys))

    # --- deviation curve at n_d (analytic, simple pass) ---
    curve = []
    for t1 in np.arange(-89.0, 89.01, 0.5):
        delta = analytic_deviation(t1, apex_angle, n_d)
        if delta is not None:
            curve.append([float(t1), delta])

    min_dev = minimum_deviation(apex_angle, n_d)

    # Make the plotted curve pass exactly through its true minimum.
    if min_dev is not None:
        curve.append([min_dev[1], min_dev[0]])
        curve.sort(key=lambda point: point[0])

    theta_c = float(np.degrees(np.arcsin(1.0 / n_d))) if n_d > 1.0 else None

    return {
        "valid": True,
        "apex_angle": apex_angle,
        "n_d": n_d,
        "abbe_number": abbe_number,
        "cauchy_c0": float(c0),
        "cauchy_c1": float(c1),
        "incidence_angle": incidence_angle,
        "entry_fraction": entry_fraction,
        "prism": {
            "apex": _pt(geometry.apex),
            "left": _pt(geometry.left),
            "right": _pt(geometry.right),
            "height": PRISM_HEIGHT,
        },
        "incident_start": _pt(origin),
        "entry_point": _pt(entry_point),
        "screen_x": screen_x,
        "rays": rays,
        "reference": {
            "deviation": ref["deviation"],
            "emerged": ref["emerged"],
            "events": ref["events"],
            "angles": angles,
            "normals": [
                {"point": _pt(q), "direction": _pt(nrm)}
                for q, nrm in ref["normals"]
            ],
        },
        "angular_dispersion": angular_dispersion,
        "screen_spread": spread,
        "min_deviation": None if min_dev is None else min_dev[0],
        "min_deviation_incidence": None if min_dev is None else min_dev[1],
        "thin_prism_deviation": float((n_d - 1.0) * apex_angle),
        "critical_angle": theta_c,
        "curve": curve,
    }
