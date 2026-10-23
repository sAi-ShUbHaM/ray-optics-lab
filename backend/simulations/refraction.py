import numpy as np

from physics.ray import Ray
from physics.refraction import (
    refract,
    critical_angle,
    validate_refractive_indices,
)
from physics.reflection import reflect


def simulate_refraction(
    incident_angle,
    n1,
    n2,
    ray_length=6
):
    """
    Flat interface along y = 0.

    Medium 1: y < 0   (refractive index n1)
    Medium 2: y > 0   (refractive index n2)

    The incident angle is measured from the normal, in degrees,
    and must lie between -90 and +90 (90 = grazing incidence).

    The response keeps every key the existing frontend uses and adds:
        critical_angle : degrees, or None if TIR is impossible
        bending        : "towards normal" | "away from normal" | "none"
        deviation      : |incident angle - refracted angle| in degrees
                         (None for total internal reflection)
    """

    incident_angle = float(incident_angle)
    ray_length = float(ray_length)
    n1, n2 = validate_refractive_indices(n1, n2)

    if not np.isfinite(incident_angle):
        raise ValueError("Incident angle must be a finite number.")

    if abs(incident_angle) > 90.0:
        raise ValueError(
            "Incident angle must be between -90 and 90 degrees."
        )

    if not np.isfinite(ray_length) or ray_length <= 0:
        raise ValueError("Ray length must be greater than zero.")

    angle = np.radians(incident_angle)

    # Incident ray direction (travelling from y < 0 up towards y > 0)
    incident_direction = np.array([
        np.sin(angle),
        np.cos(angle)
    ])

    # Point where the ray hits the interface
    hit_point = np.array([0.0, 0.0])

    # Put the incident ray below the interface
    incident_origin = hit_point - incident_direction * ray_length

    incident_ray = Ray(incident_origin, incident_direction)

    # Normal points from medium 1 to medium 2
    normal = np.array([0.0, 1.0])

    theta_c = critical_angle(n1, n2)

    refracted_direction = refract(
        incident_ray.direction,
        normal,
        n1,
        n2
    )

    # -----------------------------------------
    # TOTAL INTERNAL REFLECTION
    # -----------------------------------------

    if refracted_direction is None:

        reflected_direction = reflect(incident_ray.direction, normal)

        reflected_ray = Ray(hit_point, reflected_direction)
        reflected_end = reflected_ray.point_at(ray_length)

        return {
            "hit": True,
            "tir": True,

            "incident_ray": {
                "start": incident_ray.origin.tolist(),
                "end": hit_point.tolist()
            },

            "reflected_ray": {
                "start": hit_point.tolist(),
                "end": reflected_end.tolist()
            },

            "hit_point": hit_point.tolist(),

            "n1": n1,
            "n2": n2,

            "incident_angle": incident_angle,
            "refracted_angle": None,
            "critical_angle": theta_c,
            "bending": "none",
            "deviation": None,

            "message": "Total internal reflection occurred."
        }

    # -----------------------------------------
    # NORMAL REFRACTION
    # -----------------------------------------

    refracted_ray = Ray(hit_point, refracted_direction)
    refracted_end = refracted_ray.point_at(ray_length)

    cos_theta2 = float(np.clip(
        np.dot(refracted_direction, normal),
        -1.0,
        1.0
    ))

    refracted_angle = float(np.degrees(np.arccos(cos_theta2)))

    # Report the angle with the same sign as the incident angle.
    if incident_angle < 0:
        refracted_angle = -refracted_angle

    if np.isclose(n1, n2):
        bending = "none"
    elif n2 > n1:
        bending = "towards normal"
    else:
        bending = "away from normal"

    return {
        "hit": True,
        "tir": False,

        "incident_ray": {
            "start": incident_ray.origin.tolist(),
            "end": hit_point.tolist()
        },

        "refracted_ray": {
            "start": hit_point.tolist(),
            "end": refracted_end.tolist()
        },

        "hit_point": hit_point.tolist(),

        "incident_angle": incident_angle,
        "refracted_angle": refracted_angle,

        "n1": n1,
        "n2": n2,

        "critical_angle": theta_c,
        "bending": bending,
        "deviation": abs(incident_angle - refracted_angle),
    }
