import numpy as np


# ---------------------------------------------------------------------
# Thin-lens combinations (paraxial / textbook model)
# ---------------------------------------------------------------------
#   * Light travels left to right (+x). Lens 1 is at x = 0; lens k+1 is
#     placed `separations[k]` to the right of lens k.
#   * The object arrow stands on the axis at x = -object_distance.
#   * Convex lens f > 0, concave lens f < 0 (signed focal lengths).
#
# How the model works
# -------------------
# A paraxial ray is described by its height y and slope m (dy/dx).
#   * travelling a distance L:   y -> y + m L,        m unchanged
#   * passing a thin lens:       y unchanged,         m -> m - y / f
# Three rays from the object tip are traced through every lens:
#   parallel : starts parallel to the axis
#   central  : aimed at the centre of lens 1
#   focal    : aimed at the first focal point of lens 1
# After each lens, the parallel and central rays meet at that stage's
# image tip. If a stage's image lies BEHIND the next lens, that lens
# simply receives converging rays (a virtual object), and the same
# arithmetic still works.
#
# System matrix (ABCD) for the whole combination:
#     power 1/f = -C,   back focal point at  x_last - A/C
# ---------------------------------------------------------------------

INFINITY_LIMIT = 1e5
MAX_LENSES = 4


def _pt(p):
    return [float(p[0]), float(p[1])]


def _signed_focal_length(lens):
    lens_type = str(lens.get("lens_type", "")).lower()
    f = float(lens.get("focal_length", float("nan")))

    if lens_type not in ("convex", "concave"):
        raise ValueError("Each lens_type must be 'convex' or 'concave'.")
    if not np.isfinite(f) or f <= 0:
        raise ValueError("Each focal length must be a number greater than zero.")

    return f if lens_type == "convex" else -f


def _trace(x0, y0, slope, xs, fs, x_end):
    """
    Trace one ray through all lenses.
    Returns (points, records) where records[k] holds the ray state at
    lens k: x, y, slope before and slope after.
    """
    x, y, m = x0, y0, slope
    points = [[x0, y0]]
    records = []

    for xk, fk in zip(xs, fs):
        y = y + m * (xk - x)
        x = xk
        m_in = m
        m = m - y / fk
        records.append({"x": xk, "y": y, "m_in": m_in, "m_out": m})
        points.append([xk, y])

    points.append([x_end, y + m * (x_end - x)])
    return points, records


def _system_matrix(fs, separations):
    """ABCD matrix acting on (height, slope), first lens applied first."""
    M = np.eye(2)
    for k, fk in enumerate(fs):
        lens = np.array([[1.0, 0.0], [-1.0 / fk, 1.0]])
        M = lens @ M
        if k < len(separations):
            move = np.array([[1.0, separations[k]], [0.0, 1.0]])
            M = move @ M
    return M


def simulate_lens_system(lenses, separations, object_distance, object_height):
    if not isinstance(lenses, (list, tuple)) or not (2 <= len(lenses) <= MAX_LENSES):
        raise ValueError(f"Provide between 2 and {MAX_LENSES} lenses.")

    if not isinstance(separations, (list, tuple)) or len(separations) != len(lenses) - 1:
        raise ValueError("Provide exactly one separation between each pair of lenses.")

    fs = [_signed_focal_length(lens) for lens in lenses]
    kinds = [str(lens["lens_type"]).lower() for lens in lenses]

    separations = [float(s) for s in separations]
    object_distance = float(object_distance)
    object_height = float(object_height)

    for s in separations:
        if not np.isfinite(s) or s < 0:
            raise ValueError("Separations must be finite numbers, zero or greater.")

    if not np.isfinite(object_distance) or object_distance <= 0:
        raise ValueError("Object distance must be greater than zero.")

    if not np.isfinite(object_height) or object_height <= 0:
        raise ValueError("Object height must be greater than zero.")

    # lens positions
    xs = [0.0]
    for s in separations:
        xs.append(xs[-1] + s)

    h = object_height
    d = object_distance
    ox = -d

    # --- the three rays (starting slopes) ---------------------------------
    starts = [
        ("Parallel ray", "parallel", 0.0,
         "Parallel to the axis before the first lens"),
        ("Central ray", "central", -h / d,
         "Aimed at the centre of the first lens"),
    ]

    f1 = fs[0]
    focal_degenerate = abs(d - f1) < 1e-9
    if not focal_degenerate:
        starts.append((
            "Focal ray", "focal", -h / (d - f1),
            "Aimed along the line through the first focal point of lens 1",
        ))

    # --- provisional x_end, refined after the final image is known ---------
    traces = {}
    for name, rtype, slope, _ in starts:
        pts, rec = _trace(ox, h, slope, xs, fs, xs[-1] + 30.0)
        traces[rtype] = (pts, rec)

    pa = traces["parallel"][1]
    pc = traces["central"][1]

    # --- image of every stage = meeting point of parallel & central rays ----
    stages = []
    prev_x = ox
    prev_height = h
    prev_infinite = False

    for k in range(len(fs)):
        a, c = pa[k], pc[k]
        dm = a["m_out"] - c["m_out"]

        at_infinity = abs(dm) < 1e-12
        x_img = y_img = None

        if not at_infinity:
            x_img = a["x"] + (c["y"] - a["y"]) / dm
            y_img = a["y"] + a["m_out"] * (x_img - a["x"])
            if abs(x_img - a["x"]) > INFINITY_LIMIT:
                at_infinity = True
                x_img = y_img = None

        stage = {
            "lens": k + 1,
            "lens_x": xs[k],
            "focal_length": fs[k],
            "object_x": None if prev_infinite else prev_x,
            "object_height": None if prev_infinite else prev_height,
            "object_distance_signed": None if prev_infinite else prev_x - xs[k],
            "object_kind": (
                "At infinity" if prev_infinite
                else ("Real object" if prev_x < xs[k] else "Virtual object")
            ),
            "image_at_infinity": at_infinity,
            "image_x": x_img,
            "image_height": y_img,
            "image_distance_signed": None if at_infinity else x_img - xs[k],
            "magnification": (
                None if (at_infinity or prev_infinite) else y_img / prev_height
            ),
            "image_kind": (
                "At infinity" if at_infinity
                else ("Real" if x_img > xs[k] else "Virtual")
            ),
        }
        stages.append(stage)

        prev_infinite = at_infinity
        if not at_infinity:
            prev_x, prev_height = x_img, y_img

    final = stages[-1]

    # --- where rays are drawn to ---
    if not final["image_at_infinity"] and final["image_x"] > xs[-1]:
        x_end = min(final["image_x"] + 6.0, xs[-1] + 120.0)
    else:
        x_end = xs[-1] + 30.0
    x_end = max(x_end, xs[-1] + 10.0)

    # --- rebuild the traces to x_end and add dashed extensions ---
    rays = []
    for name, rtype, slope, description in starts:
        pts, rec = _trace(ox, h, slope, xs, fs, x_end)
        extensions = []

        for k, st in enumerate(stages):
            if st["image_at_infinity"]:
                continue
            xi, yi = st["image_x"], st["image_height"]
            r = rec[k]

            if xi < xs[k]:
                # virtual image: extend this lens's exit ray backwards
                extensions.append([[xs[k], r["y"]], [xi, yi]])
            elif k + 1 < len(xs) and xi > xs[k + 1]:
                # next lens intercepts the ray before the image forms
                # (virtual object): continue the line to the image point
                nxt = rec[k + 1]
                extensions.append([[xs[k + 1], nxt["y"]], [xi, yi]])

        if rtype == "focal":
            fx = -f1
            if f1 > 0 and fx < ox:
                extensions.append([[ox, h], [fx, 0.0]])
            elif f1 < 0:
                extensions.append([[xs[0], rec[0]["y"]], [fx, 0.0]])

        rays.append({
            "name": name,
            "type": rtype,
            "description": description,
            "points": [_pt(p) for p in pts],
            "extensions": [[_pt(a), _pt(b)] for a, b in extensions],
        })

    # --- system (ABCD) properties ---
    M = _system_matrix(fs, separations)
    A, B, C, D = M[0, 0], M[0, 1], M[1, 0], M[1, 1]
    power = -float(C)

    if abs(C) > 1e-12:
        system_f = 1.0 / power
        back_focal_x = xs[-1] - float(A) / float(C)
        front_focal_x = xs[0] + float(D) / float(C)
        afocal = False
    else:
        system_f = None
        back_focal_x = None
        front_focal_x = None
        afocal = True

    # --- final image summary ---
    if final["image_at_infinity"]:
        image_type = "At Infinity"
        orientation = size = "Not finite"
        total_m = None
        image_point = image_base = None
        position = "At infinity"
    else:
        total_m = final["image_height"] / h
        image_type = final["image_kind"]
        orientation = "Upright" if total_m > 0 else "Inverted"
        mag = abs(total_m)
        if np.isclose(mag, 1.0, atol=1e-9):
            size = "Same Size"
        elif mag > 1.0:
            size = "Enlarged"
        else:
            size = "Diminished"
        image_point = [final["image_x"], final["image_height"]]
        image_base = [final["image_x"], 0.0]
        side = "right of" if final["image_x"] > xs[-1] else "left of"
        position = f"{abs(final['image_x'] - xs[-1]):.2f} {side} the last lens"

    return {
        "valid": True,
        "ray_model": "thin_lens_system_paraxial",
        "lenses": [
            {"index": k + 1, "lens_type": kinds[k], "focal_length": fs[k], "x": xs[k]}
            for k in range(len(fs))
        ],
        "separations": separations,
        "object_distance": d,
        "object_height": h,
        "object_point": [ox, h],
        "object_base": [ox, 0.0],
        "stages": stages,
        "image_type": image_type,
        "orientation": orientation,
        "size": size,
        "image_position": position,
        "image_at_infinity": bool(final["image_at_infinity"]),
        "image_point": image_point,
        "image_base": image_base,
        "total_magnification": total_m,
        "system_power": power,
        "system_focal_length": system_f,
        "back_focal_x": back_focal_x,
        "front_focal_x": front_focal_x,
        "afocal": afocal,
        "x_end": x_end,
        "rays": rays,
    }
