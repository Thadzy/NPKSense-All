"use client";
import React from "react";

interface StatCardProps {
  label: string;
  subLabel: string;
  value: number; // น้ำหนักจริง (g)
  total: number; // น้ำหนักรวม (g)
  target: number; // เป้าหมาย (%)
  color: string;
  barColor: string;
}

export default function StatCard({ label, subLabel, value, total, target, color, barColor }: StatCardProps) {
  const percent = total > 0 ? (value / total * 100) : 0;
  const error = percent - target;
  const isGood = Math.abs(error) <= 2.0;

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group">
      <div className={`absolute top-0 left-0 w-1 h-full ${barColor}`}></div>

      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className={`text-xs font-black uppercase tracking-wider ${color}`}>{label}</h4>
          <span className="text-[10px] text-slate-400 font-semibold">{subLabel}</span>
        </div>
        {/* Error badge: difference between measured % and target % */}
        <div className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 ${isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`} title="Difference from target">
          {error > 0 ? '↑' : error < 0 ? '↓' : '='} {Math.abs(error).toFixed(1)}%
        </div>
      </div>

      {/* MAIN VALUE: actual calculated weight in grams */}
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-4xl font-black text-slate-800">{value.toFixed(1)}</span>
        <span className="text-lg font-bold text-slate-400">g</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="text-slate-500">Ratio: {percent.toFixed(1)}%</span>
          <span className="text-slate-400">Target: {target}%</span>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
