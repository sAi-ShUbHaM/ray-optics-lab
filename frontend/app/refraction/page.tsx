"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol } from "@/lib/canvasTheme";
import { computeRefractionVectors, directionOf } from "./vectors";
import { drawRefractionOverlay } from "./overlay";
import { RefractionVectorPanel } from "./VectorPanel";
import Link from "next/link";

type Point = [number, number];

type RefractionResult = {
  hit: boolean;
  tir: boolean;

  incident_ray?: {
    start: Point;
    end: Point;
  };

  refracted_ray?: {
    start: Point;
    end: Point;
  };

  reflected_ray?: {
    start: Point;
    end: Point;
  };

  hit_point?: Point;

  incident_angle?: number;
  refracted_angle?: number;

  n1?: number;
  n2?: number;

  message?: string;
};

export default function RefractionPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [incidentAngle, setIncidentAngle] = useState(30);
  const [n1, setN1] = useState(1.0);
  const [n2, setN2] = useState(1.5);
  const [rayLength, setRayLength] = useState(6);

  const [result, setResult] =
    useState<RefractionResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [showVectors, setShowVectors] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Re-runs whenever a control changes (the Simulate button re-runs it too).
  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`${API_BASE}/simulate/refraction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            incident_angle: incidentAngle,
            n1: n1,
            n2: n2,
            ray_length: rayLength,
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const data: RefractionResult = await response.json();

        if (!controller.signal.aborted) {
          setResult(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Could not connect to backend:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [incidentAngle, n1, n2, rayLength, reloadKey]);


  useEffect(() => {
    setCanvasTheme(theme);

    if (result?.hit) {
      drawSimulation(result);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");

      if (
        showVectors &&
        canvas &&
        ctx &&
        result.hit_point &&
        result.incident_angle !== undefined &&
        result.n1 !== undefined &&
        result.n2 !== undefined
      ) {
        // same mapping as drawSimulation: origin at the interface, 55 px per unit
        const toCanvas = (p: Point): Point => [
          canvas.width / 2 + p[0] * 55,
          canvas.height / 2 - p[1] * 55,
        ];

        drawRefractionOverlay(
          ctx,
          toCanvas,
          result.hit_point,
          computeRefractionVectors(result.incident_angle, result.n1, result.n2),
        );
      }
    }
  }, [result, theme, showVectors]);


  function drawSimulation(
    data: RefractionResult
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const interfaceY = height / 2;

    /*
      Medium 1:
      Upper part of canvas

      Medium 2:
      Lower part of canvas
    */

    ctx.fillStyle = tcol("#eef2ff");

    ctx.fillRect(
      0,
      0,
      width,
      interfaceY
    );

    ctx.fillStyle = tcol("#f8fafc");

    ctx.fillRect(
      0,
      interfaceY,
      width,
      height - interfaceY
    );

    const scale = 55;

    const centerX = width / 2;
    const centerY = interfaceY;

    function toCanvas(
      point: Point
    ): Point {
      return [
        centerX + point[0] * scale,
        centerY - point[1] * scale,
      ];
    }

    const hitPoint =
      toCanvas(data.hit_point!);

    const incidentStart =
      toCanvas(
        data.incident_ray!.start
      );

    const incidentEnd =
      toCanvas(
        data.incident_ray!.end
      );

    /*
      ============================
      MEDIUM INTERFACE
      ============================
    */

    ctx.beginPath();

    ctx.moveTo(
      0,
      interfaceY
    );

    ctx.lineTo(
      width,
      interfaceY
    );

    ctx.strokeStyle = tcol("#111827");

    ctx.lineWidth = 4;

    ctx.stroke();

    /*
      ============================
      NORMAL
      ============================
    */

    const normalLength = 2.5;

    const normalStart = toCanvas([0, -normalLength]);

    const normalEnd =
      toCanvas([
        0,
        normalLength,
      ]);

    ctx.beginPath();

    ctx.moveTo(
      normalStart[0],
      normalStart[1]
    );

    ctx.lineTo(
      normalEnd[0],
      normalEnd[1]
    );

    ctx.strokeStyle = tcol("#64748b");

    ctx.lineWidth = 2;

    ctx.setLineDash([8, 8]);

    ctx.stroke();

    ctx.setLineDash([]);

    /*
      ============================
      INCIDENT RAY
      ============================
    */

    ctx.beginPath();

    ctx.moveTo(
      incidentStart[0],
      incidentStart[1]
    );

    ctx.lineTo(
      incidentEnd[0],
      incidentEnd[1]
    );

    ctx.strokeStyle = tcol("#2563eb");

    ctx.lineWidth = 4;

    ctx.lineCap = "round";

    ctx.stroke();

    /*
      ============================
      REFRACTED RAY
      ============================
    */

    if (
      !data.tir &&
      data.refracted_ray
    ) {
      const refractedStart =
        toCanvas(
          data.refracted_ray.start
        );

      const refractedEnd =
        toCanvas(
          data.refracted_ray.end
        );

      ctx.beginPath();

      ctx.moveTo(
        refractedStart[0],
        refractedStart[1]
      );

      ctx.lineTo(
        refractedEnd[0],
        refractedEnd[1]
      );

      ctx.strokeStyle = tcol("#dc2626");

      ctx.lineWidth = 4;

      ctx.lineCap = "round";

      ctx.stroke();
    }

    /*
      ============================
      TIR REFLECTED RAY
      ============================
    */

    if (
      data.tir &&
      data.reflected_ray
    ) {
      const reflectedStart =
        toCanvas(
          data.reflected_ray.start
        );

      const reflectedEnd =
        toCanvas(
          data.reflected_ray.end
        );

      ctx.beginPath();

      ctx.moveTo(
        reflectedStart[0],
        reflectedStart[1]
      );

      ctx.lineTo(
        reflectedEnd[0],
        reflectedEnd[1]
      );

      ctx.strokeStyle = tcol("#dc2626");

      ctx.lineWidth = 4;

      ctx.lineCap = "round";

      ctx.stroke();

      /*
        Reflected ray label
      */

      ctx.fillStyle = tcol("#dc2626");

      ctx.font = "17px Arial";

      ctx.fillText(
        "Reflected Ray",
        reflectedEnd[0] - 130,
        reflectedEnd[1] - 15
      );
    }

    /*
      ============================
      HIT POINT
      ============================
    */

    ctx.beginPath();

    ctx.arc(
      hitPoint[0],
      hitPoint[1],
      7,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = tcol("#111827");

    ctx.fill();

    /*
      ============================
      LABELS
      ============================
    */

    ctx.font = "17px Arial";

    ctx.fillStyle = tcol("#111827");

    ctx.fillText(
      "Medium 1",
      30,
      interfaceY + 40
    );

    ctx.fillText(
      `n₁ = ${(data.n1 ?? n1).toFixed(2)}`,
      30,
      interfaceY + 65
    );

    ctx.fillText(
      "Medium 2",
      30,
      40
    );

    ctx.fillText(
      `n₂ = ${(data.n2 ?? n2).toFixed(2)}`,
      30,
      65
    );

    ctx.fillText(
      "Interface",
      width - 100,
      interfaceY - 15
    );

    ctx.fillText(
      "Normal",
      normalEnd[0] + 12,
      normalEnd[1]
    );

    /*
      ============================
      INCIDENT RAY LABEL
      ============================
    */

    ctx.fillStyle = tcol("#2563eb");

    ctx.fillText(
      "Incident Ray",
      incidentStart[0] + 15,
      incidentStart[1] - 10
    );

    /*
      ============================
      REFRACTED RAY LABEL
      ============================
    */

    if (
      !data.tir &&
      data.refracted_ray
    ) {
      const refractedEnd =
        toCanvas(
          data.refracted_ray.end
        );

      ctx.fillStyle = tcol("#dc2626");

      ctx.fillText(
        "Refracted Ray",
        refractedEnd[0] - 130,
        refractedEnd[1] + 25
      );
    }

    /*
      ============================
      TIR MESSAGE
      ============================
    */

    if (data.tir) {
      ctx.fillStyle = tcol("#dc2626");

      ctx.font = "bold 22px Arial";

      ctx.fillText(
        "TOTAL INTERNAL REFLECTION",
        width / 2 - 150,
        45
      );
    }
  }

  const shownN1 = result?.n1 ?? n1;
  const shownN2 = result?.n2 ?? n2;

  const criticalAngle =
    shownN1 > shownN2
      ? Math.asin(shownN2 / shownN1) * (180 / Math.PI)
      : null;

  const vectors =
    result?.hit &&
    result.incident_angle !== undefined &&
    result.n1 !== undefined &&
    result.n2 !== undefined
      ? computeRefractionVectors(result.incident_angle, result.n1, result.n2)
      : null;

  return (
    <main
      style={{
        padding: "28px clamp(16px, 3vw, 32px)",
        background: "transparent",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        <Link
          href="/reflection"
          style={{
            textDecoration: "none",
            color: "var(--text)",
            fontWeight: "600",
          }}
        >
          ← Reflection Simulator
        </Link>

        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Refraction Simulator
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "30px",
          }}
        >
          Explore Snell&apos;s Law and Total Internal Reflection
        </p>

        {/* simulation on the left, controls and vector analysis on the right */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
          <div className="min-w-0 xl:sticky xl:top-20">
        {/* CANVAS */}

        <section
          style={{
            background: "var(--surface)",
            borderRadius: "14px",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <canvas role="img" aria-label="Ray diagram for refraction at a boundary"
            ref={canvasRef}
            width={1000}
            height={600}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
            }}
          />
        </section>

          </div>
          <div className="min-w-0">
        {/* CONTROLS */}

        <section
          style={{
            background: "var(--surface)",
            padding: "25px",
            borderRadius: "14px",
            marginBottom: "25px",
            border: "1px solid var(--border)",
          }}
        >
          <h2>
            Simulation Controls
          </h2>

          {/* Incident angle */}

          <div
            style={{
              marginTop: "25px",
            }}
          >
            <label htmlFor="refraction-ctl-1">
              Incident Angle:{" "}
              <strong>
                {incidentAngle}°
              </strong>
            </label>

            <input id="refraction-ctl-1"
              type="range"
              min="0"
              max="90"
              value={incidentAngle}
              onChange={(e) =>
                setIncidentAngle(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                marginTop: "8px",
              }}
            />
          </div>

          {/* n1 */}

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <label htmlFor="refraction-ctl-2">
              Refractive Index n₁:{" "}
              <strong>
                {n1.toFixed(2)}
              </strong>
            </label>

            <input id="refraction-ctl-2"
              type="range"
              min="1"
              max="2.5"
              step="0.01"
              value={n1}
              onChange={(e) =>
                setN1(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                marginTop: "8px",
              }}
            />
          </div>

          {/* n2 */}

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <label htmlFor="refraction-ctl-3">
              Refractive Index n₂:{" "}
              <strong>
                {n2.toFixed(2)}
              </strong>
            </label>

            <input id="refraction-ctl-3"
              type="range"
              min="1"
              max="2.5"
              step="0.01"
              value={n2}
              onChange={(e) =>
                setN2(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                marginTop: "8px",
              }}
            />
          </div>

          {/* Ray length */}

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <label htmlFor="refraction-ctl-4">
              Ray Length:{" "}
              <strong>
                {rayLength}
              </strong>
            </label>

            <input id="refraction-ctl-4"
              type="range"
              min="2"
              max="8"
              step="0.5"
              value={rayLength}
              onChange={(e) =>
                setRayLength(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                marginTop: "8px",
              }}
            />
          </div>

          <label

            style={{

              display: "flex",

              alignItems: "center",

              gap: "10px",

              marginTop: "20px",

            }}

          >

            <input

              type="checkbox"

              checked={showVectors}

              onChange={(e) => setShowVectors(e.target.checked)}

            />

            Show vectors and angles on the diagram

          </label>


          <button

            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            style={{
              marginTop: "25px",
              padding: "12px 24px",
              borderRadius: "8px",
              border: "none",
              background: loading
                ? "var(--text-muted)"
                : "var(--text)",
              color: "var(--bg)",
              fontSize: "16px",
              cursor: loading
                ? "not-allowed"
                : "pointer",
            }}
          >
            {loading
              ? "Simulating..."
              : "Simulate"}
          </button>
        </section>


            {vectors ? (
              <RefractionVectorPanel
                vectors={vectors}
                backendDirection={directionOf(
                  result?.tir ? result.reflected_ray : result?.refracted_ray,
                )}
              />
            ) : null}
          </div>
        </div>

        {/* results and notes */}
        {/* RESULTS */}

        {result && (
          <section
            style={{
              marginTop: "25px",
              background: "var(--surface)",
              padding: "25px",
              borderRadius: "14px",
              border: "1px solid var(--border)",
            }}
          >
            <h2>
              Results
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "15px",
                marginTop: "20px",
              }}
            >
              <div>
                <strong>
                  Incident Angle
                </strong>

                <p>
                  {result.incident_angle?.toFixed(2)}°
                </p>
              </div>

              <div>
                <strong>
                  Refracted Angle
                </strong>

                <p>
                  {result.tir
                    ? "No refraction"
                    : `${result.refracted_angle?.toFixed(2)}°`}
                </p>
              </div>

              <div>
                <strong>
                  n₁
                </strong>

                <p>
                  {result.n1}
                </p>
              </div>

              <div>
                <strong>
                  n₂
                </strong>

                <p>
                  {result.n2}
                </p>
              </div>
            </div>

            {criticalAngle !== null && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "15px",
                  borderRadius: "8px",
                  background: "var(--bg-secondary)",
                }}
              >
                Critical Angle:{" "}
                <strong>
                  {criticalAngle.toFixed(2)}°
                </strong>
              </div>
            )}

            {result.tir && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  borderRadius: "8px",
                  background: "color-mix(in srgb, var(--error) 14%, var(--surface))",
                  color: "var(--error)",
                  fontWeight: "600",
                }}
              >
                ⚠ Total Internal Reflection
                occurred.
                <br />
                The incident ray is completely
                reflected back into Medium 1.
              </div>
            )}
          </section>
        )}

        {/* FORMULA */}

        <section
          style={{
            marginTop: "25px",
            background: "var(--text)",
            color: "var(--bg)",
            padding: "25px",
            borderRadius: "14px",
          }}
        >
          <h2>
            Snell&apos;s Law
          </h2>

          <p
            style={{
              fontSize: "22px",
              marginTop: "15px",
            }}
          >
            n₁ sin(θ₁) = n₂ sin(θ₂)
          </p>

          <p
            style={{
              color: "var(--text-muted)",
              marginTop: "12px",
            }}
          >
            Light bends toward the normal when
            entering a medium with a higher
            refractive index and away from the
            normal when entering a lower-index
            medium.
          </p>
        </section>
      </div>
    </main>
  );
}