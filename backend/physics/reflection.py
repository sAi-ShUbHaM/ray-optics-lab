import numpy as np

from physics.vectors import normalize


def reflect(direction, normal):
    """
    Calculate the reflected direction of a ray.

    Reflection equation:

        d_reflected = d - 2(d · n)n

    where:
        d = incoming direction
        n = surface normal
    """

    direction = normalize(np.array(direction, dtype=float))
    normal = normalize(np.array(normal, dtype=float))

    reflected_direction = (
        direction
        - 2 * np.dot(direction, normal) * normal
    )

    return normalize(reflected_direction)