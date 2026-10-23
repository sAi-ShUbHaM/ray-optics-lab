import numpy as np


# ---------------------------------------------------------------------
# Coordinate system used by the thin-lens module
# ---------------------------------------------------------------------
#   * Light travels from left to right (towards +x).
#   * The thin lens is the vertical plane x = 0; its optical centre is
#     the origin P = (0, 0).
#   * The object arrow stands on the axis at x = -object_distance.
#   * First focal point  F1 = (-f, 0)   (object side for a convex lens)
#   * Second focal point F2 = (+f, 0)   (far side for a convex lens)
#
# Cartesian sign convention (distances measured from the lens):
#   object distance  u < 0            (object on the incoming-light side)
#   convex lens      f > 0,  concave lens f < 0
#   real image       v > 0            (on the far side of the lens)
#   virtual image    v < 0            (on the same side as the object)
#
#   Thin-lens equation:  1/v - 1/u = 1/f
#   Magnification:       m = v/u       image height = m * object height
#
# The principal rays below are the standard textbook (paraxial)
# construction: every ray bends at the plane x = 0.
# ---------------------------------------------------------------------


def _point(p):
    return [float(p[0]), float(p[1])]


def _unit(vector):
    vector = np.asarray(vector, dtype=float)
    length = float(np.linalg.norm(vector))
    if length < 1e-12:
        return None
    return vector / length


def calculate_lens_image(
    lens_type,
    focal_length,
    object_distance,
    object_height,
):
    """
    Thin-lens image formation for a convex or concave lens.

    focal_length is the focal-length MAGNITUDE (> 0); its sign comes
    from lens_type (convex -> +f, concave -> -f).
    """

    lens_type = str(lens_type).lower()
    focal_length = float(focal_length)
    object_distance = float(object_distance)
    object_height = float(object_height)

    if lens_type not in ("convex", "concave"):
        raise ValueError("lens_type must be 'convex' or 'concave'.")

    for name, value in (
        ("Focal length", focal_length),
        ("Object distance", object_distance),
        ("Object height", object_height),
    ):
        if not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")

    if focal_length <= 0:
        raise ValueError("Focal length must be greater than zero.")

    if object_distance <= 0:
        raise ValueError("Object distance must be greater than zero.")

    if object_height <= 0:
        raise ValueError("Object height must be greater than zero.")

    f_mag = focal_length
    f = f_mag if lens_type == "convex" else -f_mag
    u = -object_distance

    # Thin-lens equation: 1/v = 1/f + 1/u
    inverse_v = (1.0 / f) + (1.0 / u)

    if abs(inverse_v) < 1e-12:
        # Object at the first focal point of a convex lens.
        v = None
        magnification = None
        image_height = None
        image_at_infinity = True
    else:
        v = 1.0 / inverse_v
        magnification = v / u
        image_height = magnification * object_height
        image_at_infinity = False

    object_point = [-object_distance, object_height]
    object_base = [-object_distance, 0.0]

    if image_at_infinity:
        image_point = None
        image_base = None
        image_type = "At Infinity"
        orientation = "Not finite"
        size = "Not finite"
        image_position = "At infinity"
    else:
        image_point = [v, image_height]
        image_base = [v, 0.0]

        image_type = "Real" if v > 0 else "Virtual"
        orientation = "Upright" if image_height > 0 else "Inverted"

        mag_abs = abs(magnification)

        if np.isclose(mag_abs, 1.0, atol=1e-9):
            size = "Same Size"
        elif mag_abs > 1.0:
            size = "Enlarged"
        else:
            size = "Diminished"

        image_position = classify_image_position(lens_type, v, f_mag)

    principal_rays = generate_principal_rays(
        lens_type=lens_type,
        focal_length=f_mag,
        object_distance=object_distance,
        object_height=object_height,
        image_point=image_point,
    )

    return {
        "valid": True,
        "lens_type": lens_type,
        "focal_length": f,
        "object_distance": object_distance,
        "object_height": object_height,
        "image_distance": abs(v) if v is not None else None,
        "signed_image_distance": v,
        "image_height": image_height,
        "magnification": magnification,
        "image_type": image_type,
        "orientation": orientation,
        "size": size,
        "object_position": classify_object_position(
            lens_type, object_distance, f_mag
        ),
        "image_position": image_position,
        "image_at_infinity": image_at_infinity,
        "object_point": object_point,
        "object_base": object_base,
        "image_point": image_point,
        "image_base": image_base,
        "focus_1": [-f, 0.0],
        "focus_2": [f, 0.0],
        "ray_model": "thin_lens_paraxial",
        "lens_plane_x": 0.0,
        "principal_rays": principal_rays,
    }


def classify_object_position(lens_type, distance, f_mag):
    if lens_type == "concave":
        return "Anywhere in front of the lens"

    if np.isclose(distance, 2 * f_mag, atol=1e-9):
        return "At 2F"

    if np.isclose(distance, f_mag, atol=1e-9):
        return "At F"

    if distance > 2 * f_mag:
        return "Beyond 2F"

    if distance > f_mag:
        return "Between F and 2F"

    return "Between the lens and F"


def classify_image_position(lens_type, v, f_mag):
    if v < 0:
        # Virtual image: same side as the object.
        if lens_type == "concave":
            return "Same side as object, between the lens and F"
        return "Same side as object"

    # Real image on the far side.
    if np.isclose(v, 2 * f_mag, atol=1e-9):
        return "At 2F"

    if np.isclose(v, f_mag, atol=1e-9):
        return "At F"

    if v > 2 * f_mag:
        return "Beyond 2F"

    if v > f_mag:
        return "Between F and 2F"

    return "Between the lens and F"


def generate_principal_rays(
    lens_type,
    focal_length,
    object_distance,
    object_height,
    image_point,
):
    """
    Three standard principal rays from the object tip O, all bending at
    the plane x = 0:

      parallel : parallel to the axis -> through F2 (convex) /
                                         appears to come from F2 (concave)
      central  : through the optical centre, undeviated
      focal    : through F1 (convex) / aimed at F1 (concave)
                 -> emerges parallel to the axis

    The focal ray is left out when its construction is degenerate
    (convex lens with the object exactly at F).
    """

    f_mag = float(focal_length)
    d = float(object_distance)
    h = float(object_height)
    convex = lens_type == "convex"
    f = f_mag if convex else -f_mag

    O = np.array([-d, h])
    P = np.array([0.0, 0.0])
    F1 = np.array([-f, 0.0])
    F2 = np.array([f, 0.0])

    tip = None if image_point is None else np.array(image_point, dtype=float)
    real_image = tip is not None and tip[0] > 0
    virtual_image = tip is not None and tip[0] < 0

    base_reach = max(2.0 * f_mag, 0.6 * d, 10.0)

    def build(name, ray_type, description, hit, direction, incident_extension):
        hit = np.asarray(hit, dtype=float)
        direction = _unit(direction)
        if direction is None:
            return None

        length = base_reach
        if real_image:
            distance_to_image = float(np.linalg.norm(tip - hit))
            if float(np.dot(tip - hit, direction)) > 0:
                # Run a little past the image so the crossing is visible.
                length = distance_to_image * 1.2 + 2.0

        refracted_end = hit + direction * length

        return {
            "name": name,
            "type": ray_type,
            "description": description,
            "incident": [_point(O), _point(hit)],
            "incident_extension": (
                [_point(incident_extension[0]), _point(incident_extension[1])]
                if incident_extension is not None
                else None
            ),
            "refracted": [_point(hit), _point(refracted_end)],
            "backward_extension": (
                [_point(hit), _point(tip)] if virtual_image else None
            ),
            "hit_point": _point(hit),
        }

    rays = []

    # 1. Parallel ray ---------------------------------------------------
    hit = np.array([0.0, h])
    direction = (F2 - hit) if convex else (hit - F2)
    rays.append(
        build(
            "Parallel ray",
            "parallel",
            "Parallel to the axis, refracts through F"
            if convex
            else "Parallel to the axis, refracts as if from F",
            hit,
            direction,
            None,
        )
    )

    # 2. Central ray ----------------------------------------------------
    rays.append(
        build(
            "Central ray",
            "central",
            "Through the optical centre, goes straight on",
            P,
            P - O,
            None,
        )
    )

    # 3. Focal ray ------------------------------------------------------
    # Line through O and F1, extended to the plane x = 0.
    denom = O[0] - F1[0]
    if abs(denom) > 1e-9:
        y_hit = h * (0.0 - F1[0]) / denom
        hit = np.array([0.0, y_hit])

        if convex:
            if d > f_mag:
                text = "Through F, emerges parallel to the axis"
                extension = None
            else:
                text = "Appears to come from F, emerges parallel to the axis"
                extension = [O, F1]
        else:
            text = "Aimed at F, emerges parallel to the axis"
            extension = [hit, F1]

        rays.append(
            build("Focal ray", "focal", text, hit, [1.0, 0.0], extension)
        )

    return [ray for ray in rays if ray is not None]
