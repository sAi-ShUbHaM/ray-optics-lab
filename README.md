# Ray Optics Lab

An interactive ray-optics simulator for exploring geometrical optics through visual ray diagrams, adjustable parameters, and physics-based calculations.

**Live Demo:** https://ray-optics-lab.vercel.app/

**Backend API:** https://ray-optics-lab.onrender.com/

**API Documentation:** https://ray-optics-lab.onrender.com/docs

## Overview

Ray Optics Lab is an educational web application designed to make geometrical optics easier to explore. Users can adjust simulation parameters and observe how light rays interact with mirrors, lenses, prisms, refractive surfaces, and atmospheric models.

The project uses a Next.js frontend and a Python FastAPI backend, separating the user interface from the optical calculations.

## Features

### Basic Optics
- Reflection from plane mirrors
- Refraction and Snell's law
- Total internal reflection (TIR)
- Parallel glass slab and lateral displacement

### Mirrors and Lenses
- Concave and convex spherical mirrors
- Mirror image formation
- Lens image formation
- Exact and paraxial lens calculations, where supported
- Lens combinations and equivalent focal length

### Optical Components and Instruments
- Prism deviation
- Dispersion and wavelength-dependent refraction
- Apparent depth
- Compound microscope
- Astronomical telescope

### Atmospheric and Natural Optical Phenomena
- Mirage simulation
- **Atmospheric refraction**, modelling how changes in atmospheric refractive index affect light paths and apparent celestial positions
- Rainbow simulation

The atmospheric refraction model uses a simplified ray-optics approach. It is intended for educational exploration and should not be interpreted as a complete numerical weather or atmospheric model.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend API | Python, FastAPI |
| Numerical calculations | Python and NumPy, where used |
| Request validation | Pydantic |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Testing | pytest |

## Architecture

```text
User
 |
 v
Next.js / React Frontend
 |
 | HTTP requests (JSON)
 v
FastAPI Backend
 |
 v
Optical Simulation Modules
 |
 v
Calculated Results
 |
 v
Interactive Ray Diagrams
```

The frontend handles user interaction and visualisation. The backend validates simulation inputs, performs calculations, and returns results to the frontend.

## Run Locally

### Prerequisites

- Python installed
- Node.js and npm installed
- Git

### 1. Clone the repository

```bash
git clone https://github.com/sAi-ShUbHaM/ray-optics-lab.git
cd ray-optics-lab
```

### 2. Start the backend

Open a terminal:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend documentation should now be available at:

http://127.0.0.1:8000/docs

### 3. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with the following configuration for local development:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Start Next.js:

```bash
npm run dev
```

Open:

http://localhost:3000

Keep both development servers running while using the application.

## Running Tests

From the repository root, activate the backend virtual environment if it is not already active.

Run the atmospheric refraction tests:

```bash
cd backend
python -m pytest tests/test_atmospheric_refraction.py -v
```

These tests cover the atmospheric refraction module's implemented test cases. Passing tests do not, by themselves, establish the accuracy of every possible atmospheric condition or every simulation in the application.

## Deployment

The application uses separate frontend and backend deployments.

- **Vercel:** serves the Next.js frontend.
- **Render:** runs the FastAPI backend.

The frontend uses the `NEXT_PUBLIC_API_URL` environment variable to determine which backend it should call.

For production, configure the frontend environment variable to point to the deployed backend API. For local development, use the localhost configuration shown above.

The hosted backend may take additional time to respond after a period of inactivity, depending on the hosting plan.

## Educational Scope and Limitations

Ray Optics Lab focuses on geometrical ray optics and educational models of optical phenomena.

Atmospheric refraction, mirages, rainbows, and dispersion may involve simplifying assumptions. Results should be interpreted according to the model and parameter ranges implemented by each simulation.

The project is not intended to replace laboratory measurements, professional optical-design software, or comprehensive atmospheric modelling.

## Future Development

Potential future improvements include:

- More scientifically validated simulation models
- Additional guided experiments for school and college students
- Improved accessibility and mobile usability
- An interactive 3D optics environment
- A standalone Windows desktop application

These are development goals, not claims that all of these features are currently available.

## Contributing

Contributions, suggestions, and bug reports are welcome. When reporting an issue, include the simulation involved, the input parameters used, the expected result, and the observed behaviour.

## Project Links

- **Repository:** https://github.com/sAi-ShUbHaM/ray-optics-lab
- **Live Application:** https://ray-optics-lab.vercel.app/
- **Backend Health Check:** https://ray-optics-lab.onrender.com/health
- **Interactive API Docs:** https://ray-optics-lab.onrender.com/docs
