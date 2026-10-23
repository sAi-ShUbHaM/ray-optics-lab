import numpy as np

from physics.refraction import refract


# ---------------------------------------------------------------------
# 1. GLASS SLAB  (parallel-sided block, vertical faces)
# ---------------------------------------------------------------------
#   * The slab is the region -t/2 < x < +t/2 and extends far up and down.
#   * Light travels towards +x. Medium on the left has index n_in, the
#     slab n_slab, and the medium on the right n_out (default n_out = n_in).
#   * The incident angle theta1 is measured from the face normal (the
#     x-axis) and is positive when the ray travels upwards.
#
#   Snell's law at the entry face:   n_in sin(theta1) = n_slab sin(theta2)
#   Inside the slab the ray travels t / cos(theta2).
#   Leaving into n_out:              n_slab sin(theta2) = n_out sin(theta3)
#   When n_in = n_out the emergent ray is PARALLEL to the incident ray,
#   shifted sideways by the lateral displacement
#
#         d = t sin(theta1 - theta2) / cos(theta2)
#
#   Paraxial (near-normal) viewing through the slab: an object behind it
#   appears nearer by  t (1 - n_in / n_slab).
# ---------------------------------------------------------------------

LEAD_IN = 16.0        # length of the drawn incident segment
LEAD_OUT = 14.0       # length of the drawn emergent segment
BEAM_SPACING = 1.5


def _pt(p):
    return [float(p[0]), float(p[1])]


def _unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def _require_index(name, value):
    value = float(value)
    if not np.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a number greater than zero.")
    return value


def trace_slab_ray(entry_height, direction, thickness, n_in, n_slab, n_out,
                   max_events=10):
    """Follow one ray through the slab, refracting or totally reflecting
    at every face it meets."""

    xl, xr = -thickness / 2.0, thickness / 2.0
    d_in = _unit(direction)
    d = d_in.copy()
    p = np.array([xl, float(entry_height)])

    origin = p - d_in * LEAD_IN
    points = [origin, p.copy()]
    events = []
    normal = np.array([1.0, 0.0])

    # --- entry face ---
    entered = refract(d, normal, n_in, n_slab)

    if entered is None:
        d = np.array([-d[0], d[1]])
        events.append("Total internal reflection at the entry face")
        points.append(p + d * LEAD_OUT)
        return {
            "points": points, "events": events, "status": "Reflected at the entry face",
            "exit_side": "left", "d_in": d_in, "d_out": d,
        }

    events.append("Refracted into the slab")
    d = _unit(entered)

    # --- bounce between the two faces until the ray escapes ---
    exit_side = None
    for _ in range(max_events):
        target_x = xr if d[0] > 0 else xl
        s = (target_x - p[0]) / d[0]
        p = p + s * d
        points.append(p.copy())

        side = "right" if d[0] > 0 else "left"
        n_next = n_out if d[0] > 0 else n_in
        leaving = refract(d, normal, n_slab, n_next)

        if leaving is None:
            d = np.array([-d[0], d[1]])
            events.append(f"Total internal reflection at the {side} face")
        else:
            d = _unit(leaving)
            events.append(f"Refracted out through the {side} face")
            exit_side = side
            break

    if exit_side is None:
        points.append(p + d * 3.0)
        events.append("Trapped inside the slab")
        status = "Trapped inside the slab"
    else:
        points.append(p + d * LEAD_OUT)
        status = ("Transmitted" if exit_side == "right"
                  else "Reflected back out through the entry face")

    return {
        "points": points, "events": events, "status": status,
        "exit_side": exit_side, "d_in": d_in, "d_out": d,
    }


def simulate_slab(incident_angle, thickness, n_slab, n_in=1.0, n_out=None,
                  ray_count=3):
    incident_angle = float(incident_angle)
    thickness = float(thickness)

    if not np.isfinite(incident_angle) or not (-89.0 <= incident_angle <= 89.0):
        raise ValueError("Incident angle must be between -89 and 89 degrees.")
    if not np.isfinite(thickness) or not (0.1 <= thickness <= 40.0):
        raise ValueError("Thickness must be between 0.1 and 40.")

    n_slab = _require_index("n_slab", n_slab)
    n_in = _require_index("n_in", n_in)
    n_out = n_in if n_out is None else _require_index("n_out", n_out)

    if int(ray_count) != ray_count or not (1 <= int(ray_count) <= 7):
        raise ValueError("ray_count must be a whole number from 1 to 7.")
    ray_count = int(ray_count)

    angle = np.radians(incident_angle)
    direction = np.array([np.cos(angle), np.sin(angle)])

    offsets = [(k - (ray_count - 1) / 2.0) * BEAM_SPACING for k in range(ray_count)]

    rays = []
    traces = []
    for y0 in offsets:
        tr = trace_slab_ray(y0, direction, thickness, n_in, n_slab, n_out)
        traces.append(tr)
        rays.append({
            "entry_height": float(y0),
            "points": [_pt(p) for p in tr["points"]],
            "events": tr["events"],
            "status": tr["status"],
            "exit_side": tr["exit_side"],
        })

    central = traces[ray_count // 2]
    central_ray = rays[ray_count // 2]

    same_media = abs(n_in - n_out) < 1e-12
    simple_pass = (
        central["exit_side"] == "right" and len(central["events"]) == 2
    )

    # --- angles and lateral displacement for a simple pass ---
    theta2 = theta3 = None
    displacement = displacement_formula = path_length = optical_path = None
    deviation = None

    s2 = n_in * np.sin(angle) / n_slab
    if abs(s2) <= 1.0:
        theta2 = float(np.degrees(np.arcsin(s2)))

    s3 = n_in * np.sin(angle) / n_out
    if abs(s3) <= 1.0:
        theta3 = float(np.degrees(np.arcsin(s3)))

    if simple_pass:
        p_in = np.array([-thickness / 2.0, central_ray["entry_height"]])
        p_out = np.array(central["points"][-2])
        deviation = float(np.degrees(
            np.arctan2(central["d_out"][1], central["d_out"][0])
            - np.arctan2(central["d_in"][1], central["d_in"][0])
        ))
        path_length = float(thickness / np.cos(np.radians(theta2)))
        optical_path = float(n_slab * path_length)

        if same_media:
            v = p_out - p_in
            u = central["d_in"]
            displacement = float(abs(v[0] * u[1] - v[1] * u[0]))
            displacement_formula = float(
                abs(thickness * np.sin(np.radians(incident_angle - theta2))
                    / np.cos(np.radians(theta2)))
            )

    critical_entry = (
        float(np.degrees(np.arcsin(n_slab / n_in))) if n_in > n_slab else None
    )

    return {
        "valid": True,
        "incident_angle": incident_angle,
        "thickness": thickness,
        "n_slab": n_slab,
        "n_in": n_in,
        "n_out": n_out,
        "same_media": same_media,
        "rays": rays,
        "status": central_ray["status"],
        "events": central_ray["events"],
        "theta1": incident_angle,
        "theta2": theta2,
        "theta3": theta3,
        "deviation": deviation,
        "lateral_displacement": displacement,
        "lateral_displacement_formula": displacement_formula,
        "path_length": path_length,
        "optical_path": optical_path,
        "critical_angle_entry": critical_entry,
        "apparent_shift": float(thickness * (1.0 - n_in / n_slab)),
        "apparent_thickness": float(thickness * n_in / n_slab),
    }


# ---------------------------------------------------------------------
# 2. APPARENT DEPTH  (point object under a flat surface)
# ---------------------------------------------------------------------
#   * The surface is the line y = 0. The object sits at (0, -h) in the
#     medium BELOW (index n_b). The observer is in the medium ABOVE (n_a).
#   * A ray leaves the object at angle phi_w from the vertical, reaches the
#     surface at x = h tan(phi_w) and leaves at phi_a:
#                  n_b sin(phi_w) = n_a sin(phi_a)
#   * Extending the emerging ray backwards to the vertical line through
#     the object gives the depth the eye "reads" along that ray:
#                  h_app(phi) = h tan(phi_w) / tan(phi_a)
#     which tends to the textbook value  h n_a / n_b  for near-normal viewing.
#   * Neighbouring rays do not meet at one point. They envelop a caustic:
#         y_c = -h (n_a/n_b) cos^3(phi_a) / cos^3(phi_w)
#         x_c = x_hit - |y_c| tan(phi_a)
#     This is the apparent position seen when looking along that ray.
#   * If n_b sin(phi_w) > n_a the ray is totally internally reflected.
# ---------------------------------------------------------------------

TOP_Y = 14.0          # emerging rays are drawn up to this height


def trace_apparent_ray(depth, n_b, n_a, phi_deg):
    """One ray from the object at angle phi (degrees, signed)."""

    phi = np.radians(phi_deg)
    h = float(depth)

    d = np.array([np.sin(phi), np.cos(phi)])
    hit = np.array([h * np.tan(phi), 0.0])
    obj = np.array([0.0, -h])
    normal = np.array([0.0, 1.0])

    out = refract(d, normal, n_b, n_a)

    base = {"angle_in": float(phi_deg), "hit": _pt(hit)}

    if out is None:
        reflected = np.array([d[0], -d[1]])
        end = hit + reflected * 8.0
        return {
            **base,
            "status": "Total internal reflection",
            "tir": True,
            "angle_out": None,
            "points": [_pt(obj), _pt(hit), _pt(end)],
            "back_extension": None,
            "apparent_depth": None,
            "caustic": None,
        }

    out = _unit(out)
    phi_a = np.arctan2(out[0], out[1])        # signed angle from the vertical

    # drawn path: up to TOP_Y
    s_top = (TOP_Y - hit[1]) / out[1]
    top = hit + out * s_top

    # backward extension to the vertical line through the object
    if abs(phi_deg) < 1e-9:
        apparent = h * n_a / n_b
        axis_point = np.array([0.0, -apparent])
    else:
        apparent = h * np.tan(phi) / np.tan(phi_a)
        axis_point = np.array([0.0, -apparent])

    # exact caustic point (the apparent position for this viewing direction)
    cos_a, cos_w = np.cos(phi_a), np.cos(phi)
    y_c = -h * (n_a / n_b) * cos_a ** 3 / cos_w ** 3
    x_c = hit[0] - abs(y_c) * np.tan(phi_a)

    return {
        **base,
        "status": "Refracted out",
        "tir": False,
        "angle_out": float(np.degrees(phi_a)),
        "points": [_pt(obj), _pt(hit), _pt(top)],
        "back_extension": [_pt(hit), _pt(axis_point)],
        "apparent_depth": float(apparent),
        "caustic": [float(x_c), float(y_c)],
    }


def simulate_apparent_depth(depth, n_below, n_above=1.0, max_angle=45.0,
                            ray_count=7):
    depth = float(depth)
    max_angle = float(max_angle)

    if not np.isfinite(depth) or not (0.5 <= depth <= 50.0):
        raise ValueError("Depth must be between 0.5 and 50.")
    n_b = _require_index("n_below", n_below)
    n_a = _require_index("n_above", n_above)
    if not np.isfinite(max_angle) or not (5.0 <= max_angle <= 80.0):
        raise ValueError("Maximum ray angle must be between 5 and 80 degrees.")
    if int(ray_count) != ray_count or not (1 <= int(ray_count) <= 15):
        raise ValueError("ray_count must be a whole number from 1 to 15.")
    ray_count = int(ray_count)

    angles = [0.0] if ray_count == 1 else list(np.linspace(-max_angle, max_angle, ray_count))

    rays = [trace_apparent_ray(depth, n_b, n_a, float(a)) for a in angles]

    critical = float(np.degrees(np.arcsin(n_a / n_b))) if n_b > n_a else None

    # dense caustic curve for plotting (only angles that refract out)
    curve = []
    for a in np.arange(-max_angle, max_angle + 1e-9, 0.5):
        r = trace_apparent_ray(depth, n_b, n_a, float(a))
        if r["caustic"] is not None:
            curve.append(r["caustic"])

    paraxial = depth * n_a / n_b

    valid_rays = [r for r in rays if r["apparent_depth"] is not None]
    widest = max(valid_rays, key=lambda r: abs(r["angle_in"])) if valid_rays else None

    return {
        "valid": True,
        "depth": depth,
        "n_below": n_b,
        "n_above": n_a,
        "max_angle": max_angle,
        "critical_angle": critical,
        "paraxial_apparent_depth": float(paraxial),
        "ratio": float(n_a / n_b),
        "apparent_shift": float(depth - paraxial),
        "widest_apparent_depth": None if widest is None else widest["apparent_depth"],
        "widest_angle": None if widest is None else widest["angle_in"],
        "tir_ray_count": int(sum(1 for r in rays if r["tir"])),
        "rays": rays,
        "caustic_curve": curve,
    }
