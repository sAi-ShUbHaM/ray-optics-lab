import numpy as np
from physics.vectors import normalize


class CurvedMirror:
    def __init__(self, center, radius, mirror_type="concave"):
        self.center = np.array(center, dtype=float)
        self.radius = float(radius)
        self.mirror_type = mirror_type

        if self.radius <= 0:
            raise ValueError("Radius must be positive.")

    def normal_at(self, point):
        """
        Surface normal at a point on the spherical mirror.
        """

        point = np.array(point, dtype=float)

        normal = point - self.center

        return normalize(normal)

    def focal_length(self):
        """
        For a spherical mirror:

        f = R / 2
        """

        return self.radius / 2