import numpy as np

from physics.ray import Ray
from physics.reflection import reflect
from physics.intersections import ray_circle_intersection


def simulate_curved_mirror(
    ray_origin,
    ray_direction,
    mirror_center,
    radius,
    ray_length=10,
    mirror_type="concave",
    reflection_model="exact"
):
    """
    Simulate reflection from a spherical curved mirror.

    reflection_model:
        exact   -> exact spherical reflection
        paraxial -> paraxial approximation

    Important:
        Both models use the SAME physical mirror surface
        and therefore the SAME intersection point.

    Concave mirror:
        Center of curvature is on the incoming-ray side.

    Convex mirror:
        Center of curvature is behind the mirror.
    """

    # ---------------------------------
    # VALIDATION
    # ---------------------------------

    if mirror_type not in ["concave", "convex"]:
        raise ValueError(
            "mirror_type must be 'concave' or 'convex'"
        )

    if reflection_model not in ["exact", "paraxial"]:
        raise ValueError(
            "reflection_model must be 'exact' or 'paraxial'"
        )

    radius = float(radius)

    if radius <= 0:
        raise ValueError(
            "radius must be greater than zero"
        )

    # ---------------------------------
    # CREATE INCIDENT RAY
    # ---------------------------------

    ray = Ray(
        ray_origin,
        ray_direction
    )

    # ---------------------------------
    # SPHERICAL MIRROR GEOMETRY
    # ---------------------------------

    if mirror_type == "concave":

        center = np.array(
            [-radius, 0.0],
            dtype=float
        )

    else:

        center = np.array(
            [radius, 0.0],
            dtype=float
        )

    # ---------------------------------
    # FIND ACTUAL SPHERICAL INTERSECTION
    # ---------------------------------

    intersections = ray_circle_intersection(
        ray.origin,
        ray.direction,
        center,
        radius
    )

    if len(intersections) == 0:

        return {
            "hit": False,
            "message": "Ray does not intersect the curved mirror."
        }

    # ---------------------------------
    # SELECT THE PHYSICAL MIRROR BRANCH
    # ---------------------------------

    if mirror_type == "concave":

        # Right branch of circle
        hit_point = max(
            intersections,
            key=lambda point: point[0]
        )

    else:

        # Left branch of circle
        hit_point = min(
            intersections,
            key=lambda point: point[0]
        )

    hit_point = np.asarray(
        hit_point,
        dtype=float
    )

    # ---------------------------------
    # ACTUAL SURFACE NORMAL
    # ---------------------------------

    normal = hit_point - center

    normal = normal / np.linalg.norm(normal)

    # ---------------------------------
    # FOCAL LENGTH
    # ---------------------------------

    focal_length = radius / 2

    if mirror_type == "concave":

        focus = np.array(
            [-focal_length, 0.0],
            dtype=float
        )

    else:

        focus = np.array(
            [focal_length, 0.0],
            dtype=float
        )

    # ---------------------------------
    # REFLECTION
    # ---------------------------------

    if reflection_model == "exact":

        # Exact spherical reflection
        reflected_direction = reflect(
            ray.direction,
            normal
        )

    else:

        # ---------------------------------
        # PARAXIAL APPROXIMATION
        # ---------------------------------
        #
        # For a concave mirror:
        # reflected rays are directed toward F.
        #
        # For a convex mirror:
        # reflected rays diverge as if
        # they originated from F.
        #

        if mirror_type == "concave":

            reflected_direction = (
                focus - hit_point
            )

        else:

            # Away from virtual focus
            reflected_direction = (
                hit_point - focus
            )

        magnitude = np.linalg.norm(
            reflected_direction
        )

        if magnitude == 0:

            return {
                "hit": False,
                "message": "Invalid paraxial reflection direction."
            }

        reflected_direction = (
            reflected_direction / magnitude
        )

    # ---------------------------------
    # CREATE REFLECTED RAY
    # ---------------------------------

    reflected_ray = Ray(
        hit_point,
        reflected_direction
    )

    reflected_end = reflected_ray.point_at(
        ray_length
    )

    # ---------------------------------
    # RETURN RESULT
    # ---------------------------------

    return {

        "hit": True,

        "mirror_type": mirror_type,

        "reflection_model": reflection_model,

        "ray": {
            "start": ray.origin.tolist(),
            "end": hit_point.tolist()
        },

        "reflected_ray": {
            "start": hit_point.tolist(),
            "end": reflected_end.tolist()
        },

        "hit_point": hit_point.tolist(),

        "normal": normal.tolist(),

        "reflected_direction": (
            reflected_direction.tolist()
        ),

        "center": center.tolist(),

        "radius": radius,

        "focal_length": focal_length,

        "focus": focus.tolist()
    }