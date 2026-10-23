import numpy as np

from physics.vectors import normalize


class Plane:

    def __init__(self, point, normal):

        self.point = np.array(point, dtype=float)

        self.normal = normalize(
            np.array(normal, dtype=float)
        )