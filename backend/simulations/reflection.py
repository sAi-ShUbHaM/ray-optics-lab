from physics.ray import Ray
from physics.intersections import ray_plane_intersection
from physics.reflection import reflect
from objects.mirror import Mirror


def simulate_reflection(
    ray_origin,
    ray_direction,
    mirror_point,
    mirror_normal,
    ray_length=10
):
    """
    Simulate a single ray reflecting from a plane mirror.
    """

    ray = Ray(ray_origin, ray_direction)

    mirror = Mirror(
        mirror_point,
        mirror_normal
    )

    hit_point = ray_plane_intersection(
        ray.origin,
        ray.direction,
        mirror.point,
        mirror.normal
    )

    if hit_point is None:
        return {
            "hit": False,
            "message": "Ray does not intersect the mirror."
        }

    reflected_direction = reflect(
        ray.direction,
        mirror.normal
    )

    reflected_ray = Ray(
        hit_point,
        reflected_direction
    )

    reflected_end = reflected_ray.point_at(ray_length)

    return {
        "hit": True,

        "incident_ray": {
            "start": ray.origin.tolist(),
            "end": hit_point.tolist()
        },

        "reflected_ray": {
            "start": hit_point.tolist(),
            "end": reflected_end.tolist()
        },

        "hit_point": hit_point.tolist(),

        "reflected_direction": reflected_direction.tolist()
    }