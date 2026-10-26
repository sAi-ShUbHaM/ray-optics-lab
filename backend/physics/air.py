import numpy as np


# ---------------------------------------------------------------------
# Refractive index of air
# ---------------------------------------------------------------------
#   Edlen's (1966) dispersion formula for STANDARD air
#   (15 degrees C, 101 325 Pa, dry, 0.03 % CO2), valid from 0.23 to 1.69 um:
#
#       (n - 1) * 1e8 = 8342.13 + 2406030 / (130 - s^2) + 15997 / (38.9 - s^2)
#
#   where s = 1 / wavelength in micrometres.
#
#   For other conditions the refractivity n - 1 is proportional to the density
#   of the air, so it scales with pressure and with 1 / temperature:
#
#       n - 1 = (n_std - 1) * (P / 101325 Pa) * (288.15 K / T)
#
#   Check: at sodium D (589.3 nm) this gives n - 1 = 2.771e-4 at 15 C and
#   2.924e-4 at 0 C. The familiar "n = 1.000293" is the value at 0 C.
#   Humidity is ignored (water vapour lowers n very slightly).
# ---------------------------------------------------------------------

STANDARD_TEMPERATURE = 288.15      # K
STANDARD_PRESSURE = 101325.0       # Pa
SODIUM_D = 0.5893                  # micrometres


def standard_refractivity(wavelength_um=SODIUM_D):
    """n - 1 of standard air (15 C, 101325 Pa) at the given wavelength (um)."""
    s2 = 1.0 / np.asarray(wavelength_um, dtype=float) ** 2
    return (8342.13 + 2406030.0 / (130.0 - s2) + 15997.0 / (38.9 - s2)) * 1e-8


def refractivity(temperature_k, pressure_pa, wavelength_um=SODIUM_D):
    """n - 1 of air at the given temperature (K) and pressure (Pa)."""
    return (
        standard_refractivity(wavelength_um)
        * (np.asarray(pressure_pa, dtype=float) / STANDARD_PRESSURE)
        * (STANDARD_TEMPERATURE / np.asarray(temperature_k, dtype=float))
    )
