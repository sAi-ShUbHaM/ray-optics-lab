import numpy as np


# ---------------------------------------------------------------------
# Mirages: rays bending in air whose refractive index changes with height
# ---------------------------------------------------------------------
#   * x is the distance along the ground, y the height above it.
#   * The air is layered: n depends on y only. For air
#             n - 1 = 0.08443 * exp(-y / H) / T          (T in kelvin)
#     (n - 1 = 2.93e-4 at 288 K and sea level; H = 8.4 km pressure scale height).
#   * Temperature profile (K):
#         T(y) = T_air - Gamma y  +  dT_s exp(-y / delta)
#                       + dT_i (1 + tanh((y - y_i) / w)) / 2
#       Gamma   lapse rate (6.5 K per km in the standard atmosphere)
#       dT_s    surface layer: positive = hot ground, negative = cold sea,
#               decaying over the thickness delta
#       dT_i    optional temperature INVERSION: a rise of dT_i across a layer
#               of thickness w centred at the height y_i
#   * Earth's curvature (radius R) is included with the flat-Earth transform:
#         m(y) = n(y) (1 + y / R)      (a ray that is straight in real space
#                                       curves downward in these coordinates)
#
# Ray equation for a stratified medium (theta = angle above horizontal):
#         m(y) cos(theta) = constant            (Snell's law / Bouguer invariant)
#   which is the same as            dy/dx = tan(theta),   dtheta/dx = m'(y) / m(y)
#   so a ray always bends towards the region of higher m:
#       hot ground  -> n rises with height  -> rays curve UP     -> inferior mirage
#       cold sea / inversion -> n falls with height -> rays curve DOWN
#                                                                -> superior mirage
#
# Images: rays are launched from the observer's eye over a fan of angles.
#   For the object at distance X, a ray with launch angle alpha arrives at
#   height y_X(alpha). The observer sees the object along every alpha whose
#   ray lands on the object (0 <= y_X <= object height). Where y_X rises with
#   alpha the image is upright, where it falls the image is inverted.
# ---------------------------------------------------------------------

EARTH_RADIUS = 6.371e6
PRESSURE_SCALE_HEIGHT = 8400.0
N_COEFFICIENT = 0.08443           # n - 1 = N_COEFFICIENT * exp(-y/H) / T
KELVIN = 273.15


def _pt(p):
    return [float(p[0]), float(p[1])]


class Atmosphere:
    """Temperature, refractive index and their height derivatives."""

    def __init__(self, air_temperature, surface_temperature, layer_thickness,
                 lapse_rate, inversion_strength, inversion_height,
                 inversion_thickness, earth_curvature,
                 scale_height=PRESSURE_SCALE_HEIGHT):
        self.t_air = air_temperature + KELVIN
        self.dt_surface = surface_temperature - air_temperature
        self.delta = layer_thickness
        self.gamma = lapse_rate / 1000.0               # K per metre
        self.dt_inv = inversion_strength
        self.y_inv = inversion_height
        self.w_inv = inversion_thickness
        self.radius = EARTH_RADIUS if earth_curvature else None
        self.scale_height = scale_height

    def temperature(self, y):
        """(T, dT/dy) in kelvin and kelvin per metre."""
        e = np.exp(-np.maximum(y, -50.0 * self.delta) / self.delta)
        T = self.t_air - self.gamma * y + self.dt_surface * e
        dT = -self.gamma - self.dt_surface * e / self.delta

        if self.dt_inv != 0.0:
            u = (y - self.y_inv) / self.w_inv
            T = T + self.dt_inv * 0.5 * (1.0 + np.tanh(u))
            # sech^2(u) written so that it cannot overflow for large |u|
            q = np.exp(-2.0 * np.abs(u))
            sech2 = 4.0 * q / (1.0 + q) ** 2
            dT = dT + self.dt_inv * 0.5 * sech2 / self.w_inv

        return T, dT

    def refractive_index(self, y):
        """(n, dn/dy)."""
        T, dT = self.temperature(y)
        pressure = np.exp(-y / self.scale_height)
        n1 = N_COEFFICIENT * pressure / T
        dn = N_COEFFICIENT * pressure * (-1.0 / (self.scale_height * T) - dT / T ** 2)
        return 1.0 + n1, dn

    def modified_index(self, y):
        """(m, dm/dy): index with the Earth-curvature factor."""
        n, dn = self.refractive_index(y)
        if self.radius is None:
            return n, dn
        f = 1.0 + y / self.radius
        return n * f, dn * f + n / self.radius

    def bending(self, y):
        """m'(y) / m(y): the rate at which the ray direction turns, per metre."""
        m, dm = self.modified_index(y)
        return dm / m


def trace_rays(atm, y0, alphas, distance, steps, keep_theta=False):
    """
    Integrate many rays at once from (0, y0) to x = distance with RK4.
    Returns a dict with the height history, whether each ray hit the ground
    (and where), and optionally the angle history.
    """
    alphas = np.asarray(alphas, dtype=float)
    count = alphas.size
    h = distance / steps

    y = np.full(count, float(y0))
    th = alphas.copy()

    hist_y = np.empty((steps + 1, count))
    hist_y[0] = y
    hist_th = None
    if keep_theta:
        hist_th = np.empty((steps + 1, count))
        hist_th[0] = th

    blocked = np.zeros(count, dtype=bool)
    block_x = np.full(count, np.nan)

    g = atm.bending

    for k in range(steps):
        k1y = np.tan(th)
        k1t = g(y)

        y2 = y + 0.5 * h * k1y
        t2 = th + 0.5 * h * k1t
        k2y = np.tan(t2)
        k2t = g(y2)

        y3 = y + 0.5 * h * k2y
        t3 = th + 0.5 * h * k2t
        k3y = np.tan(t3)
        k3t = g(y3)

        y4 = y + h * k3y
        t4 = th + h * k3t
        k4y = np.tan(t4)
        k4t = g(y4)

        y_new = y + h / 6.0 * (k1y + 2 * k2y + 2 * k3y + k4y)
        th_new = th + h / 6.0 * (k1t + 2 * k2t + 2 * k3t + k4t)

        hit = (~blocked) & (y_new <= 0.0)
        if np.any(hit):
            # linear interpolation to the ground inside this step
            frac = y[hit] / (y[hit] - y_new[hit])
            block_x[hit] = (k + frac) * h
            blocked |= hit

        y = np.where(blocked, 0.0, y_new)
        th = np.where(blocked, 0.0, th_new)

        hist_y[k + 1] = y
        if keep_theta:
            hist_th[k + 1] = th

    out = {"y": hist_y, "blocked": blocked, "block_x": block_x, "step": h}
    if keep_theta:
        out["theta"] = hist_th
    return out


# ---------------------------------------------------------------------
# Finding the images of an object
# ---------------------------------------------------------------------

def find_images(alphas, y_at_object, valid, object_height, distance):
    """
    Group the launch angles whose rays land on the object (0 <= y <= height)
    into images.

    alphas        launch angles (radians), increasing
    y_at_object   height each ray reaches at the object's distance
    valid         False for rays that hit the ground first
    Returns a list of dicts, ordered by increasing launch angle.

    Where y_at_object has a minimum or maximum inside the object's height
    range (a "fold"), the rays on its two sides form two different images:
    one upright (y rises with the angle) and one inverted (y falls with it).
    They meet at the fold, where the part of the object beyond that height
    cannot be seen.
    """

    M = len(alphas)
    h = float(object_height)
    tol = 0.03 * h

    def at_level(y):
        return y <= tol or y >= h - tol

    inside = valid & (y_at_object >= 0.0) & (y_at_object <= h)
    images = []

    i = 0
    while i < M:
        if not inside[i]:
            i += 1
            continue

        j = i
        while j + 1 < M and inside[j + 1]:
            j += 1
        run_start, run_end = i, j
        i = j + 1

        # --- split the run into monotonic pieces at every fold ---
        cuts = [run_start]
        if run_end - run_start >= 2:
            dy = np.diff(y_at_object[run_start:run_end + 1])
            for k in range(1, len(dy)):
                if dy[k - 1] * dy[k] < 0:
                    cuts.append(run_start + k)
        cuts.append(run_end)

        pieces = [(cuts[n], cuts[n + 1]) for n in range(len(cuts) - 1)]
        if len(pieces) == 0:
            pieces = [(run_start, run_end)]

        for piece_index, (a, b) in enumerate(pieces):
            first_piece = piece_index == 0
            last_piece = piece_index == len(pieces) - 1

            # ---- start of this piece ----
            if not first_piece:
                a_start, start_cut, start_fold = alphas[a], True, True
            elif a > 0 and valid[a - 1]:
                level = h if y_at_object[a - 1] > h else 0.0
                dy_ = y_at_object[a] - y_at_object[a - 1]
                a_start = alphas[a - 1] + (level - y_at_object[a - 1]) / dy_ * (alphas[a] - alphas[a - 1])
                start_cut, start_fold = False, False
            else:
                a_start = alphas[a]
                start_cut = not at_level(y_at_object[a])
                start_fold = False

            # ---- end of this piece ----
            if not last_piece:
                a_end, end_cut, end_fold = alphas[b], True, True
            elif b + 1 < M and valid[b + 1]:
                level = h if y_at_object[b + 1] > h else 0.0
                dy_ = y_at_object[b + 1] - y_at_object[b]
                a_end = alphas[b] + (level - y_at_object[b]) / dy_ * (alphas[b + 1] - alphas[b])
                end_cut, end_fold = False, False
            else:
                a_end = alphas[b]
                end_cut = not at_level(y_at_object[b])
                end_fold = False

            # ---- orientation ----
            if b > a:
                slope = y_at_object[b] - y_at_object[a]
            elif b + 1 < M and valid[b + 1]:
                slope = y_at_object[b + 1] - y_at_object[b]
            elif a > 0 and valid[a - 1]:
                slope = y_at_object[a] - y_at_object[a - 1]
            else:
                slope = 0.0

            if b == a and slope == 0.0:
                continue                      # a single isolated sample: nothing to draw

            upright = slope > 0.0

            if upright:
                alpha_bottom, alpha_top = a_start, a_end
                bottom_cut, top_cut = start_cut, end_cut
                bottom_fold, top_fold = start_fold, end_fold
                y_bottom = 0.0 if not start_cut else y_at_object[a]
                y_top = h if not end_cut else y_at_object[b]
            else:
                alpha_top, alpha_bottom = a_start, a_end
                top_cut, bottom_cut = start_cut, end_cut
                top_fold, bottom_fold = start_fold, end_fold
                y_top = h if not start_cut else y_at_object[a]
                y_bottom = 0.0 if not end_cut else y_at_object[b]

            visible = max(y_top - y_bottom, 1e-12)
            d_alpha = abs(a_end - a_start)

            images.append({
                "orientation": "Upright" if upright else "Inverted",
                "alpha_start": float(a_start),
                "alpha_end": float(a_end),
                "alpha_top": float(alpha_top),
                "alpha_bottom": float(alpha_bottom),
                "angular_height": float(d_alpha),
                "magnification": float(d_alpha * distance / visible),
                "top_cut": bool(top_cut),
                "bottom_cut": bool(bottom_cut),
                "fold": bool(top_fold or bottom_fold),
                "visible_fraction": float(min(1.0, visible / h)),
                "visible_from": float(y_bottom),
                "visible_to": float(y_top),
                "fan_edge": bool((a == 0 and valid[a]) or (b == M - 1)),
            })

    return images


# ---------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------

def _validate(name, value, low, high):
    value = float(value)
    if not np.isfinite(value) or not (low <= value <= high):
        raise ValueError(f"{name} must be between {low:g} and {high:g}.")
    return value


def _geometric_angle(target_height, observer_height, distance, curvature):
    """Elevation (radians) of a point at the given height above the surface,
    for a straight ray over a (curved) Earth: no refraction."""
    drop = distance ** 2 / (2.0 * EARTH_RADIUS) if curvature else 0.0
    return float(np.arctan((target_height - drop - observer_height) / distance))


def _main_upright(images):
    """The upright image showing the largest part of the object, or None."""
    uprights = [im for im in images if im["orientation"] == "Upright"]
    if not uprights:
        return None
    return max(uprights, key=lambda im: im["visible_fraction"])


def _classify(images, reference_images, displacement_arcmin, tol_arcmin=0.5):
    """
    A short, honest description of what the observer sees.

    A mirage is a departure from what ordinary air would show, so everything
    is judged against `reference_images`: the images the same observer would
    see through air with the same ambient temperature and lapse rate but no
    surface layer and no inversion.
    """
    pattern = "".join(im["orientation"][0] for im in images)

    if not images:
        if reference_images:
            return pattern, ("Hidden by refraction: in ordinary air the object "
                             "would be visible, but here no ray reaches it.")
        return pattern, "The object cannot be seen: it is below the horizon."

    uprights = [im for im in images if im["orientation"] == "Upright"]
    inverteds = [im for im in images if im["orientation"] == "Inverted"]

    if len(images) == 1 and uprights:
        im = uprights[0]
        hidden = im["fold"] or im["bottom_cut"] or im["top_cut"]

        if not reference_images:
            return pattern, ("Brought into view by refraction (superior mirage): in "
                             "ordinary air this object would be hidden below the horizon.")

        shift = displacement_arcmin if displacement_arcmin is not None else 0.0
        true_size = abs(im["magnification"] - 1.0) < 0.15

        if abs(shift) < tol_arcmin and true_size:
            if hidden:
                return pattern, ("Normal view, but part of the object is hidden "
                                 "below the horizon.")
            return pattern, "Normal view: one upright image where the object really is."

        size = (" The image is stretched vertically." if im["magnification"] > 1.15
                else " The image is compressed vertically." if im["magnification"] < 0.85
                else "")
        if shift > tol_arcmin:
            return pattern, "One raised upright image (superior mirage)." + size
        if shift < -tol_arcmin:
            return pattern, "One lowered upright image (the object seems sunk)." + size
        return pattern, "One upright image, not displaced but distorted." + size

    if len(images) == 2 and len(uprights) == 1 and len(inverteds) == 1:
        inv, up = inverteds[0], uprights[0]
        if inv["alpha_top"] < up["alpha_bottom"] + 1e-9 or inv["alpha_top"] < up["alpha_top"]:
            return pattern, ("Inferior mirage: the object and, directly below it, "
                             "an inverted image like a reflection in water.")
        return pattern, "Superior mirage: an inverted image above the upright one."

    if len(images) >= 3:
        return pattern, ("Stacked images (a Fata Morgana pattern): the observer "
                         "sees the object several times, alternately upright and inverted.")

    return pattern, "Several images of the object."


def simulate_mirage(
    observer_height=1.7,
    object_distance=3000.0,
    object_height=12.0,
    air_temperature=25.0,
    surface_temperature=65.0,
    layer_thickness=0.15,
    lapse_rate=6.5,
    inversion_strength=0.0,
    inversion_height=25.0,
    inversion_thickness=4.0,
    earth_curvature=True,
    ray_count=21,
    fan_scale=1.0,
    pressure_scale_height=PRESSURE_SCALE_HEIGHT,
):
    y0 = _validate("Observer height", observer_height, 0.2, 300.0)
    X = _validate("Object distance", object_distance, 50.0, 150000.0)
    h = _validate("Object height", object_height, 0.5, 1000.0)
    t_air = _validate("Air temperature", air_temperature, -40.0, 45.0)
    t_surf = _validate("Surface temperature", surface_temperature, -40.0, 90.0)
    delta = _validate("Layer thickness", layer_thickness, 0.02, 300.0)
    gamma = _validate("Lapse rate", lapse_rate, -10.0, 20.0)
    inv_k = _validate("Inversion strength", inversion_strength, 0.0, 30.0)
    inv_y = _validate("Inversion height", inversion_height, 2.0, 1000.0)
    inv_w = _validate("Inversion thickness", inversion_thickness, 0.5, 200.0)
    fan_scale = _validate("Fan scale", fan_scale, 0.25, 4.0)
    scale_height = _validate("Pressure scale height", pressure_scale_height, 1000.0, 1e15)

    if int(ray_count) != ray_count or not (5 <= int(ray_count) <= 41):
        raise ValueError("ray_count must be a whole number from 5 to 41.")
    ray_count = int(ray_count)
    curvature = bool(earth_curvature)

    atm = Atmosphere(t_air, t_surf, delta, gamma, inv_k, inv_y, inv_w,
                     curvature, scale_height)

    # the air must stay a plausible gas
    probe = np.linspace(0.0, 2000.0, 400)
    if float(np.min(atm.temperature(probe)[0])) < 180.0:
        raise ValueError("These settings give an unphysically cold atmosphere (below 180 K).")

    # --- launch-angle fan: from below the geometric direction of the object's
    #     base to well above its top, widened by the bending the air can produce ---
    base = np.arctan(y0 / X)
    top = np.arctan(max(h - y0, 0.0) / X)
    dip = float(np.sqrt(2.0 * y0 / EARTH_RADIUS)) if curvature else 0.0

    ys = np.linspace(0.0, max(3.0 * delta, (inv_y + 3.0 * inv_w) if inv_k else 0.0,
                              2.0 * y0, 2.0 * h, 10.0), 400)
    # Only gradients that bend rays DOWNWARD (index falling with height) can
    # pull a ray launched above the horizon back down onto a distant object.
    # A hot layer bends rays upward, and rays launched upward never enter it,
    # so it must not widen the upper end of the fan.
    bend = X * max(0.0, -float(np.min(atm.bending(ys))))

    m_ground, _ = atm.modified_index(np.array(0.0))
    m_eye, _ = atm.modified_index(np.array(y0))
    critical = float(np.arccos(m_ground / m_eye)) if m_ground < m_eye else 0.0

    lo = -max(2.0 * (base + dip) + np.radians(0.05), 1.25 * critical)
    hi = 1.3 * top + np.radians(0.05) + min(bend, np.radians(3.0))
    lo, hi = lo * fan_scale, hi * fan_scale
    if hi - lo < np.radians(0.1):
        mid = 0.5 * (hi + lo)
        lo, hi = mid - np.radians(0.05), mid + np.radians(0.05)

    M = 1300
    alphas = np.linspace(lo, hi, M)

    # the integration step must resolve the thinnest layer that really has a gradient
    scales = [50.0]
    if abs(t_surf - t_air) > 0.01:
        scales.append(delta)
    if inv_k > 0.0:
        scales.append(inv_w)
    scale_min = min(scales)
    tan_max = max(abs(np.tan(lo)), abs(np.tan(hi)), 1e-4)
    steps = int(np.clip(np.ceil(X * 5.0 * tan_max / scale_min), 800, 3000))

    traced = trace_rays(atm, y0, alphas, X, steps)
    y_at_object = traced["y"][-1]
    valid = ~traced["blocked"]

    images_raw = find_images(alphas, y_at_object, valid, h, X)

    geometric = {
        "bottom": _geometric_angle(0.0, y0, X, curvature),
        "top": _geometric_angle(h, y0, X, curvature),
    }

    # --- the same scene through ORDINARY air: no surface layer, no inversion ---
    reference_atm = Atmosphere(t_air, t_air, delta, gamma, 0.0, inv_y, inv_w,
                               curvature, scale_height)
    ref_alphas = np.linspace(lo, hi, 600)
    ref_traced = trace_rays(reference_atm, y0, ref_alphas, X, 600)
    reference_images = find_images(ref_alphas, ref_traced["y"][-1],
                                   ~ref_traced["blocked"], h, X)

    main = _main_upright(images_raw)
    ref_main = _main_upright(reference_images)

    displacement = None
    if main is not None and ref_main is not None:
        displacement = float(np.degrees(main["alpha_top"] - ref_main["alpha_top"]) * 60.0)

    straight_displacement = None
    if main is not None:
        straight_displacement = float(np.degrees(main["alpha_top"] - geometric["top"]) * 60.0)

    pattern, description = _classify(images_raw, reference_images, displacement)

    # --- paths of the rays to draw ---
    pick = set(np.linspace(0, M - 1, ray_count).round().astype(int).tolist())
    edge_indices = set()
    for im in images_raw:
        for key in ("alpha_start", "alpha_end"):
            edge_indices.add(int(np.argmin(np.abs(alphas - im[key]))))
    pick |= edge_indices

    x_grid = np.linspace(0.0, X, steps + 1)
    sample = np.unique(np.linspace(0, steps, 160).round().astype(int))

    paths = []
    for index in sorted(pick):
        if traced["blocked"][index]:
            stop_x = float(traced["block_x"][index])
            keep = sample[x_grid[sample] < stop_x]
            xs = np.append(x_grid[keep], stop_x)
            ysr = np.append(traced["y"][keep, index], 0.0)
            status = "Hits the ground"
        else:
            xs = x_grid[sample]
            ysr = traced["y"][sample, index]
            yx = float(y_at_object[index])
            if yx > h:
                status = "Passes above the object"
            elif yx >= 0.0:
                status = "Hits the object"
            else:
                status = "Passes below the object"

        paths.append({
            "angle_deg": float(np.degrees(alphas[index])),
            "status": status,
            "role": "image edge" if index in edge_indices else "fan",
            "height_at_object": None if traced["blocked"][index] else float(y_at_object[index]),
            "points": [[float(a), float(b)] for a, b in zip(xs, ysr)],
        })

    # --- images, in degrees ---
    # Where the observer would place each image if light travelled straight:
    # the height above the local surface, at the object's distance, of the straight
    # line with the image's launch angle (this includes the Earth's curvature).
    curvature_drop = X ** 2 / (2.0 * EARTH_RADIUS) if curvature else 0.0
    images = []
    for im in images_raw:
        item = dict(im)
        item["apparent_bottom"] = float(y0 + X * np.tan(im["alpha_bottom"]) + curvature_drop)
        item["apparent_top"] = float(y0 + X * np.tan(im["alpha_top"]) + curvature_drop)
        for key in ("alpha_start", "alpha_end", "alpha_top", "alpha_bottom", "angular_height"):
            item[key + "_deg"] = float(np.degrees(im[key]))
            del item[key]
        images.append(item)

    # --- apparent horizon: lowest ray that still reaches the object's distance ---
    valid_idx = np.where(valid)[0]
    apparent_horizon = float(np.degrees(alphas[valid_idx[0]])) if valid_idx.size else None

    # --- the air column ---
    y_plot = float(max(8.0 * delta, (inv_y + 4.0 * inv_w) if inv_k else 0.0,
                       2.0 * y0, 1.5 * h, 5.0))
    y_plot = min(y_plot, 1500.0)
    heights = np.linspace(0.0, y_plot, 240)
    T, _ = atm.temperature(heights)
    n, dn = atm.refractive_index(heights)

    return {
        "valid": True,
        "observer_height": y0,
        "object_distance": X,
        "object_height": h,
        "earth_curvature": curvature,
        "surface_layer_difference": float(t_surf - t_air),
        "layer_thickness": delta,
        "lapse_rate": gamma,
        "inversion_strength": inv_k,
        "inversion_height": inv_y,
        "inversion_thickness": inv_w,
        "fan": {"min_deg": float(np.degrees(lo)), "max_deg": float(np.degrees(hi)),
                "samples": M, "steps": steps},
        "geometric": {
            "bottom_deg": float(np.degrees(geometric["bottom"])),
            "top_deg": float(np.degrees(geometric["top"])),
            "horizon_dip_deg": float(-np.degrees(dip)),
            "horizon_distance_km": float(np.sqrt(2.0 * EARTH_RADIUS * y0) / 1000.0) if curvature else None,
        },
        "apparent_horizon_deg": apparent_horizon,
        "images": images,
        "pattern": pattern,
        "description": description,
        "displacement_arcmin": displacement,
        "displacement_straight_arcmin": straight_displacement,
        "ordinary_air_image_count": len(reference_images),
        "rays": paths,
        "profile": {
            "heights": [float(v) for v in heights],
            "temperature_c": [float(v - KELVIN) for v in T],
            "n_minus_1_e6": [float((v - 1.0) * 1e6) for v in n],
            "dn_dy_e7": [float(v * 1e7) for v in dn],
            "ducting_threshold_e7": float(-1e7 / EARTH_RADIUS),
        },
        "critical_angle_deg": float(np.degrees(critical)) if critical > 0 else None,
    }
