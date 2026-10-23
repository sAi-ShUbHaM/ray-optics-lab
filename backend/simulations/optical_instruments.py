import numpy as np

from simulations.lens_system import simulate_lens_system


# ---------------------------------------------------------------------
# Optical instruments built from thin lenses (paraxial model)
# ---------------------------------------------------------------------
#   * Light travels left to right (+x). The objective (first lens) is at
#     x = 0; the eyepiece is at x = separation.
#   * Convex lens f > 0, concave lens f < 0.
#   * A paraxial ray has height y and slope m = dy/dx.
#       free travel L:   y -> y + m L
#       thin lens f:     m -> m - y / f
#
# TELESCOPE  (object at infinity, described by a field angle)
#   Keplerian: convex objective + convex eyepiece,  M = -f_o / f_e (inverted)
#   Galilean:  convex objective + concave eyepiece, M = +f_o / |f_e| (upright)
#   Normal adjustment: separation = f_o + f_e (f_e signed), final image at
#   infinity, exit rays parallel.
#   Angular magnification M = (exit slope of the chief ray) / (entry slope).
#
# MICROSCOPE (compound, finite object just outside the objective's focus)
#   Objective lateral magnification  m_o = -v_o / u_o
#   Eyepiece angular magnification   M_e = D / f_e         (image at infinity)
#                                    M_e = 1 + D / f_e     (image at D)
#   Total angular magnification      M = |m_o| M_e
#   For a final image at infinity this equals (L / f_o)(D / f_e), where
#   L = separation - f_o - f_e is the "tube length" between the inner
#   focal points. D is the near point (default 25).
# ---------------------------------------------------------------------

INFINITY_SLOPE = 1e-12
INFINITY_LIMIT = 1e5


def _pt(p):
    return [float(p[0]), float(p[1])]


def _require_positive(name, value):
    value = float(value)
    if not np.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a number greater than zero.")
    return value


# =====================================================================
# TELESCOPE
# =====================================================================

def simulate_telescope(
    kind,
    objective_focal_length,
    eyepiece_focal_length,
    field_angle,
    aperture,
    defocus=0.0,
    ray_count=3,
):
    """
    field_angle : angle of the distant object above the axis, in degrees.
    aperture    : half-height of the objective (rays fill +/- aperture).
    defocus     : added to the normal-adjustment separation (0 = afocal).
    """

    kind = str(kind).lower()
    if kind not in ("keplerian", "galilean"):
        raise ValueError("kind must be 'keplerian' or 'galilean'.")

    f_o = _require_positive("Objective focal length", objective_focal_length)
    f_e_mag = _require_positive("Eyepiece focal length", eyepiece_focal_length)
    a = _require_positive("Aperture", aperture)

    angle = float(field_angle)
    if not np.isfinite(angle) or not (0 < angle < 45):
        raise ValueError("Field angle must be between 0 and 45 degrees.")

    defocus = float(defocus)
    if not np.isfinite(defocus):
        raise ValueError("Defocus must be a finite number.")

    if int(ray_count) != ray_count or not (1 <= int(ray_count) <= 9):
        raise ValueError("ray_count must be a whole number from 1 to 9.")
    ray_count = int(ray_count)

    f_e = f_e_mag if kind == "keplerian" else -f_e_mag

    normal_separation = f_o + f_e
    sep = normal_separation + defocus

    if normal_separation <= 0:
        raise ValueError(
            "For a Galilean telescope the objective focal length must be "
            "longer than the eyepiece focal length."
        )
    if sep <= 0:
        raise ValueError("The defocus is too negative: the lenses would overlap.")

    m_field = -float(np.tan(np.radians(angle)))   # object above axis: rays go down

    # --- one ray: pass through the objective at height y_obj with slope m ---
    def through(y_obj, m):
        m1 = m - y_obj / f_o                  # after objective
        y2 = y_obj + m1 * sep                 # height at eyepiece
        m2 = m1 - y2 / f_e                    # after eyepiece
        return {"y_obj": y_obj, "m_in": m, "m1": m1, "y2": y2, "m2": m2}

    def intersection(x0, y1_at_x0, y2_at_x0, s1, s2):
        """Meeting point of two lines y_i = y_i(x0) + s_i (x - x0)."""
        ds = s1 - s2
        if abs(ds) < INFINITY_SLOPE:
            return None
        x = x0 + (y2_at_x0 - y1_at_x0) / ds
        if abs(x - x0) > INFINITY_LIMIT:
            return None
        return x, y1_at_x0 + s1 * (x - x0)

    # chief ray (through the objective centre) and a marginal ray
    chief = through(0.0, m_field)
    marginal = through(a, m_field)

    # intermediate image: where the rays leaving the objective meet
    inter = intersection(0.0, 0.0, a, chief["m1"], marginal["m1"])
    inter_x, inter_y = inter if inter else (None, None)

    # final image: where the rays leaving the eyepiece meet
    final = intersection(sep, chief["y2"], marginal["y2"],
                         chief["m2"], marginal["m2"])

    if final is None:
        final_info = {"at_infinity": True, "x": None, "height": None, "kind": "At infinity"}
    else:
        fx, fy = final
        final_info = {
            "at_infinity": False,
            "x": float(fx),
            "height": float(fy),
            "kind": "Real" if fx > sep else "Virtual",
        }

    angular_magnification = chief["m2"] / m_field

    # exit pupil = image of the objective formed by the eyepiece
    inv_v = 1.0 / f_e - 1.0 / sep          # object (objective) at distance sep
    if abs(inv_v) > 1e-12:
        v_pupil = 1.0 / inv_v
        pupil_scale = abs(v_pupil / sep)
        exit_pupil = {
            "diameter": float(2 * a * pupil_scale),
            "distance_from_eyepiece": float(v_pupil),
            "real": bool(v_pupil > 0),
        }
    else:
        exit_pupil = {"diameter": None, "distance_from_eyepiece": None, "real": False}

    # --- ray drawing ---
    start_x = -max(20.0, 1.2 * f_o * 0.15)
    x_end = sep + max(30.0, 3.0 * f_e_mag)

    heights = [0.0] if ray_count == 1 else list(np.linspace(-a, a, ray_count))

    rays = []
    for bundle, m in (("axial", 0.0), ("off_axis", m_field)):
        for y_obj in heights:
            r = through(float(y_obj), m)
            y0 = y_obj + m * start_x              # line y = y_obj + m x, at x = start_x
            y_end = r["y2"] + r["m2"] * (x_end - sep)
            points = [[start_x, y0], [0.0, y_obj], [sep, r["y2"]], [x_end, y_end]]

            extensions = []
            if not final_info["at_infinity"] and bundle == "off_axis":
                # dashed backward extension to the final virtual image
                if final_info["x"] < sep:
                    extensions.append([[sep, r["y2"]],
                                       [final_info["x"], final_info["height"]]])

            rays.append({
                "bundle": bundle,
                "entry_height": float(y_obj),
                "points": [_pt(p) for p in points],
                "extensions": [[_pt(p), _pt(q)] for p, q in extensions],
                "exit_slope": float(r["m2"]),
                "height_at_eyepiece": float(r["y2"]),
            })

    # intermediate image kind for the eyepiece
    if inter is None:
        inter_kind = "At infinity"
    else:
        inter_kind = "Real object for eyepiece" if inter_x < sep else "Virtual object for eyepiece"

    return {
        "valid": True,
        "instrument": "telescope",
        "kind": kind,
        "objective_focal_length": f_o,
        "eyepiece_focal_length": f_e,
        "separation": sep,
        "normal_separation": normal_separation,
        "defocus": defocus,
        "normal_adjustment": bool(abs(defocus) < 1e-12),
        "field_angle": angle,
        "aperture": a,
        "angular_magnification": float(angular_magnification),
        "orientation": "Upright" if angular_magnification > 0 else "Inverted",
        "exit_angle": float(np.degrees(np.arctan(chief["m2"]))),
        "intermediate_image": None if inter is None else {
            "x": float(inter_x), "height": float(inter_y), "kind": inter_kind},
        "final_image": final_info,
        "exit_pupil": exit_pupil,
        "tube_length": sep,
        "start_x": start_x,
        "x_end": x_end,
        "rays": rays,
    }


# =====================================================================
# MICROSCOPE
# =====================================================================

def simulate_microscope(
    objective_focal_length,
    eyepiece_focal_length,
    object_distance,
    object_height,
    focus="infinity",
    near_point=25.0,
):
    """
    Compound microscope with the eyepiece placed automatically so that the
    final image is at infinity (relaxed eye) or at the near point D.
    """

    focus = str(focus).lower()
    if focus not in ("infinity", "near_point"):
        raise ValueError("focus must be 'infinity' or 'near_point'.")

    f_o = _require_positive("Objective focal length", objective_focal_length)
    f_e = _require_positive("Eyepiece focal length", eyepiece_focal_length)
    d = _require_positive("Object distance", object_distance)
    h = _require_positive("Object height", object_height)
    D = _require_positive("Near point", near_point)

    if d <= f_o * (1 + 1e-9):
        raise ValueError(
            "The object must be beyond the objective's focal point so the "
            "objective forms a real image."
        )

    # objective: 1/v = 1/f + 1/u with u = -d
    v_o = 1.0 / (1.0 / f_o - 1.0 / d)
    m_o = -v_o / d

    # eyepiece object distance (intermediate image to eyepiece)
    if focus == "infinity":
        u_e = f_e
        eyepiece_magnification = D / f_e
    else:
        u_e = D * f_e / (D + f_e)
        eyepiece_magnification = 1.0 + D / f_e

    separation = v_o + u_e

    result = simulate_lens_system(
        [
            {"lens_type": "convex", "focal_length": f_o},
            {"lens_type": "convex", "focal_length": f_e},
        ],
        [separation],
        d,
        h,
    )

    total = abs(m_o) * eyepiece_magnification
    tube_length = separation - f_o - f_e

    result["instrument"] = {
        "kind": "microscope",
        "focus": focus,
        "near_point": D,
        "objective_focal_length": f_o,
        "eyepiece_focal_length": f_e,
        "separation": separation,
        "intermediate_image_x": v_o,
        "objective_magnification": m_o,
        "eyepiece_magnification": eyepiece_magnification,
        "angular_magnification": total,
        "tube_length": tube_length,
        "approx_magnification": (tube_length / f_o) * (D / f_e),
    }

    return result
