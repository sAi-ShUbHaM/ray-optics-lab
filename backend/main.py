from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

from simulations.reflection import simulate_reflection
from simulations.refraction import simulate_refraction
from simulations.curved_mirror import simulate_curved_mirror
from simulations.mirror_image import calculate_mirror_image
from simulations.lens_image import calculate_lens_image
from simulations.lens_exact import simulate_exact_lens
from simulations.lens_system import simulate_lens_system
from simulations.prism import simulate_prism
from simulations.slab import simulate_slab, simulate_apparent_depth
from simulations.rainbow import simulate_rainbow
from simulations.mirage import simulate_mirage
from simulations.optical_instruments import (
    simulate_telescope,
    simulate_microscope,
)


app = FastAPI(
    title="Ray Optics Lab",
    description="Interactive Ray Optics Simulation Engine",
    version="0.2.0"
)


# -----------------------------
# CORS
# -----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Request Models
# -----------------------------

class ReflectionRequest(BaseModel):
    ray_angle: float
    mirror_angle: float
    ray_length: float


class RefractionRequest(BaseModel):
    incident_angle: float
    n1: float
    n2: float
    ray_length: float


# -----------------------------
# Basic Routes
# -----------------------------

@app.get("/")
def home():
    return {
        "message": "Ray Optics Lab backend is running!"
    }


@app.get("/health")
def health():
    return {
        "status": "OK"
    }


# -----------------------------
# Reflection Simulation
# -----------------------------

@app.post("/simulate/reflection")
def reflection(request: ReflectionRequest):

    ray_angle = np.radians(request.ray_angle)
    mirror_angle = np.radians(request.mirror_angle)

    # Incident ray direction
    ray_direction = np.array([
        np.cos(ray_angle),
        np.sin(ray_angle)
    ])

    # Mirror normal
    mirror_normal = np.array([
        -np.sin(mirror_angle),
        np.cos(mirror_angle)
    ])

    # Fixed point where the ray hits the mirror
    hit_point = np.array([0.0, 0.0])

    # Put the ray origin behind the hit point
    ray_origin = (
        hit_point
        - ray_direction * request.ray_length
    )

    result = simulate_reflection(
        ray_origin=ray_origin.tolist(),
        ray_direction=ray_direction.tolist(),
        mirror_point=hit_point.tolist(),
        mirror_normal=mirror_normal.tolist(),
        ray_length=request.ray_length
    )

    return result


# -----------------------------
# Refraction Simulation
# -----------------------------

@app.post("/simulate/refraction")
def refraction(request: RefractionRequest):

    try:
        return simulate_refraction(
            incident_angle=request.incident_angle,
            n1=request.n1,
            n2=request.n2,
            ray_length=request.ray_length
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))

# -----------------------------
# Curved Mirror Simulation
# -----------------------------

class CurvedMirrorRequest(BaseModel):
    ray_origin: list[float]
    ray_direction: list[float]
    mirror_center: list[float]
    radius: float
    ray_length: float
    mirror_type: str
    reflection_model: str = "exact"


@app.post("/simulate/curved-mirror")
def curved_mirror(request: CurvedMirrorRequest):

    result = simulate_curved_mirror(
        ray_origin=request.ray_origin,
        ray_direction=request.ray_direction,
        mirror_center=request.mirror_center,
        radius=request.radius,
        ray_length=request.ray_length,
        mirror_type=request.mirror_type,
        reflection_model=request.reflection_model
    )

    return result


# -----------------------------
# Mirror Image Simulation
# -----------------------------

class MirrorImageRequest(BaseModel):
    mirror_type: str
    radius: float
    object_distance: float
    object_height: float

@app.post("/simulate/mirror-image")
def mirror_image(request: MirrorImageRequest):
    try:
        return calculate_mirror_image(
            mirror_type=request.mirror_type,
            radius=request.radius,
            object_distance=request.object_distance,
            object_height=request.object_height
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Lens Image Simulation
# -----------------------------

class LensImageRequest(BaseModel):
    lens_type: str
    focal_length: float
    object_distance: float
    object_height: float


@app.post("/simulate/lens-image")
def lens_image(request: LensImageRequest):
    try:
        return calculate_lens_image(
            lens_type=request.lens_type,
            focal_length=request.focal_length,
            object_distance=request.object_distance,
            object_height=request.object_height
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Exact Lens (two spherical surfaces)
# -----------------------------

class LensExactRequest(BaseModel):
    n: float
    r1: float
    r2: float
    thickness: float
    aperture: float
    source: str = "parallel"
    object_distance: float = 30.0
    source_height: float = 0.0
    ray_count: int = 9


@app.post("/simulate/lens-exact")
def lens_exact(request: LensExactRequest):
    try:
        return simulate_exact_lens(
            n=request.n,
            r1=request.r1,
            r2=request.r2,
            thickness=request.thickness,
            aperture=request.aperture,
            source=request.source,
            object_distance=request.object_distance,
            source_height=request.source_height,
            ray_count=request.ray_count
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Lens Combination (2-4 thin lenses)
# -----------------------------

class LensSpec(BaseModel):
    lens_type: str
    focal_length: float


class LensSystemRequest(BaseModel):
    lenses: list[LensSpec]
    separations: list[float]
    object_distance: float
    object_height: float


@app.post("/simulate/lens-system")
def lens_system(request: LensSystemRequest):
    try:
        return simulate_lens_system(
            lenses=[
                {
                    "lens_type": lens.lens_type,
                    "focal_length": lens.focal_length,
                }
                for lens in request.lenses
            ],
            separations=request.separations,
            object_distance=request.object_distance,
            object_height=request.object_height
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Telescope (object at infinity)
# -----------------------------

class TelescopeRequest(BaseModel):
    kind: str = "keplerian"
    objective_focal_length: float
    eyepiece_focal_length: float
    field_angle: float
    aperture: float
    defocus: float = 0.0
    ray_count: int = 3


@app.post("/simulate/telescope")
def telescope(request: TelescopeRequest):
    try:
        return simulate_telescope(
            kind=request.kind,
            objective_focal_length=request.objective_focal_length,
            eyepiece_focal_length=request.eyepiece_focal_length,
            field_angle=request.field_angle,
            aperture=request.aperture,
            defocus=request.defocus,
            ray_count=request.ray_count
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Compound Microscope
# -----------------------------

class MicroscopeRequest(BaseModel):
    objective_focal_length: float
    eyepiece_focal_length: float
    object_distance: float
    object_height: float
    focus: str = "infinity"
    near_point: float = 25.0


@app.post("/simulate/microscope")
def microscope(request: MicroscopeRequest):
    try:
        return simulate_microscope(
            objective_focal_length=request.objective_focal_length,
            eyepiece_focal_length=request.eyepiece_focal_length,
            object_distance=request.object_distance,
            object_height=request.object_height,
            focus=request.focus,
            near_point=request.near_point
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Prism and Dispersion
# -----------------------------

class PrismRequest(BaseModel):
    apex_angle: float
    n_d: float
    abbe_number: float
    incidence_angle: float
    entry_fraction: float = 0.5
    spectrum_samples: int = 7
    wavelength_nm: float = 550.0
    screen_distance: float = 25.0


@app.post("/simulate/prism")
def prism(request: PrismRequest):
    try:
        return simulate_prism(
            apex_angle=request.apex_angle,
            n_d=request.n_d,
            abbe_number=request.abbe_number,
            incidence_angle=request.incidence_angle,
            entry_fraction=request.entry_fraction,
            spectrum_samples=request.spectrum_samples,
            wavelength_nm=request.wavelength_nm,
            screen_distance=request.screen_distance
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Glass Slab
# -----------------------------

class SlabRequest(BaseModel):
    incident_angle: float
    thickness: float
    n_slab: float
    n_in: float = 1.0
    n_out: float | None = None      # None = same medium as n_in
    ray_count: int = 3


@app.post("/simulate/slab")
def slab(request: SlabRequest):
    try:
        return simulate_slab(
            incident_angle=request.incident_angle,
            thickness=request.thickness,
            n_slab=request.n_slab,
            n_in=request.n_in,
            n_out=request.n_out,
            ray_count=request.ray_count
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Apparent Depth
# -----------------------------

class ApparentDepthRequest(BaseModel):
    depth: float
    n_below: float
    n_above: float = 1.0
    max_angle: float = 45.0
    ray_count: int = 7


@app.post("/simulate/apparent-depth")
def apparent_depth(request: ApparentDepthRequest):
    try:
        return simulate_apparent_depth(
            depth=request.depth,
            n_below=request.n_below,
            n_above=request.n_above,
            max_angle=request.max_angle,
            ray_count=request.ray_count
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Rainbow (light inside a spherical drop)
# -----------------------------

class RainbowRequest(BaseModel):
    n_d: float = 1.333
    abbe_number: float = 55.8
    impact_parameter: float = 0.86
    internal_reflections: int = 1
    spectrum_samples: int = 7


@app.post("/simulate/rainbow")
def rainbow(request: RainbowRequest):
    try:
        return simulate_rainbow(
            n_d=request.n_d,
            abbe_number=request.abbe_number,
            impact_parameter=request.impact_parameter,
            internal_reflections=request.internal_reflections,
            spectrum_samples=request.spectrum_samples
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))


# -----------------------------
# Mirage (rays bending in air with a temperature gradient)
# -----------------------------

class MirageRequest(BaseModel):
    observer_height: float = 1.7
    object_distance: float = 3000.0
    object_height: float = 12.0
    air_temperature: float = 25.0
    surface_temperature: float = 65.0
    layer_thickness: float = 0.15
    lapse_rate: float = 6.5
    inversion_strength: float = 0.0
    inversion_height: float = 25.0
    inversion_thickness: float = 4.0
    earth_curvature: bool = True
    ray_count: int = 21
    fan_scale: float = 1.0


@app.post("/simulate/mirage")
def mirage(request: MirageRequest):
    try:
        return simulate_mirage(
            observer_height=request.observer_height,
            object_distance=request.object_distance,
            object_height=request.object_height,
            air_temperature=request.air_temperature,
            surface_temperature=request.surface_temperature,
            layer_thickness=request.layer_thickness,
            lapse_rate=request.lapse_rate,
            inversion_strength=request.inversion_strength,
            inversion_height=request.inversion_height,
            inversion_thickness=request.inversion_thickness,
            earth_curvature=request.earth_curvature,
            ray_count=request.ray_count,
            fan_scale=request.fan_scale
        )
    except ValueError as error:
        # Bad input -> clear 422 message instead of a 500 crash.
        raise HTTPException(status_code=422, detail=str(error))
