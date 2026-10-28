<div align="center">

# Ray Optics Lab

### An Interactive Ray Optics Simulation Laboratory

Explore geometrical optics through interactive ray diagrams, optical instruments, and physics-based simulations.

[**Live Demo**](https://ray-optics-lab.vercel.app/) ·
[**Backend API**](https://ray-optics-lab.onrender.com/) ·
[**API Documentation**](https://ray-optics-lab.onrender.com/docs)

</div>

---

## Overview

**Ray Optics Lab** is a web-based learning project for exploring ray optics concepts visually. It combines a modern frontend with a Python API to calculate and display optical behaviour across a range of simulations.

The goal is to make concepts such as reflection, refraction, image formation, total internal reflection, and atmospheric effects easier to understand through interactive visualizations.

## Features

The project includes simulations and learning tools covering:

- **Reflection and refraction** — investigate how light rays behave at optical boundaries.
- **Curved mirrors** — explore concave and convex mirror behaviour.
- **Lens simulations** — study image formation, exact/paraxial lens behaviour, and combinations of lenses.
- **Prisms and dispersion** — explore ray deviation and the separation of light.
- **Optical slabs and apparent depth** — examine refraction through parallel-sided media and apparent position.
- **Total internal reflection (TIR)** — visualize the conditions for total internal reflection.
- **Optical fibre** — explore light propagation and the guiding principle of total internal reflection in an optical fibre.
- **Optical instruments** — learn about microscope and telescope ray diagrams.
- **Atmospheric refraction** — explore how changes in atmospheric conditions affect the path of light.
- **Mirage** — visualize a simplified ray-path explanation of mirage formation.
- **Rainbow and dispersion effects** — explore optical effects associated with dispersion and refraction.

> Simulation availability and the level of physical modelling can vary by module. Use the individual simulation controls and outputs to explore each topic.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | Python, FastAPI |
| Testing | pytest |
| Frontend deployment | Vercel |
| Backend deployment | Render |

## Live Project

- **Web application:** https://ray-optics-lab.vercel.app/
- **Backend health endpoint:** https://ray-optics-lab.onrender.com/health
- **Interactive API docs:** https://ray-optics-lab.onrender.com/docs

The backend is hosted on Render's free service. After a period of inactivity, it may take a little time to wake up when a request arrives.

## Run Locally

### Prerequisites

Install the following before starting:

- Python
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/sAi-ShUbHaM/ray-optics-lab.git
cd ray-optics-lab
```

### 2. Start the backend

Open a terminal in the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Windows Command Prompt:**

```bat
.venv\Scripts\activate.bat
```

Install the backend dependencies and start the API:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend should now be available at:

- API: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs

Keep this terminal running.

### 3. Configure and start the frontend

Open a **second terminal** in the repository root:

```bash
cd frontend
```

Create a `.env.local` file inside `frontend/` with:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Install frontend dependencies and start the development server:

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Run Tests

From the repository root, activate the backend virtual environment and run:

```bash
cd backend
python -m pytest -v
```

To run only the optical fibre simulation tests:

```bash
python -m pytest tests/test_optical_fibre.py -v
```

If your project uses a virtual environment, make sure it is activated before running the tests.

## Deployment Notes

### Frontend — Vercel

Configure the frontend project with `frontend` as its root directory. Set the environment variable:

```env
NEXT_PUBLIC_API_URL=https://ray-optics-lab.onrender.com
```

Redeploy the frontend after changing environment variables.

### Backend — Render

Configure the backend service with `backend` as its root directory.

- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Make sure the backend CORS configuration permits requests from the deployed frontend domain.

## Project Structure

```text
ray-optics-lab/
├── backend/
│   ├── main.py
│   ├── physics/
│   ├── simulations/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── lib/
│   ├── public/
│   └── package.json
└── README.md
```

This is a high-level overview. Exact files and folders may change as the project evolves.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make and test your changes.
4. Open a pull request describing the change.

For simulation changes, include tests where practical and document the assumptions used by the optical model.

## Roadmap

Potential areas for future improvement:

- Improve the accuracy and clarity of ray diagrams.
- Expand simulation controls and explanatory outputs.
- Add more optical systems and combined setups.
- Improve test coverage and error handling.
- Continue refining the UI and learning experience.

## Author

**Shubham**

GitHub: [@sAi-ShUbHaM](https://github.com/sAi-ShUbHaM)

---

If you find the project useful, consider giving the repository a star.
