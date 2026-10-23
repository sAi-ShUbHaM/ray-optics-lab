
"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol } from "@/lib/canvasTheme";
import { API_BASE } from "@/lib/config";
import Link from "next/link";

type Point = [number, number];

type CurvedMirrorResult = {
  hit: boolean;
  mirror_type?: string;
  reflection_model?: string;

  ray?: {
    start: Point;
    end: Point;
  };

  reflected_ray?: {
    start: Point;
    end: Point;
  };

  hit_point?: Point;
  normal?: Point;
  reflected_direction?: Point;

  center?: Point;
  radius?: number;
  focal_length?: number;
  focus?: Point;

  message?: string;
};

type MirrorImageResult = {
  valid: boolean;

  mirror_type: string;

  radius: number;
  focal_length: number;

  object_distance: number;
  object_height: number;

  image_distance?: number;
  signed_image_distance?: number;
  image_height?: number;
  magnification?: number;

  image_type?: string;
  orientation?: string;
  size?: string;

  object_position?: string;
  image_position?: string;

  image_at_infinity?: boolean;

  message?: string;

  object_point?: Point;
  object_base?: Point;
  image_point?: Point | null;
  image_base?: Point | null;
  principal_rays?: {
    name: string;
    type: string;
    incident: Point[];
    reflected: Point[];
    hit_point?: Point;
    backward_extension?: Point[];
  }[];
};

export default function CurvedMirrorPage() {
  const { theme } = useTheme();
  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  // ==========================================
  // CURVED MIRROR RAY SIMULATION STATES
  // ==========================================

  const [radius, setRadius] = useState(5);

  const [rayHeight, setRayHeight] =
    useState(2);

  const [incidentAngle, setIncidentAngle] =
    useState(0);

  const [rayLength, setRayLength] =
    useState(10);

  const [mirrorType, setMirrorType] =
    useState<"concave" | "convex">(
      "concave"
    );

  const [reflectionModel, setReflectionModel] =
    useState<"exact" | "paraxial">(
      "exact"
    );

  const [result, setResult] =
    useState<CurvedMirrorResult | null>(
      null
    );

  const [loading, setLoading] =
    useState(false);

  // ==========================================
  // IMAGE FORMATION STATES
  // ==========================================

  const [objectDistance, setObjectDistance] =
    useState(10);

  const [objectHeight, setObjectHeight] =
    useState(3);

  const [imageResult, setImageResult] =
    useState<MirrorImageResult | null>(
      null
    );

  const [imageLoading, setImageLoading] =
    useState(false);

  // ==========================================
  // CURVED MIRROR RAY SIMULATION
  // Re-runs whenever a control changes (the Simulate button re-runs it too).
  // ==========================================
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const angle = (incidentAngle * Math.PI) / 180;

        const direction: Point = [Math.cos(angle), Math.sin(angle)];

        const origin: Point = [-10, rayHeight];

        const center: Point =
          mirrorType === "concave" ? [-radius, 0] : [radius, 0];

        const response = await fetch(`${API_BASE}/simulate/curved-mirror`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            ray_origin: origin,
            ray_direction: direction,
            mirror_center: center,
            radius: radius,
            ray_length: rayLength,
            mirror_type: mirrorType,
            reflection_model: reflectionModel,
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const data: CurvedMirrorResult = await response.json();

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
  }, [
    radius,
    rayHeight,
    incidentAngle,
    rayLength,
    mirrorType,
    reflectionModel,
    reloadKey,
  ]);

  // ==========================================
  // IMAGE FORMATION CALCULATOR
  // Re-runs whenever the mirror or the object sliders change.
  // ==========================================
  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setImageLoading(true);

      try {
        const response = await fetch(`${API_BASE}/simulate/mirror-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            mirror_type: mirrorType,
            radius: radius,
            object_distance: objectDistance,
            object_height: objectHeight,
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const data: MirrorImageResult = await response.json();

        if (!controller.signal.aborted) {
          setImageResult(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Could not calculate image:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setImageLoading(false);
        }
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mirrorType, radius, objectDistance, objectHeight]);

  // ==========================================
  // REDRAW CANVAS
  // ==========================================

  useEffect(() => {
    setCanvasTheme(theme);
    if (result?.hit) {
      drawSimulation(result);
    }
  }, [result, imageResult, theme]);
  // ==========================================
  // DRAW RAY SIMULATION
  // ==========================================

  function drawSimulation(
    data: CurvedMirrorResult
  ) {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const center = data.center!;
    const R = data.radius!;
    const hitPoint = data.hit_point!;

    const incidentStart =
      data.ray!.start;

    const reflectedEnd =
      data.reflected_ray!.end;

    const focus: Point =
      data.focus ??
      (data.mirror_type === "concave"
        ? [-R / 2, 0]
        : [R / 2, 0]);

    const points: Point[] = [
      incidentStart,
      hitPoint,
      reflectedEnd,
      center,
      focus,
      [0, 0],
      [
        center[0],
        center[1] + R,
      ],
      [
        center[0],
        center[1] - R,
      ],
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(
        minX,
        point[0]
      );

      maxX = Math.max(
        maxX,
        point[0]
      );

      minY = Math.min(
        minY,
        point[1]
      );

      maxY = Math.max(
        maxY,
        point[1]
      );
    }

    const padding = 2;

    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    const worldWidth =
      maxX - minX;

    const worldHeight =
      maxY - minY;

    const scaleX =
      width / worldWidth;

    const scaleY =
      height / worldHeight;

    const scale =
      Math.min(
        scaleX,
        scaleY
      ) * 0.82;

    const worldCenterX =
      (minX + maxX) / 2;

    const worldCenterY =
      (minY + maxY) / 2;

    const canvasCenterX =
      width / 2;

    const canvasCenterY =
      height / 2;

    function toCanvas(
      point: Point
    ): Point {
      return [
        canvasCenterX +
          (point[0] -
            worldCenterX) *
            scale,

        canvasCenterY -
          (point[1] -
            worldCenterY) *
            scale,
      ];
    }

    // ========================================
    // BACKGROUND
    // ========================================

    ctx.fillStyle = tcol("#f8fafc");

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    // ========================================
    // PRINCIPAL AXIS
    // ========================================

    const axisStart =
      toCanvas([
        minX,
        0,
      ]);

    const axisEnd =
      toCanvas([
        maxX,
        0,
      ]);

    ctx.beginPath();

    ctx.moveTo(
      axisStart[0],
      axisStart[1]
    );

    ctx.lineTo(
      axisEnd[0],
      axisEnd[1]
    );

    ctx.strokeStyle =
      tcol("#cbd5e1");

    ctx.lineWidth = 1;

    ctx.setLineDash([
      8,
      7,
    ]);

    ctx.stroke();

    ctx.setLineDash([]);

    // ========================================
    // MIRROR
    // ========================================

    const centerCanvas =
      toCanvas(center);

    const mirrorStartAngle =
      data.mirror_type ===
      "concave"
        ? -Math.PI / 2
        : Math.PI / 2;

    const mirrorEndAngle =
      data.mirror_type ===
      "concave"
        ? Math.PI / 2
        : (3 * Math.PI) / 2;

    ctx.beginPath();

    ctx.arc(
      centerCanvas[0],
      centerCanvas[1],
      R * scale,
      mirrorStartAngle,
      mirrorEndAngle
    );

    ctx.strokeStyle =
      tcol("#111827");

    ctx.lineWidth = 8;

    ctx.lineCap =
      "round";

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(
      centerCanvas[0],
      centerCanvas[1],
      R * scale - 7,
      mirrorStartAngle,
      mirrorEndAngle
    );

    ctx.strokeStyle =
      tcol("#64748b");

    ctx.lineWidth = 3;

    ctx.stroke();

    ctx.lineCap =
      "butt";

    // ========================================
    // VERTEX
    // ========================================

    const vertex: Point = [
      0,
      0,
    ];

    const vertexCanvas =
      toCanvas(vertex);

    ctx.beginPath();

    ctx.arc(
      vertexCanvas[0],
      vertexCanvas[1],
      6,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      tcol("#111827");

    ctx.fill();

    ctx.font =
      "bold 16px Arial";

    ctx.fillStyle =
      tcol("#111827");

    ctx.fillText(
      "V",
      vertexCanvas[0] - 7,
      vertexCanvas[1] + 25
    );

    // ========================================
    // CENTRE OF CURVATURE
    // ========================================

    ctx.beginPath();

    ctx.arc(
      centerCanvas[0],
      centerCanvas[1],
      6,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      tcol("#7c3aed");

    ctx.fill();

    ctx.font =
      "bold 16px Arial";

    ctx.fillStyle =
      tcol("#7c3aed");

    ctx.fillText(
      "C",
      centerCanvas[0] + 10,
      centerCanvas[1] - 10
    );

    // ========================================
    // FOCUS
    // ========================================

    const focusCanvas =
      toCanvas(focus);

    ctx.beginPath();

    ctx.arc(
      focusCanvas[0],
      focusCanvas[1],
      6,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      tcol("#16a34a");

    ctx.fill();

    ctx.font =
      "bold 16px Arial";

    ctx.fillStyle =
      tcol("#16a34a");

    ctx.fillText(
      "F",
      focusCanvas[0] + 10,
      focusCanvas[1] - 10
    );

    // ========================================
    // RADIUS LINE
    // ========================================

    ctx.beginPath();

    ctx.moveTo(
      vertexCanvas[0],
      vertexCanvas[1]
    );

    ctx.lineTo(
      centerCanvas[0],
      centerCanvas[1]
    );

    ctx.strokeStyle =
      tcol("#7c3aed");

    ctx.lineWidth = 2;

    ctx.setLineDash([
      5,
      5,
    ]);

    ctx.stroke();

    ctx.setLineDash([]);

    ctx.font =
      "14px Arial";

    ctx.fillStyle =
      tcol("#7c3aed");

    ctx.fillText(
      `R = ${R.toFixed(1)}`,
      (vertexCanvas[0] +
        centerCanvas[0]) /
        2 -
        20,
      centerCanvas[1] - 12
    );

    // ========================================
    // INCIDENT RAY
    // ========================================

    const incidentStartCanvas =
      toCanvas(
        incidentStart
      );

    const hitCanvas =
      toCanvas(hitPoint);

    ctx.beginPath();

    ctx.moveTo(
      incidentStartCanvas[0],
      incidentStartCanvas[1]
    );

    ctx.lineTo(
      hitCanvas[0],
      hitCanvas[1]
    );

    ctx.strokeStyle =
      tcol("#2563eb");

    ctx.lineWidth = 4;

    ctx.lineCap =
      "round";

    ctx.stroke();

    ctx.font =
      "15px Arial";

    ctx.fillStyle =
      tcol("#2563eb");

    ctx.fillText(
      "Incident Ray",
      incidentStartCanvas[0] + 10,
      incidentStartCanvas[1] - 10
    );

    // ========================================
    // HIT POINT
    // ========================================

    ctx.beginPath();

    ctx.arc(
      hitCanvas[0],
      hitCanvas[1],
      7,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      tcol("#111827");

    ctx.fill();

    // ========================================
    // NORMAL
    // ========================================

    if (data.normal) {
      const normal =
        data.normal;

      const normalLength = 2;

      const normalEnd: Point = [
        hitPoint[0] +
          normal[0] *
            normalLength,

        hitPoint[1] +
          normal[1] *
            normalLength,
      ];

      const normalEndCanvas =
        toCanvas(
          normalEnd
        );

      ctx.beginPath();

      ctx.moveTo(
        hitCanvas[0],
        hitCanvas[1]
      );

      ctx.lineTo(
        normalEndCanvas[0],
        normalEndCanvas[1]
      );

      ctx.strokeStyle =
        tcol("#64748b");

      ctx.lineWidth = 2;

      ctx.setLineDash([
        7,
        7,
      ]);

      ctx.stroke();

      ctx.setLineDash([]);

      ctx.fillStyle =
        tcol("#64748b");

      ctx.fillText(
        "Normal",
        normalEndCanvas[0] + 8,
        normalEndCanvas[1]
      );
    }

    // ========================================
    // REFLECTED RAY
    // ========================================

    if (data.reflected_ray) {
      const reflectedEndCanvas =
        toCanvas(
          reflectedEnd
        );

      ctx.beginPath();

      ctx.moveTo(
        hitCanvas[0],
        hitCanvas[1]
      );

      ctx.lineTo(
        reflectedEndCanvas[0],
        reflectedEndCanvas[1]
      );

      ctx.strokeStyle =
        tcol("#dc2626");

      ctx.lineWidth = 4;

      ctx.lineCap =
        "round";

      ctx.stroke();

      ctx.fillStyle =
        tcol("#dc2626");

      ctx.fillText(
        "Reflected Ray",
        reflectedEndCanvas[0] - 110,
        reflectedEndCanvas[1] - 10
      );
    }

    // ========================================
    // MIRROR LABEL
    // ========================================

    ctx.font =
      "bold 17px Arial";

    ctx.fillStyle =
      tcol("#111827");

    ctx.fillText(
      data.mirror_type ===
        "concave"
        ? "Concave Mirror"
        : "Convex Mirror",

      centerCanvas[0] - 65,

      centerCanvas[1] +
        R * scale +
        30
    );

    // ========================================
    // INFORMATION BOX
    // ========================================

    ctx.fillStyle =
      tcol("rgba(255,255,255,0.94)");

    ctx.fillRect(
      20,
      20,
      230,
      95
    );

    ctx.font =
      "14px Arial";

    ctx.fillStyle =
      tcol("#111827");

    ctx.fillText(
      `Radius R = ${R.toFixed(2)}`,
      35,
      48
    );

    ctx.fillText(
      `Focal length f = ${(R / 2).toFixed(2)}`,
      35,
      72
    );

    ctx.fillText(
      `Model = ${
        data.reflection_model ===
        "paraxial"
          ? "Paraxial"
          : "Exact"
      }`,
      35,
      96
    );
  }


  return (
    <main
      style={{
        padding: "28px clamp(16px, 3vw, 32px)",
        background:
          "transparent",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >

        {/* ================================= */}
        {/* BACK LINK */}
        {/* ================================= */}

        <Link
          href="/reflection"
          style={{
            textDecoration:
              "none",
            color: "var(--text)",
            fontWeight:
              "600",
          }}
        >
          ← Reflection Simulator
        </Link>

        {/* ================================= */}
        {/* HEADER */}
        {/* ================================= */}

        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Curved Mirror Simulator
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "30px",
          }}
        >
          Explore exact spherical
          reflection, paraxial
          approximation, and
          image formation.
        </p>


        {/* simulation on the left, controls and image details on the right */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
          <div className="min-w-0 xl:sticky xl:top-20">
        {/* ================================= */}
        {/* CANVAS */}
        {/* ================================= */}

        <section
          style={{
            background:
              "var(--surface)",

            borderRadius:
              "14px",

            overflow:
              "hidden",

            border: "1px solid var(--border)",
          }}
        >
          <canvas role="img" aria-label="Ray diagram for the curved mirror"
            ref={canvasRef}
            width={1100}
            height={650}
            style={{
              display:
                "block",

              width:
                "100%",

              height:
                "auto",
            }}
          />

          {!result && (
            <div
              style={{
                padding:
                  "25px",

                textAlign:
                  "center",

                color:
                  "var(--text-muted)",
              }}
            >
              Change the
              controls and
              click{" "}
              <strong>
                Simulate
              </strong>
              .
            </div>
          )}
        </section>

        {/* ================================= */}
        {/* RAY SIMULATION ERROR */}
        {/* ================================= */}

        {result &&
          !result.hit && (
            <section
              style={{
                marginTop:
                  "25px",

                background:
                  "color-mix(in srgb, var(--error) 14%, var(--surface))",

                color:
                  "var(--error)",

                padding:
                  "20px",

                borderRadius:
                  "14px",

                fontWeight:
                  "600",
              }}
            >
              ⚠{" "}
              {result.message ||
                "The ray does not intersect the mirror."}
            </section>
          )}

          </div>
          <div className="min-w-0">
        {/* ================================= */}
        {/* CONTROLS */}
        {/* ================================= */}

        <section
          style={{
            background:
              "var(--surface)",
            padding: "25px",
            borderRadius:
              "14px",
            marginBottom:
              "25px",
            border: "1px solid var(--border)",
          }}
        >

          <h2>
            Simulation Controls
          </h2>

          {/* MIRROR TYPE */}

          <div
            style={{
              marginTop:
                "25px",
            }}
          >
            <label>
              <strong>
                Mirror Type
              </strong>
            </label>

            <div
              style={{
                display:
                  "flex",
                gap: "10px",
                marginTop:
                  "10px",
              }}
            >
              <button
                onClick={() => {
                  setMirrorType(
                    "concave"
                  );

                  setResult(
                    null
                  );
                }}
                style={{
                  padding:
                    "10px 20px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid #cbd5e1",

                  background:
                    mirrorType ===
                    "concave"
                      ? "var(--text)"
                      : "var(--surface)",

                  color:
                    mirrorType ===
                    "concave"
                      ? "var(--bg)"
                      : "var(--text)",

                  cursor:
                    "pointer",
                }}
              >
                Concave
              </button>

              <button
                onClick={() => {
                  setMirrorType(
                    "convex"
                  );

                  setResult(
                    null
                  );
                }}
                style={{
                  padding:
                    "10px 20px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid #cbd5e1",

                  background:
                    mirrorType ===
                    "convex"
                      ? "var(--text)"
                      : "var(--surface)",

                  color:
                    mirrorType ===
                    "convex"
                      ? "var(--bg)"
                      : "var(--text)",

                  cursor:
                    "pointer",
                }}
              >
                Convex
              </button>
            </div>
          </div>

          {/* REFLECTION MODEL */}

          <div
            style={{
              marginTop:
                "25px",
            }}
          >
            <label>
              <strong>
                Reflection Model
              </strong>
            </label>

            <div
              style={{
                display:
                  "flex",
                gap: "10px",
                marginTop:
                  "10px",
              }}
            >
              <button
                onClick={() => {
                  setReflectionModel(
                    "exact"
                  );

                  setResult(
                    null
                  );
                }}
                style={{
                  padding:
                    "10px 20px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid #cbd5e1",

                  background:
                    reflectionModel ===
                    "exact"
                      ? "var(--text)"
                      : "var(--surface)",

                  color:
                    reflectionModel ===
                    "exact"
                      ? "var(--bg)"
                      : "var(--text)",

                  cursor:
                    "pointer",
                }}
              >
                Exact
              </button>

              <button
                onClick={() => {
                  setReflectionModel(
                    "paraxial"
                  );

                  setResult(
                    null
                  );
                }}
                style={{
                  padding:
                    "10px 20px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid #cbd5e1",

                  background:
                    reflectionModel ===
                    "paraxial"
                      ? "var(--text)"
                      : "var(--surface)",

                  color:
                    reflectionModel ===
                    "paraxial"
                      ? "var(--bg)"
                      : "var(--text)",

                  cursor:
                    "pointer",
                }}
              >
                Paraxial
              </button>
            </div>
          </div>

          {/* RADIUS */}

          <div
            style={{
              marginTop:
                "25px",
            }}
          >
            <label htmlFor="curved-mirror-ctl-1">
              Radius of Curvature:{" "}
              <strong>
                {radius.toFixed(
                  1
                )}
              </strong>
            </label>

            <input id="curved-mirror-ctl-1"
              type="range"
              min="3"
              max="8"
              step="0.5"
              value={radius}
              onChange={(e) => {
                setRadius(
                  Number(
                    e.target.value
                  )
                );

                setResult(
                  null
                );
              }}
              style={{
                width:
                  "100%",
                marginTop:
                  "8px",
              }}
            />
          </div>

          {/* RAY HEIGHT */}

          <div
            style={{
              marginTop:
                "20px",
            }}
          >
            <label htmlFor="curved-mirror-ctl-2">
              Ray Height:{" "}
              <strong>
                {rayHeight.toFixed(
                  1
                )}
              </strong>
            </label>

            <input id="curved-mirror-ctl-2"
              type="range"
              min="-3"
              max="3"
              step="0.1"
              value={rayHeight}
              onChange={(e) => {
                setRayHeight(
                  Number(
                    e.target.value
                  )
                );

                setResult(
                  null
                );
              }}
              style={{
                width:
                  "100%",
                marginTop:
                  "8px",
              }}
            />
          </div>

          {/* INCIDENT ANGLE */}

          <div
            style={{
              marginTop:
                "20px",
            }}
          >
            <label htmlFor="curved-mirror-ctl-3">
              Incident Angle:{" "}
              <strong>
                {incidentAngle}°
              </strong>
            </label>

            <input id="curved-mirror-ctl-3"
              type="range"
              min="-25"
              max="25"
              step="1"
              value={
                incidentAngle
              }
              onChange={(e) => {
                setIncidentAngle(
                  Number(
                    e.target.value
                  )
                );

                setResult(
                  null
                );
              }}
              style={{
                width:
                  "100%",
                marginTop:
                  "8px",
              }}
            />
          </div>

          {/* RAY LENGTH */}

          <div
            style={{
              marginTop:
                "20px",
            }}
          >
            <label htmlFor="curved-mirror-ctl-4">
              Ray Length:{" "}
              <strong>
                {rayLength}
              </strong>
            </label>

            <input id="curved-mirror-ctl-4"
              type="range"
              min="5"
              max="15"
              step="1"
              value={rayLength}
              onChange={(e) => {
                setRayLength(
                  Number(
                    e.target.value
                  )
                );

                setResult(
                  null
                );
              }}
              style={{
                width:
                  "100%",
                marginTop:
                  "8px",
              }}
            />
          </div>

          {/* SIMULATE BUTTON */}

          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            style={{
              marginTop:
                "25px",

              padding:
                "12px 24px",

              borderRadius:
                "8px",

              border:
                "none",

              background:
                loading
                  ? "var(--text-muted)"
                  : "var(--text)",

              color:
                "var(--bg)",

              fontSize:
                "16px",

              cursor:
                loading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading
              ? "Simulating..."
              : "Simulate"}
          </button>

          {/* ================================= */}
          {/* IMAGE FORMATION CONTROLS */}
          {/* ================================= */}

          <div
            style={{
              marginTop:
                "35px",

              paddingTop:
                "25px",

              borderTop:
                "1px solid var(--border)",
            }}
          >
            <h3>
              Image Formation
            </h3>

            <p
              style={{
                color:
                  "var(--text-muted)",

                marginTop:
                  "8px",

                lineHeight:
                  1.6,
              }}
            >
              Calculate image
              position, size,
              magnification and
              orientation using
              the spherical mirror
              equation.
            </p>

            {/* OBJECT DISTANCE */}

            <div
              style={{
                marginTop:
                  "20px",
              }}
            >
              <label htmlFor="curved-mirror-ctl-5">
                Object Distance:{" "}
                <strong>
                  {objectDistance.toFixed(
                    1
                  )}
                </strong>
              </label>

              <input id="curved-mirror-ctl-5"
                type="range"
                min="2"
                max="30"
                step="0.5"
                value={
                  objectDistance
                }
                onChange={(e) => {
                  setObjectDistance(
                    Number(
                      e.target.value
                    )
                  );
                }}
                style={{
                  width:
                    "100%",
                  marginTop:
                    "8px",
                }}
              />
            </div>

            {/* OBJECT HEIGHT */}

            <div
              style={{
                marginTop:
                  "20px",
              }}
            >
              <label htmlFor="curved-mirror-ctl-6">
                Object Height:{" "}
                <strong>
                  {objectHeight.toFixed(
                    1
                  )}
                </strong>
              </label>

              <input id="curved-mirror-ctl-6"
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={
                  objectHeight
                }
                onChange={(e) => {
                  setObjectHeight(
                    Number(
                      e.target.value
                    )
                  );
                }}
                style={{
                  width:
                    "100%",
                  marginTop:
                    "8px",
                }}
              />
            </div>
          </div>
        </section>

        {/* ================================= */}
        {/* IMAGE FORMATION RESULTS */}
        {/* ================================= */}

        {imageResult && (
          <section
            aria-busy={imageLoading}
            style={{
              marginTop:
                "25px",

              background:
                "var(--surface)",

              padding:
                "25px",

              borderRadius:
                "14px",

              border: "1px solid var(--border)",
            }}
          >
            <h2>
              Image Formation Results
            </h2>

            {imageResult.image_at_infinity ? (
              <div
                style={{
                  marginTop:
                    "20px",

                  padding:
                    "20px",

                  borderRadius:
                    "10px",

                  background:
                    "color-mix(in srgb, var(--warning) 14%, var(--surface))",

                  color:
                    "var(--warning)",

                  fontWeight:
                    "600",
                }}
              >
                ⚠{" "}
                {
                  imageResult.message
                }
              </div>
            ) : (
              <>
                {/* RESULT GRID */}

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",

                    gap:
                      "15px",

                    marginTop:
                      "20px",
                  }}
                >
                  <div>
                    <strong>
                      Object Distance
                    </strong>

                    <p>
                      {
                        imageResult.object_distance.toFixed(
                          2
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Object Height
                    </strong>

                    <p>
                      {
                        imageResult.object_height.toFixed(
                          2
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Focal Length
                    </strong>

                    <p>
                      {
                        imageResult.focal_length.toFixed(
                          2
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Image Distance
                    </strong>

                    <p>
                      {
                        imageResult.image_distance?.toFixed(
                          3
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Image Height
                    </strong>

                    <p>
                      {
                        imageResult.image_height?.toFixed(
                          3
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Magnification
                    </strong>

                    <p>
                      {
                        imageResult.magnification?.toFixed(
                          3
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Image Type
                    </strong>

                    <p>
                      {
                        imageResult.image_type
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Orientation
                    </strong>

                    <p>
                      {
                        imageResult.orientation
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Size
                    </strong>

                    <p>
                      {
                        imageResult.size
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Object Position
                    </strong>

                    <p>
                      {
                        imageResult.object_position
                      }
                    </p>
                  </div>

                  <div>
                    <strong>
                      Image Position
                    </strong>

                    <p>
                      {
                        imageResult.image_position
                      }
                    </p>
                  </div>
                </div>

                {/* FORMULAS */}

                <div
                  style={{
                    marginTop:
                      "25px",

                    padding:
                      "20px",

                    borderRadius:
                      "10px",

                    background:
                      "var(--bg-secondary)",
                  }}
                >
                  <h3>
                    Mirror Equations
                  </h3>

                  <p
                    style={{
                      fontSize:
                        "21px",

                      marginTop:
                        "12px",
                    }}
                  >
                    1/f = 1/dₒ + 1/dᵢ
                  </p>

                  <p
                    style={{
                      fontSize:
                        "21px",

                      marginTop:
                        "10px",
                    }}
                  >
                    m = -dᵢ / dₒ
                  </p>

                  <p
                    style={{
                      fontSize:
                        "21px",

                      marginTop:
                        "10px",
                    }}
                  >
                    hᵢ = m × hₒ
                  </p>
                </div>
              </>
            )}
          </section>
        )}

          </div>
        </div>

        {/* notes and captions */}
        {/* ================================= */}
        {/* RAY SIMULATION RESULTS */}
        {/* ================================= */}

        {result &&
          result.hit && (
            <section
              style={{
                marginTop:
                  "25px",

                background:
                  "var(--surface)",

                padding:
                  "25px",

                borderRadius:
                  "14px",

                border: "1px solid var(--border)",
              }}
            >
              <h2>
                Ray Simulation Results
              </h2>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",

                  gap:
                    "15px",

                  marginTop:
                    "20px",
                }}
              >
                <div>
                  <strong>
                    Mirror Type
                  </strong>

                  <p>
                    {
                      result.mirror_type
                    }
                  </p>
                </div>

                <div>
                  <strong>
                    Reflection Model
                  </strong>

                  <p>
                    {
                      result.reflection_model
                    }
                  </p>
                </div>

                <div>
                  <strong>
                    Radius
                  </strong>

                  <p>
                    {result.radius?.toFixed(
                      2
                    )}
                  </p>
                </div>

                <div>
                  <strong>
                    Focal Length
                  </strong>

                  <p>
                    {result.focal_length?.toFixed(
                      2
                    )}
                  </p>
                </div>

                <div>
                  <strong>
                    Hit Point
                  </strong>

                  <p>
                    {result.hit_point
                      ?.map(
                        (
                          value
                        ) =>
                          value.toFixed(
                            2
                          )
                      )
                      .join(
                        ", "
                      )}
                  </p>
                </div>
              </div>

              <div
                style={{
                  marginTop:
                    "20px",

                  padding:
                    "15px",

                  borderRadius:
                    "8px",

                  background:
                    "var(--bg-secondary)",
                }}
              >
                <strong>
                  Spherical Mirror Relation
                </strong>

                <p
                  style={{
                    fontSize:
                      "21px",

                    marginTop:
                      "8px",
                  }}
                >
                  f = R / 2
                </p>

                <p
                  style={{
                    color:
                      "var(--text-secondary)",
                  }}
                >
                  The paraxial
                  approximation
                  uses the relation
                  f = R/2. Exact
                  spherical
                  reflection
                  calculates the
                  actual point of
                  incidence and
                  surface normal.
                </p>
              </div>
            </section>
          )}

        {/* ================================= */}
        {/* PHYSICS EXPLANATION */}
        {/* ================================= */}

        <section
          style={{
            marginTop:
              "25px",

            background:
              "var(--text)",

            color:
              "var(--bg)",

            padding:
              "25px",

            borderRadius:
              "14px",
          }}
        >
          <h2>
            Curved Mirror Physics
          </h2>

          <p
            style={{
              color:
                "var(--border-strong)",

              marginTop:
                "15px",

              lineHeight:
                1.7,
            }}
          >
            A spherical mirror
            is a portion of a
            spherical surface.
            The normal at every
            point on the surface
            passes through the
            centre of curvature.
          </p>

          <p
            style={{
              fontSize:
                "21px",

              marginTop:
                "15px",
            }}
          >
            dᵣ = d − 2(d · n)n
          </p>

          <p
            style={{
              color:
                "var(--border-strong)",

              marginTop:
                "10px",

              lineHeight:
                1.7,
            }}
          >
            In Exact mode, the
            ray intersects the
            actual spherical
            surface. The normal
            is calculated at the
            exact point of
            incidence and the
            reflected direction
            is obtained using
            vector reflection.
          </p>

          <p
            style={{
              color:
                "var(--border-strong)",

              marginTop:
                "10px",

              lineHeight:
                1.7,
            }}
          >
            In Paraxial mode,
            small-angle
            approximation is
            used. Parallel rays
            are assumed to
            converge at the
            principal focus.
          </p>

          <p
            style={{
              fontSize:
                "20px",

              marginTop:
                "15px",
            }}
          >
            f = R / 2
          </p>

          <p
            style={{
              color:
                "var(--border-strong)",

              marginTop:
                "10px",

              lineHeight:
                1.7,
            }}
          >
            At larger ray
            heights, the exact
            spherical model can
            differ from the
            paraxial
            approximation. This
            effect is known as
            spherical aberration.
          </p>
        </section>
      </div>
    </main>
  );
}

