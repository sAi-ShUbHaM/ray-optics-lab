import math

import numpy as np

from physics.refraction import refract
from simulations.prism import (
    LAMBDA_C,
    LAMBDA_D,
    LAMBDA_F,
    _angle_deg,
    _pt,
    _unit,
    _wrap_deg,
    cauchy_coefficients,
    refractive_index,
    wavelength_to_hex,
)


# ---------------------------------------------------------------------
# Two prisms in a row (achromatic and direct-vision combinations)
# ---------------------------------------------------------------------
# The light travels along +x. Every prism is a wedge made of two flat faces.
# A face is described by the angle psi of its normal (the direction light
# travels through it, measured counter-clockwise from +x).
#
#   first face of prism 1:   psi_0 = -theta_1      (theta_1 = angle of incidence)
#   exit face of prism i:    psi_exit = psi_entry + s_i * A_i
#   entry face of prism 2:   the same psi as the exit face of prism 1 (parallel
#                            faces: cemented together or separated by an air gap)
#
# s = +1 means the apex points up (the prism bends light downward, towards its
# base) and s = -1 means the prism is turned over. The deviation of a ray is
#
#       delta = (angle of the incident ray) - (angle of the emergent ray),
#
# so delta > 0 means bent towards the base of an apex-up prism, the same
# convention as the single-prism simulation.
#
# Every refraction uses the vector form of Snell's law with a wavelength
# dependent index (Cauchy model fitted to the glass's n_d and Abbe number,
# exactly as in the single prism simulation).
#
# Thin-prism formulas (small apex angles), used as a guide:
#       delta ~ s1 (n1 - 1) A1 + s2 (n2 - 1) A2
#       dispersion (F - C) ~ s1 (n1 - 1) A1 / V1 + s2 (n2 - 1) A2 / V2
#   achromatic (no dispersion):     A2 = A1 (n1 - 1) V2 / ((n2 - 1) V1)   (turned over)
#   direct vision (no deviation):   A2 = A1 (n1 - 1) / (n2 - 1)           (turned over)
# ---------------------------------------------------------------------

APEX_HEIGHT = 7.0           # every prism is a triangle: its apex is this far above or below the beam,
                            # and its base is the same distance on the other side
MAX_NORMAL_TILT = 80.0      # no face may be tilted more than this from the axis
BEAM_HEIGHT = 0.0           # the beam meets the first face on the axis
SPECTRUM_RANGE = (400.0, 700.0)


class Surface:
    def __init__(self, anchor_x, psi, from_glass, to_glass, name):
        self.psi = float(psi)                                   # radians
        self.normal = np.array([math.cos(psi), math.sin(psi)])
        self.tangent = np.array([-math.sin(psi), math.cos(psi)])
        self.point = np.array([float(anchor_x), BEAM_HEIGHT])
        self.from_glass = from_glass                             # None = air, else a glass number
        self.to_glass = to_glass
        self.name = name
        # the face runs from y = -APEX_HEIGHT to y = +APEX_HEIGHT
        self.half_length = APEX_HEIGHT / math.cos(psi)

    def segment(self):
        """(bottom end, top end) of the face."""
        return (self.point - self.half_length * self.tangent, self.point + self.half_length * self.tangent)


def build_surfaces(prisms, incidence_deg, gap):
    """Flat surfaces, in the order the light meets them.

    prisms: list of (apex_deg, sign). Glass i sits between its entry and exit face.
    Returns (surfaces, prism_faces) where prism_faces[i] = (entry, exit) surfaces
    bounding prism i (touching prisms share a single surface).
    """
    psi_entry = -math.radians(incidence_deg)
    x = 0.0
    surfaces = []
    prism_faces = []
    count = len(prisms)

    for i, (apex_deg, sign) in enumerate(prisms):
        wedge = sign * math.radians(apex_deg)
        psi_exit = psi_entry + wedge

        if abs(math.degrees(psi_exit)) > MAX_NORMAL_TILT or abs(math.degrees(psi_entry)) > MAX_NORMAL_TILT:
            raise ValueError("The prisms are tilted too far. Reduce the apex angles or the angle of incidence.")

        # entry face (a cemented pair shares the face made by the previous prism)
        if i == 0 or gap > 0.0:
            entry = Surface(x, psi_entry, None, i + 1, f"face {len(surfaces) + 1}")
            surfaces.append(entry)
        else:
            entry = surfaces[-1]

        # The two faces are planes that meet at the apex of the triangle. Put the apex
        # APEX_HEIGHT above the beam (apex up) or below it (turned over): the thickness
        # of the prism on the axis then follows from where the two planes meet.
        y_apex = APEX_HEIGHT if sign > 0 else -APEX_HEIGHT
        thickness = y_apex * (math.tan(psi_exit) - math.tan(psi_entry))
        x_exit = x + thickness

        last = i == count - 1
        if not last and gap == 0.0:
            exit_surface = Surface(x_exit, psi_exit, i + 1, i + 2, f"face {len(surfaces) + 1}")
            x = x_exit
        else:
            exit_surface = Surface(x_exit, psi_exit, i + 1, None, f"face {len(surfaces) + 1}")
            x = x_exit + gap
        surfaces.append(exit_surface)

        prism_faces.append((entry, exit_surface))
        psi_entry = psi_exit

    return surfaces, prism_faces


def trace_through(origin, direction, surfaces, glass_index, screen_x):
    """Follow one ray through the flat surfaces. glass_index(g) is the refractive
    index of glass number g (None is air)."""
    d = _unit(direction)
    d_in = d.copy()
    p = np.array(origin, dtype=float)

    points = [p.copy()]
    steps = []
    events = []
    normals = []
    emerged = True
    inside_faces = True

    for k, s in enumerate(surfaces):
        denominator = float(np.dot(d, s.normal))
        if abs(denominator) < 1e-9:
            emerged = False
            events.append(f"The ray runs parallel to {s.name}")
            break
        t = float(np.dot(s.point - p, s.normal)) / denominator
        if t < 1e-9:
            emerged = False
            events.append(f"The ray does not reach {s.name}")
            break

        q = p + t * d
        offset = float(np.dot(q - s.point, s.tangent))
        if abs(offset) > s.half_length + 1e-9:
            inside_faces = False

        n1 = 1.0 if s.from_glass is None else glass_index(s.from_glass)
        n2 = 1.0 if s.to_glass is None else glass_index(s.to_glass)
        new_d = refract(d, s.normal, n1, n2)

        points.append(q.copy())
        normals.append((q.copy(), s.normal.copy()))

        if new_d is None:
            emerged = False
            events.append(f"Total internal reflection at {s.name}")
            break

        new_d = _unit(new_d)
        cross_in = s.normal[0] * d[1] - s.normal[1] * d[0]
        cross_out = s.normal[0] * new_d[1] - s.normal[1] * new_d[0]
        incidence = math.degrees(math.atan2(cross_in, float(np.dot(s.normal, d))))
        refraction = math.degrees(math.atan2(cross_out, float(np.dot(s.normal, new_d))))
        steps.append({
            "surface": s.name,
            "n_before": float(n1),
            "n_after": float(n2),
            "incidence_angle": incidence,
            "refraction_angle": refraction,
            "bend": _wrap_deg(_angle_deg(d) - _angle_deg(new_d)),
            "direction_angle": _angle_deg(new_d),
        })
        events.append(f"Refracted at {s.name}")
        d = new_d
        p = q

    if emerged:
        if d[0] > 1e-6 and screen_x > p[0]:
            length = min((screen_x - p[0]) / d[0], 120.0)
        else:
            length = 25.0
        points.append(p + d * length)
    else:
        points.append(p + d * 3.0)

    return {
        "points": points,
        "steps": steps,
        "events": events,
        "normals": normals,
        "emerged": emerged,
        "inside_faces": inside_faces,
        "deviation": _wrap_deg(_angle_deg(d_in) - _angle_deg(d)) if emerged else None,
        "exit_direction": d,
    }


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def _check(name, value, low, high):
    value = float(value)
    if not np.isfinite(value) or not (low <= value <= high):
        raise ValueError(f"{name} must be between {low:g} and {high:g}.")
    return value


def ideal_second_apex(apex1, n1, v1, n2, v2):
    """Thin-prism second apex angle that cancels the dispersion, and the one that
    cancels the mean deviation (the second prism is turned over)."""
    achromatic = apex1 * (n1 - 1.0) * v2 / ((n2 - 1.0) * v1)
    direct_vision = apex1 * (n1 - 1.0) / (n2 - 1.0)
    return float(achromatic), float(direct_vision)


def thin_prism_estimates(apex1, n1, v1, apex2, n2, v2, sign2):
    mean = (n1 - 1.0) * apex1 + sign2 * (n2 - 1.0) * apex2
    dispersion = (n1 - 1.0) * apex1 / v1 + sign2 * (n2 - 1.0) * apex2 / v2
    return float(mean), float(dispersion)


# ---------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------

def simulate_prism_combination(
    apex_angle_1=10.0,
    n_d_1=1.517,
    abbe_number_1=64.2,
    apex_angle_2=4.7,
    n_d_2=1.620,
    abbe_number_2=36.4,
    arrangement="opposite",
    incidence_angle=20.0,
    gap=0.0,
    spectrum_samples=7,
    screen_distance=25.0,
):
    a1 = _check("Apex angle of prism 1", apex_angle_1, 1.0, 60.0)
    a2 = _check("Apex angle of prism 2", apex_angle_2, 1.0, 60.0)
    n1 = _check("Refractive index of prism 1", n_d_1, 1.3, 2.2)
    n2 = _check("Refractive index of prism 2", n_d_2, 1.3, 2.2)
    v1 = _check("Abbe number of prism 1", abbe_number_1, 15.0, 100.0)
    v2 = _check("Abbe number of prism 2", abbe_number_2, 15.0, 100.0)
    theta1 = _check("Angle of incidence", incidence_angle, -60.0, 60.0)
    air_gap = _check("Gap", gap, 0.0, 6.0)
    screen = _check("Screen distance", screen_distance, 5.0, 100.0)

    if arrangement not in ("same", "opposite"):
        raise ValueError('Arrangement must be "same" or "opposite".')
    if int(spectrum_samples) != spectrum_samples or not (1 <= int(spectrum_samples) <= 13):
        raise ValueError("spectrum_samples must be a whole number from 1 to 13.")
    samples = int(spectrum_samples)

    sign2 = 1.0 if arrangement == "same" else -1.0
    glass = {1: cauchy_coefficients(n1, v1), 2: cauchy_coefficients(n2, v2)}

    def index_at(lam_nm):
        return lambda g: refractive_index(lam_nm, *glass[g])

    both = [(a1, 1.0), (a2, sign2)]
    surfaces, faces = build_surfaces(both, theta1, air_gap)
    only_first, _ = build_surfaces([(a1, 1.0)], theta1, 0.0)
    only_second, _ = build_surfaces([(a2, 1.0)], theta1, 0.0)

    direction = np.array([1.0, 0.0])
    entry = surfaces[0].point
    origin = entry - direction * 14.0
    last_x = max(s.point[0] for s in surfaces)
    screen_x = float(last_x + screen)

    def trace_for(surface_list, lam_nm, glass_map=None):
        if glass_map is None:
            gi = index_at(lam_nm)
        else:
            gi = lambda g: refractive_index(lam_nm, *glass[glass_map[g]])
        return trace_through(origin, direction, surface_list, gi, screen_x)

    # ----- the spectrum -----
    wavelengths = [550.0] if samples == 1 else list(np.linspace(SPECTRUM_RANGE[0], SPECTRUM_RANGE[1], samples))
    rays = []
    for lam in wavelengths:
        result = trace_for(surfaces, lam)
        end = result["points"][-1]
        screen_y = float(end[1]) if result["emerged"] and abs(end[0] - screen_x) < 1e-6 else None
        rays.append({
            "wavelength_nm": float(lam),
            "color": wavelength_to_hex(lam),
            "n1": float(refractive_index(lam, *glass[1])),
            "n2": float(refractive_index(lam, *glass[2])),
            "deviation": result["deviation"],
            "emerged": result["emerged"],
            "events": result["events"],
            "points": [_pt(p) for p in result["points"]],
            "screen_y": screen_y,
        })

    # ----- reference ray (sodium D line) -----
    reference = trace_for(surfaces, LAMBDA_D * 1000.0)

    def deviation_at(surface_list, lam_nm, glass_map=None):
        r = trace_for(surface_list, lam_nm, glass_map)
        return r["deviation"]

    # ----- deviation against wavelength: the pair, and each prism alone -----
    curve = []
    for lam in np.linspace(400.0, 700.0, 31):
        curve.append({
            "wavelength_nm": float(lam),
            "color": wavelength_to_hex(lam),
            "pair": deviation_at(surfaces, lam),
            "first_alone": deviation_at(only_first, lam),
            "second_alone": deviation_at(only_second, lam, {1: 2}),
        })

    def fc(surface_list, glass_map=None):
        d_f = deviation_at(surface_list, LAMBDA_F * 1000.0, glass_map)
        d_c = deviation_at(surface_list, LAMBDA_C * 1000.0, glass_map)
        return (None if d_f is None or d_c is None else float(d_f - d_c)), d_f, d_c

    dispersion_pair, d_f, d_c = fc(surfaces)
    dispersion_first, _, _ = fc(only_first)
    dispersion_second, _, _ = fc(only_second, {1: 2})
    delta_d = reference["deviation"]
    delta_first = deviation_at(only_first, LAMBDA_D * 1000.0)
    delta_second = deviation_at(only_second, LAMBDA_D * 1000.0, {1: 2})

    achromatic_apex, direct_apex = ideal_second_apex(a1, n1, v1, n2, v2)
    thin_mean, thin_dispersion = thin_prism_estimates(a1, n1, v1, a2, n2, v2, sign2)

    ys = [r["screen_y"] for r in rays if r["screen_y"] is not None]
    spread = float(max(ys) - min(ys)) if len(ys) >= 2 else None

    # every prism is a triangle: the apex is where its two faces meet
    outlines = []
    for i, (entry_face, exit_face) in enumerate(faces):
        e_bottom, e_top = entry_face.segment()
        x_bottom, x_top = exit_face.segment()
        apex_up = both[i][1] > 0
        if apex_up:
            apex = (e_top + x_top) / 2.0
            polygon = [apex, e_bottom, x_bottom]
        else:
            apex = (e_bottom + x_bottom) / 2.0
            polygon = [apex, x_top, e_top]
        outlines.append({
            "prism": i + 1,
            "polygon": [_pt(p) for p in polygon],
            "apex": _pt(apex),
            "apex_angle": a1 if i == 0 else a2,
            "turned_over": bool(not apex_up),
        })

    return {
        "valid": True,
        "arrangement": arrangement,
        "cemented": air_gap == 0.0,
        "gap": air_gap,
        "incidence_angle": theta1,
        "prism_1": {"apex_angle": a1, "n_d": n1, "abbe_number": v1},
        "prism_2": {"apex_angle": a2, "n_d": n2, "abbe_number": v2},
        "outlines": outlines,
        "faces": [
            {"name": s.name, "point": _pt(s.point), "normal_angle": math.degrees(s.psi),
             "segment": [_pt(s.segment()[0]), _pt(s.segment()[1])]}
            for s in surfaces
        ],
        "incident_start": _pt(origin),
        "entry_point": _pt(entry),
        "screen_x": screen_x,
        "rays": rays,
        "reference": {
            "deviation": delta_d,
            "emerged": reference["emerged"],
            "events": reference["events"],
            "inside_faces": reference["inside_faces"],
            "steps": reference["steps"],
            "normals": [{"point": _pt(q), "direction": _pt(nrm)} for q, nrm in reference["normals"]],
        },
        "summary": {
            "mean_deviation": delta_d,
            "deviation_f": d_f,
            "deviation_c": d_c,
            "angular_dispersion": dispersion_pair,
            "first_alone": {"mean_deviation": delta_first, "angular_dispersion": dispersion_first},
            "second_alone": {"mean_deviation": delta_second, "angular_dispersion": dispersion_second},
            "dispersion_left": (
                None if dispersion_pair is None or not dispersion_first
                else float(abs(dispersion_pair) / abs(dispersion_first))
            ),
            "screen_spread": spread,
            "thin_mean_deviation": thin_mean,
            "thin_angular_dispersion": thin_dispersion,
            "ideal_apex_achromatic": achromatic_apex,
            "ideal_apex_direct_vision": direct_apex,
            "all_emerged": all(r["emerged"] for r in rays),
        },
        "curve": curve,
    }
