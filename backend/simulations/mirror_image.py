import numpy as np


# ---------------------------------------------------------------------
# Coordinate system used everywhere in the mirror-image module
# ---------------------------------------------------------------------
#   * Light travels from left to right (towards +x).
#   * The mirror vertex (pole P) is at x = 0.
#   * Concave mirror: centre of curvature C = (-R, 0), focus F = (-R/2, 0)
#   * Convex  mirror: centre of curvature C = (+R, 0), focus F = (+R/2, 0)
#   * The object arrow stands on the axis at x = -object_distance.
#
# Cartesian sign convention (distances measured from P, +x = direction
# of the incident light):
#   object distance  u < 0          (object is in front of the mirror)
#   concave focal    f < 0,  convex f > 0
#   real image       v < 0           (in front of the mirror)
#   virtual image    v > 0           (behind the mirror)
#   Mirror equation:  1/f = 1/v + 1/u        Magnification: m = -v/u
# ---------------------------------------------------------------------


def _point(p):
    return [float(p[0]), float(p[1])]


def calculate_mirror_image(
    mirror_type,
    radius,
    object_distance,
    object_height,
):
    """
    Textbook (paraxial) spherical-mirror image formation.

    Returns image properties plus four textbook principal rays.
    The principal rays are a schematic construction: they reflect at the
    paraxial plane x = 0, NOT at the true spherical surface.
    """

    mirror_type = str(mirror_type).lower()
    radius = float(radius)
    object_distance = float(object_distance)
    object_height = float(object_height)

    if mirror_type not in ("concave", "convex"):
        raise ValueError("mirror_type must be 'concave' or 'convex'.")

    for name, value in (
        ("Radius", radius),
        ("Object distance", object_distance),
        ("Object height", object_height),
    ):
        if not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")

    if radius <= 0:
        raise ValueError("Radius must be greater than zero.")

    if object_distance <= 0:
        raise ValueError("Object distance must be greater than zero.")

    if object_height <= 0:
        raise ValueError("Object height must be greater than zero.")

    # Cartesian sign convention
    u = -object_distance

    if mirror_type == "concave":
        f = -radius / 2.0
        center_x = -radius
    else:
        f = radius / 2.0
        center_x = radius

    # Mirror equation: 1/f = 1/v + 1/u   ->   1/v = 1/f - 1/u
    denominator = (1.0 / f) - (1.0 / u)

    if abs(denominator) < 1e-12:
        # Object at the focus of a concave mirror: image at infinity.
        v = None
        magnification = None
        image_height = None
        image_at_infinity = True
    else:
        v = 1.0 / denominator
        magnification = -v / u
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

        image_type = "Real" if v < 0 else "Virtual"
        orientation = "Upright" if image_height > 0 else "Inverted"

        mag_abs = abs(magnification)

        if np.isclose(mag_abs, 1.0, atol=1e-9):
            size = "Same Size"
        elif mag_abs > 1.0:
            size = "Enlarged"
        else:
            size = "Diminished"

        image_position = classify_image_position(mirror_type, v, radius)

    principal_rays = generate_principal_rays(
        mirror_type=mirror_type,
        radius=radius,
        object_distance=object_distance,
        object_height=object_height,
        image_point=image_point,
    )

    return {
        "valid": True,
        "mirror_type": mirror_type,
        "radius": radius,
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
            mirror_type, object_distance, radius
        ),
        "image_position": image_position,
        "image_at_infinity": image_at_infinity,
        "object_point": object_point,
        "object_base": object_base,
        "image_point": image_point,
        "image_base": image_base,
        "center": [center_x, 0.0],
        "focus": [f, 0.0],
        "ray_model": "paraxial_textbook",
        "reflection_plane_x": 0.0,
        "principal_rays": principal_rays,
    }


def classify_object_position(mirror_type, distance, radius):
    if mirror_type == "convex":
        return "Between P and Infinity"

    if np.isclose(distance, radius, atol=1e-9):
        return "At C"

    if np.isclose(distance, radius / 2.0, atol=1e-9):
        return "At F"

    if distance > radius:
        return "Beyond C"

    if distance > radius / 2.0:
        return "Between F and C"

    return "Between P and F"


def classify_image_position(mirror_type, v, radius):
    # Virtual images (v > 0) are behind the mirror.
    if v > 0:
        if mirror_type == "convex":
            return "Behind the mirror, between P and F"
        return "Behind the mirror"

    distance = abs(v)

    if np.isclose(distance, radius, atol=1e-9):
        return "At C"

    if np.isclose(distance, radius / 2.0, atol=1e-9):
        return "At F"

    if distance > radius:
        return "Beyond C"

    if distance > radius / 2.0:
        return "Between F and C"

    return "Between P and F"


def _unit(vector):
    vector = np.asarray(vector, dtype=float)
    length = float(np.linalg.norm(vector))
    if length < 1e-12:
        return None
    return vector / length


def generate_principal_rays(
    mirror_type,
    radius,
    object_distance,
    object_height,
    image_point,
):
    """
    Standard textbook principal rays, all starting at the object tip O.

    All four rays reflect at the paraxial plane x = 0 (the vertical line
    through the pole). That is the usual textbook simplification, and it
    is why every reflected ray (or its backward extension) passes through
    the image tip computed from the mirror equation.

    Rays:
      parallel : parallel to the axis  -> through F (concave) /
                                          appears to come from F (convex)
      focal    : through/at F          -> reflects parallel to the axis
      pole     : strikes the pole P    -> reflects at an equal angle
      centre   : along a radius (via C)-> reflects back along itself

    A ray is left out when its construction is degenerate
    (e.g. the focal ray when the object is exactly at F).
    """

    R = float(radius)
    d = float(object_distance)
    h = float(object_height)
    concave = mirror_type == "concave"

    F = np.array([-R / 2.0 if concave else R / 2.0, 0.0])
    C = np.array([-R if concave else R, 0.0])
    O = np.array([-d, h])
    P = np.array([0.0, 0.0])

    tip = None if image_point is None else np.array(image_point, dtype=float)
    real_image = tip is not None and tip[0] < 0
    virtual_image = tip is not None and tip[0] > 0

    base_reach = max(2.0 * R, 0.6 * d, 10.0)

    def build(name, ray_type, description, hit, direction, incident_extension):
        hit = np.asarray(hit, dtype=float)
        direction = _unit(direction)
        if direction is None:
            return None

        length = base_reach
        if real_image:
            distance_to_image = float(np.linalg.norm(tip - hit))
            ahead = float(np.dot(tip - hit, direction)) > 0
            if ahead:
                # Run a little past the image so the crossing is visible.
                length = distance_to_image * 1.2 + 2.0

        reflected_end = hit + direction * length

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
            "reflected": [_point(hit), _point(reflected_end)],
            "backward_extension": (
                [_point(hit), _point(tip)] if virtual_image else None
            ),
            "hit_point": _point(hit),
        }

    rays = []

    # 1. Parallel ray ---------------------------------------------------
    hit = np.array([0.0, h])
    direction = (F - hit) if concave else (hit - F)
    rays.append(
        build(
            "Parallel ray",
            "parallel",
            "Parallel to the axis, reflects through F"
            if concave
            else "Parallel to the axis, reflects as if from F",
            hit,
            direction,
            None,
        )
    )

    # 2. Focal ray ------------------------------------------------------
    # Line through O and F, extended to the plane x = 0.
    denom = O[0] - F[0]
    if abs(denom) > 1e-9:
        y_hit = h * (0.0 - F[0]) / denom
        hit = np.array([0.0, y_hit])
        if concave:
            extension = [O, F] if d < R / 2.0 else None
            text = (
                "Through F, reflects parallel to the axis"
                if d > R / 2.0
                else "Appears to come from F, reflects parallel to the axis"
            )
        else:
            extension = [hit, F]
            text = "Aimed at F, reflects parallel to the axis"
        rays.append(
            build("Focal ray", "focal", text, hit, [-1.0, 0.0], extension)
        )

    # 3. Pole ray -------------------------------------------------------
    incident_direction = _unit(P - O)
    reflected_direction = [-incident_direction[0], incident_direction[1]]
    rays.append(
        build(
            "Pole ray",
            "pole",
            "Strikes the pole P, reflects at an equal angle",
            P,
            reflected_direction,
            None,
        )
    )

    # 4. Centre-of-curvature ray ---------------------------------------
    # Line through O and C, extended to x = 0. It meets the mirror along
    # a radius, so it reflects straight back along itself.
    denom = O[0] - C[0]
    if abs(denom) > 1e-9:
        y_hit = h * (0.0 - C[0]) / denom
        hit = np.array([0.0, y_hit])
        if concave:
            extension = [O, C] if d < R else None
        else:
            extension = [hit, C]
        rays.append(
            build(
                "Centre ray",
                "centre",
                "Along a radius through C, reflects back along itself",
                hit,
                O - hit,
                extension,
            )
        )

    return [ray for ray in rays if ray is not None]
