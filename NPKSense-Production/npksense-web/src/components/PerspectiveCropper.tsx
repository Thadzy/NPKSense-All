"use client";
import React, { useState, useRef, useCallback } from "react";
import { Check, X } from "lucide-react";

interface Point { x: number; y: number }

interface PerspectiveCropperProps {
  imageSrc: string;
  onConfirm: (points: Point[]) => void;
  onCancel: () => void;
  initialPoints?: Point[];
  autoDetected?: boolean;
}

export default function PerspectiveCropper({ imageSrc, onConfirm, onCancel, initialPoints, autoDetected }: PerspectiveCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Points stored as image-normalized coords (0–1 relative to the actual image)
  const [points, setPoints] = useState<Point[]>(initialPoints ?? [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Calculate the rendered image rect inside the container (accounts for object-contain letterboxing)
  const getImageRect = useCallback(() => {
    if (!containerRef.current || !naturalSize) return null;
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const scale = Math.min(cW / naturalSize.w, cH / naturalSize.h);
    const rendW = naturalSize.w * scale;
    const rendH = naturalSize.h * scale;
    const offX = (cW - rendW) / 2;
    const offY = (cH - rendH) / 2;
    return { offX, offY, rendW, rendH, cW, cH };
  }, [naturalSize]);

  // Image-normalized (0–1) → container fraction (0–1), for CSS positioning & SVG
  const imgToContainer = useCallback((p: Point): Point => {
    const r = getImageRect();
    if (!r) return p;
    return {
      x: (p.x * r.rendW + r.offX) / r.cW,
      y: (p.y * r.rendH + r.offY) / r.cH,
    };
  }, [getImageRect]);

  // Container fraction (0–1) → image-normalized (0–1), for storing points
  const containerToImg = useCallback((cx: number, cy: number): Point => {
    const r = getImageRect();
    if (!r) return { x: cx, y: cy };
    return {
      x: Math.min(Math.max(((cx * r.cW) - r.offX) / r.rendW, 0), 1),
      y: Math.min(Math.max(((cy * r.cH) - r.offY) / r.rendH, 0), 1),
    };
  }, [getImageRect]);

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    setDraggingIdx(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    setPoints(prev => {
      const next = [...prev];
      next[draggingIdx] = containerToImg(cx, cy);
      return next;
    });
  };

  const handlePointerUp = () => setDraggingIdx(null);

  // SVG polygon uses container-fraction space (viewBox 0 0 100 100)
  const polygonPoints = points
    .map(p => imgToContainer(p))
    .map(p => `${p.x * 100},${p.y * 100}`)
    .join(" ");

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
      <div className="mb-4 text-white text-center">
        <h2 className="text-2xl font-bold mb-1">Adjust Crop Area</h2>
        {autoDetected ? (
          <p className="text-emerald-400 text-sm font-semibold">✓ Auto-detected corners — drag to fine-tune if needed</p>
        ) : (
          <p className="text-slate-400 text-sm">Drag corners to match the container edges</p>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative max-w-4xl max-h-[70vh] w-full select-none touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Image uses object-contain — no stretching */}
        <img
          src={imageSrc}
          alt="Crop"
          className="w-full max-h-[70vh] object-contain pointer-events-none rounded-lg block mx-auto"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />

        {/* Only render overlay after naturalSize is known so coords are accurate */}
        {naturalSize && (
          <>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={polygonPoints}
                fill="rgba(34, 197, 94, 0.2)"
                stroke="#22c55e"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {points.map((p, i) => {
              const cp = imgToContainer(p);
              return (
                <div
                  key={i}
                  onPointerDown={(e) => handlePointerDown(i, e)}
                  className="absolute w-6 h-6 -ml-3 -mt-3 bg-white rounded-full shadow-lg border-2 border-green-500 cursor-move flex items-center justify-center hover:scale-125 transition-transform z-10"
                  style={{ left: `${cp.x * 100}%`, top: `${cp.y * 100}%` }}
                >
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="mt-8 flex gap-4">
        <button onClick={onCancel} className="px-6 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 flex items-center gap-2">
          <X size={20} /> Cancel
        </button>
        <button onClick={() => onConfirm(points)} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 shadow-lg shadow-green-500/30 flex items-center gap-2">
          <Check size={20} /> Confirm & Analyze
        </button>
      </div>
    </div>
  );
}
