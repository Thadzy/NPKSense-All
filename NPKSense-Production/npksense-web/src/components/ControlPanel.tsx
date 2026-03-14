"use client";
import React from "react";
import { Settings2, Scale, FlaskConical, Sparkles } from "lucide-react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface ControlPanelProps {
  file: File | null;
  totalWeight: number;
  targets: { N: number, P: number, K: number, Filler: number };
  pieChartData: any;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWeightChange: (val: number) => void;
  onTargetChange: (key: string, val: number) => void;
}

export default function ControlPanel({
  file, totalWeight, targets,
  pieChartData,
  onFileUpload, onWeightChange, onTargetChange,
}: ControlPanelProps) {
  
  const legendItems = [
    { label: 'N', color: '#94a3b8' },      
    { label: 'P', color: '#10b981' },      
    { label: 'K', color: '#ef4444' },      
    { label: 'Filler', color: '#facc15' }, 
  ];

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-white p-6 md:p-8 relative overflow-hidden flex flex-col">
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10 opacity-50"></div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          <span className="text-blue-600">NPK</span> Sense
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100">
          <Sparkles size={12} className="text-purple-500" />
          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">
            Zero-Touch AI Clustering
          </span>
        </div>
      </div>

      {/* 1. UPLOAD */}
      <div className="mb-6">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
          <Settings2 size={14} /> 1. Source Image
        </label>
        <div className="relative group">
          <input 
            type="file" accept="image/*" onChange={onFileUpload}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2.5 file:px-4
              file:rounded-xl file:border-0
              file:text-xs file:font-bold
              file:bg-blue-50 file:text-blue-600
              hover:file:bg-blue-100 hover:file:text-blue-700
              file:transition-colors file:cursor-pointer cursor-pointer
              border border-slate-100 rounded-xl bg-slate-50/50"
          />
          {file && <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium truncate max-w-[100px]">{file.name}</span>}
        </div>
      </div>

      {/* 2. WEIGHT */}
      <div className="mb-6">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
          <Scale size={14} /> 2. Total Weight (g)
        </label>
        <div className="relative">
          <input
            type="number"
            value={totalWeight === 0 ? '' : totalWeight}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onWeightChange(parseFloat(e.target.value) || 0)}
            placeholder="100"
            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg font-bold text-slate-800 placeholder-slate-300 transition-all shadow-sm
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <p className="text-[8px] text-slate-400 mt-2 italic">Enter sample weight to calculate actual composition</p>
      </div>
        
      {/* 3. TARGET RECIPE */}
      <div className="mb-8">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
            <FlaskConical size={14} /> 3. Target Recipe (%)
          </label>
          <p className="text-[8px] text-slate-400 mb-3 italic">Set target composition percentages (should total ~100%)</p>
          <div className="grid grid-cols-4 gap-3">
            {['N', 'P', 'K', 'Filler'].map((key) => {
              const val = targets[key as keyof typeof targets];
              return (
                <div 
                  key={key} 
                  className="flex flex-col items-center p-2 rounded-xl border transition-colors group bg-white border-slate-100 shadow-sm hover:border-blue-200 cursor-text"
                >
                  <span className="text-[10px] font-bold mb-1 uppercase tracking-wide transition-colors text-slate-400 group-hover:text-blue-500">
                    {key === 'Filler' ? 'FILL' : key}
                  </span>
                  
                  <input 
                    type="number"
                    value={val === 0 ? '' : val} 
                    onFocus={(e) => e.target.select()} 
                    placeholder="0"
                    onChange={(e) => onTargetChange(key, parseFloat(e.target.value) || 0)}
                    className="w-full text-center bg-transparent font-bold text-sm outline-none p-0 
                      [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                      text-slate-800 focus:text-blue-600"
                  />
                </div>
              );
            })}
          </div>
      </div>

      {/* PIE CHART */}
      <div className="mt-4 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
         <div className="flex flex-col gap-2 min-w-[80px]">
            {legendItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-xs font-bold text-slate-500">{item.label}</span>
              </div>
            ))}
         </div>

         <div className="relative h-32 w-32 flex-shrink-0">
           <Doughnut 
             data={pieChartData} 
             options={{ 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
                cutout: '75%' 
             }} 
           />
           <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <span className="text-xl font-black text-slate-800 leading-none">{totalWeight}</span>
             <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">GRAMS</span>
           </div>
         </div>
      </div>
    </div>
  );
}