"use client";
import React, { memo } from "react";
import { Upload, Eye, Loader2, Crosshair, RefreshCw, Play } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalibrationStep = "idle" | "calibrating" | "done";
export type ActivePickMode  = "n" | "filler";

interface Point { x: number; y: number }

interface ImagePreviewProps {
  loading:             boolean;
  processedImage:      string | null;
  currentDisplayImage: string | null;
  onToggleStart:       () => void;
  onToggleEnd:         () => void;
  showCompare?:        boolean;
  // Multi-point calibration
  calibrationStep?:    CalibrationStep;
  activePickMode?:     ActivePickMode;
  refNPoints?:         Point[];
  refFillerPoints?:    Point[];
  onCalibrationClick?: (point: Point) => void;
  onSetPickMode?:      (mode: ActivePickMode) => void;
  onStartCalibration?: () => void;
  onRunCalibration?:   () => void;
  onRecalibrate?:      () => void;
}

// ─── Style constants ──────────────────────────────────────────────────────────
// Extracting long class strings keeps JSX readable and ensures consistent styles.

const TOGGLE_BASE =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold " +
  "transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

const TOGGLE_INACTIVE =
  "bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white";

const TOGGLE_N_ACTIVE =
  "bg-slate-200 text-slate-800 ring-2 ring-slate-400 ring-offset-1 ring-offset-black";

const TOGGLE_F_ACTIVE =
  "bg-amber-400 text-amber-900 ring-2 ring-amber-300 ring-offset-1 ring-offset-black";

const COUNT_BADGE_BASE =
  "px-1.5 py-0.5 rounded-full text-[10px] font-black min-w-[18px] text-center";

// Status badge config keyed by calibration step — avoids three separate conditional blocks.
const STATUS_BADGE_CONFIG: Record<
  CalibrationStep,
  { bg: string; label: (n: number, f: number) => string }
> = {
  idle:        { bg: "bg-green-500/90",  label: ()    => "Analysis Complete"            },
  calibrating: { bg: "bg-purple-600/90", label: ()    => "Calibrating…"                 },
  done:        { bg: "bg-purple-600/90", label: (n,f) => `Calibrated (${n}N + ${f}F)`   },
};

// ─── RefDot ───────────────────────────────────────────────────────────────────
// Memoized so that adding a new point doesn't re-render all existing dots.

const RefDot = memo(function RefDot({
  point, index, variant,
}: { point: Point; index: number; variant: "n" | "filler" }) {
  const isN = variant === "n";
  return (
    <div
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      className={[
        "absolute -translate-x-1/2 -translate-y-1/2",
        "w-5 h-5 rounded-full border-2 border-white shadow-lg ring-2 pointer-events-none z-10",
        isN ? "bg-slate-200 ring-slate-400" : "bg-amber-400 ring-amber-300",
      ].join(" ")}
      title={`${isN ? "N" : "Filler"} ref ${index + 1}`}
    >
      <span
        className={[
          "absolute inset-0 flex items-center justify-center text-[7px] font-black",
          isN ? "text-slate-700" : "text-amber-900",
        ].join(" ")}
      >
        {isN ? "N" : "F"}
      </span>
    </div>
  );
});

// ─── ImagePreview ─────────────────────────────────────────────────────────────

export default function ImagePreview({
  loading,
  processedImage,
  currentDisplayImage,
  onToggleStart,
  onToggleEnd,
  showCompare      = true,
  calibrationStep  = "idle",
  activePickMode   = "n",
  refNPoints       = [],
  refFillerPoints  = [],
  onCalibrationClick,
  onSetPickMode,
  onStartCalibration,
  onRunCalibration,
  onRecalibrate,
}: ImagePreviewProps) {
  const isCalibrating  = calibrationStep === "calibrating";
  const canRunAnalysis = refNPoints.length >= 1 && refFillerPoints.length >= 1;
  const badge          = STATUS_BADGE_CONFIG[calibrationStep];

  // Capture normalized click coordinates relative to the rendered image element.
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isCalibrating || !onCalibrationClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)   / rect.height));
    onCalibrationClick({ x, y });
  };

  return (
    /*
     * flex-col layout: image area (flex-1) + calibration bar (flex-shrink-0).
     * The calibration bar is NOT absolutely positioned — it lives in the normal
     * flow so it naturally pushes the image area up without any overlap.
     */
    <div className="relative flex flex-col flex-1 bg-slate-900 rounded-3xl overflow-hidden shadow-2xl shadow-slate-300 min-h-[500px] border-4 border-white">

      {/* ── Loading overlay ───────────────────────────────────────────────── */}
      {loading && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-2">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <span className="font-bold text-lg text-slate-700 tracking-tight">Processing Physics Model…</span>
          <span className="text-sm text-slate-400">Applying shape correction &amp; density</span>
        </div>
      )}

      {/* ── Absolute overlays (badges + floating buttons) ─────────────────── */}
      {processedImage && (
        <>
          {/* Status badge — top left, single block driven by config map */}
          <div
            className={[
              "absolute top-5 left-5 z-20",
              badge.bg,
              "backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[10px]",
              "font-bold flex items-center gap-1.5 shadow-lg",
            ].join(" ")}
          >
            <span className="w-2 h-2 bg-white rounded-full animate-pulse flex-shrink-0" />
            {badge.label(refNPoints.length, refFillerPoints.length)}
          </div>

          {/* Hold-to-compare — top right, hidden while calibrating to reduce clutter */}
          {showCompare && !isCalibrating && (
            <button
              onMouseDown={onToggleStart}
              onMouseUp={onToggleEnd}
              onMouseLeave={onToggleEnd}
              onTouchStart={onToggleStart}
              onTouchEnd={onToggleEnd}
              className={[
                "absolute top-5 right-5 z-20",
                "bg-black/60 hover:bg-black/80 active:scale-95",
                "backdrop-blur-md text-white pl-3 pr-4 py-2 rounded-full",
                "text-xs font-bold border border-white/10 transition-all",
                "flex items-center gap-2 select-none shadow-lg",
              ].join(" ")}
            >
              <Eye size={14} className="text-blue-400" />
              Hold to compare
            </button>
          )}

          {/* Calibrate button — bottom-center, idle state only */}
          {calibrationStep === "idle" && (
            <button
              onClick={onStartCalibration}
              className={[
                "absolute bottom-5 left-1/2 -translate-x-1/2 z-20",
                "bg-purple-600/90 hover:bg-purple-500 active:scale-95",
                "backdrop-blur-md text-white px-5 py-2 rounded-full",
                "text-xs font-bold border border-purple-400/30",
                "transition-all flex items-center gap-2 shadow-lg whitespace-nowrap",
              ].join(" ")}
            >
              <Crosshair size={14} />
              Calibrate N/Filler
            </button>
          )}

          {/* Recalibrate button — bottom-center, done state only */}
          {calibrationStep === "done" && (
            <button
              onClick={onRecalibrate}
              className={[
                "absolute bottom-5 left-1/2 -translate-x-1/2 z-20",
                "bg-black/60 hover:bg-black/80 active:scale-95",
                "backdrop-blur-md text-white px-5 py-2 rounded-full",
                "text-xs font-bold border border-white/10",
                "transition-all flex items-center gap-2 shadow-lg whitespace-nowrap",
              ].join(" ")}
            >
              <RefreshCw size={14} />
              Recalibrate
            </button>
          )}
        </>
      )}

      {/* ── Image area ────────────────────────────────────────────────────── */}
      {/*
       * flex-1 + min-h-0 lets this section shrink correctly when the
       * calibration bar is rendered below it in the flex-col parent.
       */}
      <div className="flex-1 flex items-center justify-center p-5 min-h-0">
        {currentDisplayImage ? (
          /*
           * inline-block wrapper: matches the rendered image dimensions exactly,
           * so percentage-based dot positions (left/top) are relative to the
           * image itself — not the surrounding flex container.
           */
          <div className="relative inline-block leading-[0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentDisplayImage}
              alt="Analysis result"
              draggable={false}
              onClick={handleImageClick}
              className={[
                "max-w-full max-h-[700px] object-contain shadow-2xl rounded-lg select-none",
                isCalibrating ? "cursor-crosshair" : "",
              ].join(" ")}
            />

            {/* N reference dots */}
            {refNPoints.map((pt, i) => (
              <RefDot key={`n-${i}`} point={pt} index={i} variant="n" />
            ))}

            {/* Filler reference dots */}
            {refFillerPoints.map((pt, i) => (
              <RefDot key={`f-${i}`} point={pt} index={i} variant="filler" />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="text-center space-y-3 px-4">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto">
              <Upload size={32} className="text-slate-500" />
            </div>
            <h3 className="text-slate-400 font-medium text-lg">Upload an image to start analysis</h3>
            <p className="text-slate-600 text-sm max-w-xs mx-auto">
              Supports JPEG, PNG. Optimized for high-resolution fertilizer images.
            </p>
          </div>
        )}
      </div>

      {/* ── Calibration control bar ───────────────────────────────────────── */}
      {/*
       * In-flow (not absolute) — sits naturally at the bottom of the flex-col
       * parent and pushes the image area up. This prevents any overlap.
       *
       * Layout: [toggle group | flex-1 spacer w/ hint | run button]
       * The flex-1 spacer always exists, keeping Run Analysis anchored right.
       * On mobile the hint text inside the spacer is simply hidden.
       */}
      {isCalibrating && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-black/85 backdrop-blur-sm border-t border-white/5">

          {/* Mode toggle group — never wraps, always left-aligned */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* N mode toggle */}
            <button
              onClick={() => onSetPickMode?.("n")}
              className={`${TOGGLE_BASE} ${activePickMode === "n" ? TOGGLE_N_ACTIVE : TOGGLE_INACTIVE}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" />
              N
              <span className={`${COUNT_BADGE_BASE} ${
                activePickMode === "n" ? "bg-slate-400 text-slate-900" : "bg-white/20 text-slate-300"
              }`}>
                {refNPoints.length}
              </span>
            </button>

            {/* Filler mode toggle */}
            <button
              onClick={() => onSetPickMode?.("filler")}
              className={`${TOGGLE_BASE} ${activePickMode === "filler" ? TOGGLE_F_ACTIVE : TOGGLE_INACTIVE}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              Filler
              <span className={`${COUNT_BADGE_BASE} ${
                activePickMode === "filler" ? "bg-amber-600 text-white" : "bg-white/20 text-slate-300"
              }`}>
                {refFillerPoints.length}
              </span>
            </button>
          </div>

          {/* Spacer: flex-1 keeps Run Analysis at the far right on all screen sizes.
              Hint text is shown only on sm+ where there is horizontal room. */}
          <div className="flex-1 min-w-0">
            <span className="hidden sm:block text-slate-500 text-[10px] truncate">
              {activePickMode === "n"
                ? "← click white N prills on the image"
                : "← click darker Filler particles on the image"}
            </span>
          </div>

          {/* Run Analysis — disabled until ≥1 of each class is selected */}
          <button
            onClick={onRunCalibration}
            disabled={!canRunAnalysis}
            title={canRunAnalysis ? "Run calibrated analysis" : "Select at least 1 N and 1 Filler point first"}
            className={[
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full",
              "text-xs font-bold transition-all select-none",
              canRunAnalysis
                ? "bg-purple-600 hover:bg-purple-500 active:scale-95 text-white shadow-md shadow-purple-900/40"
                : "bg-white/10 text-slate-500 opacity-50 cursor-not-allowed",
            ].join(" ")}
          >
            <Play size={11} />
            Run Analysis
          </button>
        </div>
      )}
    </div>
  );
}
