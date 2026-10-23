import numpy as np


def normalize(vector):
    """
    Convert a vector into a unit vector.
    """

    vector = np.array(vector, dtype=float)

    magnitude = np.linalg.norm(vector)

    if magnitude == 0:
        raise ValueError("Cannot normalize a zero vector.")

    return vector / magnitude


def dot(vector_a, vector_b):
    """
    Calculate the dot product of two vectors.
    """

    return np.dot(vector_a, vector_b)