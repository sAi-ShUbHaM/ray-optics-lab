import numpy as np

from physics.vectors import normalize


def validate_refractive_indices(n1, n2):
    """
    Return (n1, n2) as floats, or raise ValueError if they are not
    finite and greater than zero.
    """

    n1 = float(n1)
    n2 = float(n2)

    for name, value in (("n1", n1), ("n2", n2)):
        if not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")
        if value <= 0:
            raise ValueError(f"{name} must be greater than zero.")

    return n1, n2


def critical_angle(n1, n2):
    """
    Critical angle in degrees for light going from n1 into n2.

        sin(theta_c) = n2 / n1        (only possible when n1 > n2)

    Returns None when total internal reflection cannot occur.
    """

    n1, n2 = validate_refractive_indices(n1, n2)

    if n1 <= n2:
        return None

    return float(np.degrees(np.arcsin(n2 / n1)))


def refract(direction, normal, n1, n2):
    """
    Vector form of Snell's law:  n1 sin(theta1) = n2 sin(theta2)

    direction : incoming ray direction (any length, will be normalised)
    normal    : surface normal (any length, any sign). It is flipped
                internally so that it points the way the ray travels,
                so this works from either side of the interface.
    n1, n2    : refractive index of the medium the ray leaves / enters

    Returns the unit refracted direction, or None when total internal
    reflection occurs.
    """

    n1, n2 = validate_refractive_indices(n1, n2)

    direction = normalize(np.array(direction, dtype=float))
    normal = normalize(np.array(normal, dtype=float))

    cos_theta1 = float(np.dot(direction, normal))

    # Make the normal point along the direction of travel.
    if cos_theta1 < 0:
        normal = -normal
        cos_theta1 = -cos_theta1

    cos_theta1 = min(1.0, cos_theta1)

    sin_theta1_squared = 1.0 - cos_theta1 ** 2

    eta = n1 / n2
    sin_theta2_squared = eta ** 2 * sin_theta1_squared

    # Total internal reflection. The small tolerance stops floating-point
    # noise from flipping the result exactly at the critical angle.
    if sin_theta2_squared > 1.0 + 1e-12:
        return None

    cos_theta2 = np.sqrt(max(0.0, 1.0 - sin_theta2_squared))

    tangential_component = direction - cos_theta1 * normal

    refracted_direction = eta * tangential_component + cos_theta2 * normal

    return normalize(refracted_direction)
