#===============================
# RAY-OBJECT INTERSECTIONS
#===============================

import numpy as np


def ray_plane_intersection(
    ray_origin,
    ray_direction,
    plane_point,
    plane_normal
):
    """
    Find where a ray intersects an infinite plane.

    Ray:
        r(t) = ray_origin + t * ray_direction

    Plane:
        (r - plane_point) · plane_normal = 0
    """

    ray_origin = np.array(
        ray_origin,
        dtype=float
    )

    ray_direction = np.array(
        ray_direction,
        dtype=float
    )

    plane_point = np.array(
        plane_point,
        dtype=float
    )

    plane_normal = np.array(
        plane_normal,
        dtype=float
    )

    denominator = np.dot(
        ray_direction,
        plane_normal
    )

    # Ray is parallel to the plane
    if abs(denominator) < 1e-10:
        return None

    t = np.dot(
        plane_point - ray_origin,
        plane_normal
    ) / denominator

    # Intersection is behind the ray
    if t < 0:
        return None

    intersection_point = (
        ray_origin + t * ray_direction
    )

    return intersection_point


#===============================
# CURVED MIRROR INTERSECTION
#===============================

def ray_circle_intersection(
    ray_origin,
    ray_direction,
    circle_center,
    radius
):
    """
    Find all positive intersections between
    a ray and a circle.

    Returns:
        A list of 2D intersection points.
    """

    origin = np.array(
        ray_origin,
        dtype=float
    )

    direction = np.array(
        ray_direction,
        dtype=float
    )

    center = np.array(
        circle_center,
        dtype=float
    )

    radius = float(radius)

    oc = origin - center

    a = np.dot(
        direction,
        direction
    )

    b = 2 * np.dot(
        direction,
        oc
    )

    c = (
        np.dot(oc, oc)
        - radius ** 2
    )

    discriminant = (
        b ** 2
        - 4 * a * c
    )

    # No intersection
    if discriminant < 0:
        return []

    sqrt_discriminant = np.sqrt(
        discriminant
    )

    t1 = (
        -b - sqrt_discriminant
    ) / (2 * a)

    t2 = (
        -b + sqrt_discriminant
    ) / (2 * a)

    valid_t = [
        t
        for t in [t1, t2]
        if t >= 1e-10
    ]

    points = [
        origin + t * direction
        for t in valid_t
    ]

    return points