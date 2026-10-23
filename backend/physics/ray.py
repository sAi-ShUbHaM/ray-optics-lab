import numpy as np

from physics.vectors import normalize


class Ray:

    def __init__(self, origin, direction):

        self.origin = np.array(origin, dtype=float)

        self.direction = normalize(
            np.array(direction, dtype=float)
        )

    def point_at(self, distance):

        return self.origin + distance * self.direction