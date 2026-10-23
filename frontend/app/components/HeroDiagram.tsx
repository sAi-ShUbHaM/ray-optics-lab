/**
 * Decorative-but-honest hero figure: parallel rays through a thin convex lens
 * converge at the focal point F. Geometry is computed, not hand-placed.
 */
export function HeroDiagram() {
  const axisY = 180;
  const lensX = 210;
  const focal = 220;
  const focusX = lensX + focal;
  const startX = 24;
  const endX = 536;
  const heights = [-112, -72, -34, 34, 72, 112];

  return (
    <svg
      viewBox="0 0 560 360"
      role="img"
      aria-label="Diagram: parallel rays pass through a convex lens and converge at the focal point F on the optical axis."
      className="h-auto w-full"
    >
      <line
        x1={startX - 8}
        y1={axisY}
        x2={endX + 12}
        y2={axisY}
        stroke="var(--diagram-axis)"
        strokeWidth="1"
      />
      {/* lens */}
      <path
        d={`M${lensX} 56c-34 52-34 196 0 248 34-52 34-196 0-248Z`}
        fill="var(--diagram-element-fill)"
        stroke="var(--diagram-element)"
        strokeWidth="1.25"
      />
      {heights.map((h) => {
        const y = axisY + h;
        const slope = (axisY - y) / (focusX - lensX);
        const outY = y + slope * (endX - lensX);
        return (
          <g key={h} fill="none" strokeWidth="1.25" strokeLinecap="round">
            <line x1={startX} y1={y} x2={lensX} y2={y} stroke="var(--ray-incident)" />
            <path
              d={`M${startX + 78} ${y - 4}l8 4-8 4`}
              stroke="var(--ray-incident)"
            />
            <line x1={lensX} y1={y} x2={endX} y2={outY} stroke="var(--ray-refracted)" />
          </g>
        );
      })}
      {/* focal point */}
      <circle cx={focusX} cy={axisY} r="4.5" fill="var(--accent)" />
      <line
        x1={focusX}
        y1={axisY + 10}
        x2={focusX}
        y2={axisY + 30}
        stroke="var(--diagram-axis)"
        strokeWidth="1"
      />
      <text
        x={focusX}
        y={axisY + 46}
        textAnchor="middle"
        fill="var(--diagram-label)"
        style={{ font: "400 13px var(--font-space-mono), monospace" }}
      >
        F
      </text>
      <text
        x={startX}
        y={axisY + 20}
        fill="var(--diagram-label)"
        style={{ font: "400 11px var(--font-space-mono), monospace", letterSpacing: "0.08em" }}
      >
        OPTICAL AXIS
      </text>
    </svg>
  );
}
