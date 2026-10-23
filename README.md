# Ray Optics Lab

Interactive ray-optics simulations. A Python backend does the physics; a Next.js
frontend draws the ray diagrams and shows the results.

## Simulations

| Route | Simulation | Backend endpoint(s) |
|---|---|---|
| `/reflection` | Reflection from a plane mirror, with the vector calculation (d̂, n̂, r̂) | `/simulate/reflection` |
| `/refraction` | Refraction, Snell's law and total internal reflection | `/simulate/refraction` |
| `/slab` | Glass slab and apparent depth | `/simulate/slab`, `/simulate/apparent-depth` |
| `/mirror-image` | Spherical mirror image formation | `/simulate/mirror-image` |
| `/curved-mirror` | Curved mirror (exact and paraxial) with image formation | `/simulate/curved-mirror`, `/simulate/mirror-image` |
| `/lens-image` | Thin lens image formation | `/simulate/lens-image` |
| `/lens-exact` | Exact lens ray tracing | `/simulate/lens-exact` |
| `/lens-combination` | Combinations of lenses | `/simulate/lens-system` |
| `/instruments` | Microscope and telescope | `/simulate/microscope`, `/simulate/telescope` |
| `/prism` | Prism, dispersion and a total-internal-reflection preset | `/simulate/prism` |
| `/rainbow` | Rainbows (primary and secondary) | `/simulate/rainbow` |
| `/mirage` | Mirages (inferior, superior, Fata Morgana) | `/simulate/mirage` |

Other routes: `/` (landing page) and `/simulations` (searchable directory with
category filters).

> The reflection simulation used to be the home page (`/`). It now lives at
> `/reflection`.

## Requirements

- Node.js 20.9 or newer
- Python 3 with `fastapi`, `uvicorn`, `pydantic` and `numpy`
  (and `pytest` to run the tests)

## Run it

Backend (port 8000):

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install fastapi uvicorn pydantic numpy pytest
uvicorn main:app --reload --port 8000
```

Frontend (port 3000), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The first start needs internet access once, because
Next downloads the two Google fonts (Space Grotesk and Space Mono).

### Configuration

The frontend talks to `http://127.0.0.1:8000` by default. To use another address,
create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

All pages read this one setting (`frontend/lib/config.ts`). The backend only
allows browser requests from `http://localhost:3000` and `http://127.0.0.1:3000`
(see the CORS block in `backend/main.py`); add your origin there if you serve the
frontend from somewhere else.

### Checks

```bash
cd backend && python -m pytest tests     # physics tests
cd frontend && npm run lint
cd frontend && npm run build
```

`npm run build` and `npm run dev` generate the `LayoutProps` type that
`app/layout.tsx` uses. A bare `tsc --noEmit` before the first build reports that
one name as missing; that is expected.

## Project layout

```
backend/
  main.py            FastAPI app and endpoints
  physics/           core optics maths
  objects/           optical elements
  simulations/       one module per simulation
  tests/             physics tests
frontend/
  app/
    layout.tsx       fonts, theme script, shell wrapper
    globals.css      design tokens (colours, type scale) for both themes
    page.tsx         landing page
    simulations/     directory with search and category filters
    <simulation>/    page.tsx, layout.tsx (tab title), drawing.ts where present
    components/      Shell, SidebarNav, Breadcrumb, SimPager, ThemeProvider,
                     ThemeToggle, Logo, SiteHeader, SiteFooter, ui
  lib/
    simulations.ts   registry of every simulation (single source of truth)
    config.ts        API base URL
    canvasTheme.ts   theme-aware colours and fonts for canvas drawing
```

## Design system

- **Fonts:** Space Grotesk for interface text; Space Mono for numbers, units,
  angles and small technical labels.
- **Tokens:** every colour is a CSS variable in `app/globals.css`, defined for
  `[data-theme="dark"]` and `[data-theme="light"]` (surfaces, text, borders, red
  accent, status colours, diagram and ray colours). Use the variables, not hex
  values, in components.
- **Theme:** `ThemeProvider` follows the system setting until the user chooses,
  stores the choice in `localStorage` (`ray-optics-theme`) and applies it before
  first paint through a small script in `layout.tsx`, so there is no flash.
- **Canvases:** drawing code passes every colour through `tcol()` from
  `lib/canvasTheme.ts`, which leaves light-theme colours unchanged and maps them
  to dark-theme equivalents. A page calls `setCanvasTheme(theme)` before drawing
  and lists `theme` in its draw effect's dependencies so the diagram redraws when
  the theme changes. Coordinates and physics are never touched by theming.
- **Shell:** simulation routes are wrapped automatically (sidebar on large
  screens, drawer on small ones, breadcrumb, previous/next links). The wrapper
  decides by looking the URL up in the registry.

Contrast of every token pair was checked against WCAG (text 4.5:1, control
borders and graphics 3:1) in both themes. Inputs have associated labels, canvases
have accessible names, focus rings are visible and motion is reduced when the
system asks for it.

## Adding a simulation

1. Add the endpoint and physics in `backend/` (with tests).
2. Create `frontend/app/<slug>/page.tsx` and a small `layout.tsx` exporting
   `metadata` for the tab title.
3. Add an entry to `SIMULATIONS` in `frontend/lib/simulations.ts` (title,
   description, category, search keywords). The directory, sidebar, breadcrumb,
   search and previous/next links pick it up from there.
4. If it draws on a canvas, wrap colours in `tcol()` and set the theme as above.

## Known limitations

- Text drawn on the canvases still uses Arial, except on the reflection page.
- A few lint errors in the original code remain (unescaped apostrophes in
  `refraction`, `prefer-const` in `prism/drawing.ts`, and effect-ordering
  warnings in `refraction` and `curved-mirror`).
- The interface has been checked with the TypeScript compiler, ESLint, scripted
  tests of the search and vector maths, and manual use in the browser. There are
  no automated end-to-end browser tests.
- Atmospheric refraction, multiple or thin prism combinations and extra mirror
  and refraction edge cases are not implemented.
