"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend,
} from "chart.js";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Zap, Microscope, Calculator as CalcIcon } from "lucide-react";
import ControlPanel from "@/components/ControlPanel";
import ImagePreview from "@/components/ImagePreview";
import StatCard from "@/components/StatCard";
import PerspectiveCropper from "@/components/PerspectiveCropper";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://thadzy-npksense.hf.space";
const API_URL = `${BASE_URL}/analyze_interactive`;
const DETECT_CORNERS_URL = `${BASE_URL}/detect_corners`;
const HEALTH_URL = `${BASE_URL}/health`;

function DashboardContent() {
  const searchParams = useSearchParams();

  // --- STATE (ตัวแปรจัดการสถานะของหน้าเว็บ) ---
  // file: ไฟล์รูปภาพที่ User อัพโหลด
  // targets: เป้าหมายสูตรปุ๋ย (N, P, K, Filler) ที่ตั้งไว้
  // massScores: ค่าความหนาแน่นสัมพัทธ์ (Relative Mass) ที่ Backend ตอบกลับมา
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [croppedRawImage, setCroppedRawImage] = useState<string | null>(null);
  const [currentDisplayImage, setCurrentDisplayImage] = useState<string | null>(null);

  const [isCropping, setIsCropping] = useState(false);
  const [lastCropPoints, setLastCropPoints] = useState<{ x: number, y: number }[] | null>(null);
  const [autoDetectedPoints, setAutoDetectedPoints] = useState<{ x: number, y: number }[] | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'warming' | 'ready' | 'error'>('unknown');

  const [threshold, setThreshold] = useState(35);
  const [totalWeight, setTotalWeight] = useState(100);

  // Targets state
  const [targets, setTargets] = useState({ N: 15, P: 15, K: 15, Filler: 55 });

  const [massScores, setMassScores] = useState({ N: 0, P: 0, K: 0, Filler: 0 });
  const [histData, setHistData] = useState<number[]>(Array(256).fill(0));
  const [autoThreshold, setAutoThreshold] = useState(35);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Warmup: ping /health with retry — HF Space returns 503 while waking up
  useEffect(() => {
    let cancelled = false;
    const poll = async (attempts = 0) => {
      if (cancelled) return;
      setBackendStatus('warming');
      try {
        const r = await fetch(HEALTH_URL);
        if (cancelled) return;
        if (r.ok) { setBackendStatus('ready'); return; }
        if (r.status === 503 && attempts < 20) {
          setTimeout(() => poll(attempts + 1), 3000); // retry every 3s, up to 60s
        } else {
          setBackendStatus('error');
        }
      } catch {
        if (!cancelled && attempts < 20) setTimeout(() => poll(attempts + 1), 3000);
        else if (!cancelled) setBackendStatus('error');
      }
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  // Load Params from URL
  useEffect(() => {
    const nParam = searchParams.get('n');
    const pParam = searchParams.get('p');
    const kParam = searchParams.get('k');
    const wParam = searchParams.get('weight');

    if (nParam || pParam || kParam) {
      const n = parseFloat(nParam || '0');
      const p = parseFloat(pParam || '0');
      const k = parseFloat(kParam || '0');
      const w = parseFloat(wParam || '100');
      const filler = Math.max(0, 100 - (n + p + k));

      setTargets({ N: n, P: p, K: k, Filler: filler });
      setTotalWeight(w);
      setTimeout(scrollToAnalyzer, 500);
    }
  }, [searchParams]);

  // --- 🛠️ UPDATED HANDLER: Flexible Filler ซิงค์เป้าหมายการผสมปุ๋ย ---
  // เมื่อผู้ใช้ปรับ % ของ N, P, หรือ K บนหน้าเว็บ ระบบจะคำนวณหักลบกาก (Filler) อัตโนมัติ
  // แต่ถ้าผู้ใช้ปรับกาก (Filler) โดยตรง จะไม่มีการแก้ N, P, K ของเดิม
  const handleTargetChange = (key: string, value: number) => {
    const newVal = isNaN(value) ? 0 : value;

    if (key === 'Filler') {
      // ✅ ถ้าแก้ Filler ให้รับค่านั้นเลย (Manual Override)
      setTargets({ ...targets, Filler: newVal });
    } else {
      // ✅ ถ้าแก้ N, P, K ให้คำนวณ Filler อัตโนมัติ (Auto Calc)
      const nextTargets = { ...targets, [key]: newVal };
      const totalNutrients = (key === 'N' ? newVal : targets.N) +
        (key === 'P' ? newVal : targets.P) +
        (key === 'K' ? newVal : targets.K);

      const newFiller = Math.max(0, 100 - totalNutrients);

      setTargets({
        ...nextTargets,
        Filler: newFiller
      });
    }
  };

  // --- OTHER HANDLERS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const imgUrl = ev.target.result as string;
          setOriginalImage(imgUrl);
          setProcessedImage(null);
          setCroppedRawImage(null);
          setCurrentDisplayImage(null);
          setLastCropPoints(null);
          setAutoDetectedPoints(null);
          setAutoDetected(false);

          // ตรวจจับมุมอัตโนมัติก่อนแสดง Cropper
          const formData = new FormData();
          formData.append("file", selectedFile);
          fetch(DETECT_CORNERS_URL, { method: "POST", body: formData })
            .then(r => r.json())
            .then(data => {
              setAutoDetectedPoints(data.points);
              setAutoDetected(data.detected === true);
            })
            .catch(() => {
              // ถ้า detect ไม่ได้ ใช้ค่า default ของ Cropper แทน
            })
            .finally(() => setIsCropping(true));
        }
      };
      reader.readAsDataURL(selectedFile);
      e.target.value = "";
    }
  };

  const handleCropConfirm = (points: { x: number, y: number }[]) => {
    setIsCropping(false);
    setLastCropPoints(points);
    if (file) {
      analyzeImage(file, threshold, true, points);
      scrollToAnalyzer();
    }
  };

  // --- ฟังก์ชันหลัก: ส่งภาพดัดมุม (Perspective Cropped) ไปให้ FastAPI วิเคราะห์ ---
  const analyzeImage = async (selectedFile: File, threshVal: number, isFirstLoad = false, points: { x: number, y: number }[] | null = null) => {
    setLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("threshold", threshVal.toString());

    const pointsToSend = points || lastCropPoints;
    if (pointsToSend) {
      formData.append("points", JSON.stringify(pointsToSend));
    }

    try {
      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (res.status === 503) {
        // HF Space กำลัง wake up — แจ้งผู้ใช้และให้รอ
        setBackendStatus('warming');
        alert("The AI backend is waking up (cold start). Please wait ~30 seconds and try again.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Server error ${res.status}: ${errText}`);
      }
      const data = await res.json();

      const procImg = `data:image/jpeg;base64,${data.image_b64}`;
      const rawCrop = data.raw_cropped_b64 ? `data:image/jpeg;base64,${data.raw_cropped_b64}` : null;

      setProcessedImage(procImg);
      if (rawCrop) setCroppedRawImage(rawCrop);
      setCurrentDisplayImage(procImg);
      setMassScores(data.areas);
      setBackendStatus('ready');

      if (isFirstLoad && data.histogram) {
        setHistData(data.histogram);
        setAutoThreshold(data.auto_threshold);
        setThreshold(data.auto_threshold);
      }
    } catch (err) {
      console.error("analyzeImage error:", err);
      alert(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSliderChange = (val: number) => {
    setThreshold(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (file) analyzeImage(file, val, false, lastCropPoints);
    }, 300);
  };

  const scrollToAnalyzer = () => {
    const section = document.getElementById('analyzer-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  // --- แปลงค่า Mass Score (ที่เป็นสัดส่วน) ให้เป็นค่าน้ำหนักจริง (Final Weights) ตาม Total Weight ที่ผู้ใช้กรอก ---
  const totalScore = Object.values(massScores).reduce((a, b) => a + b, 0);
  const factor = totalScore > 0 ? (totalWeight / totalScore) : 0;

  const finalWeights = {
    N: massScores.N * factor,
    P: massScores.P * factor,
    K: massScores.K * factor,
    Filler: massScores.Filler * factor
  };

  const histChartData = {
    labels: Array.from({ length: 256 }, (_, i) => i),
    datasets: [{
      label: 'Count', data: histData,
      backgroundColor: (ctx: any) => ctx.dataIndex <= threshold ? '#94a3b8' : '#facc15',
      barPercentage: 1.0, categoryPercentage: 1.0,
    }]
  };
  const pieChartData = {
    labels: ['N', 'Filler', 'P', 'K'],
    datasets: [{
      data: [finalWeights.N, finalWeights.Filler, finalWeights.P, finalWeights.K],
      backgroundColor: ['#94a3b8', '#facc15', '#10b981', '#ef4444'], borderWidth: 0,
    }]
  };

  return (
    <div className="bg-white font-sans selection:bg-blue-100">

      {isCropping && originalImage && (
        <PerspectiveCropper
          imageSrc={originalImage}
          onConfirm={handleCropConfirm}
          onCancel={() => { setIsCropping(false); setFile(null); }}
          initialPoints={autoDetectedPoints ?? undefined}
          autoDetected={autoDetected}
        />
      )}

      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 overflow-hidden py-20">
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          <div className="absolute inset-0 bg-white"></div>
          <div className="absolute -top-[10%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-b from-cyan-100 via-blue-200 to-transparent opacity-70 blur-[80px]"></div>
          <div className="absolute top-[0%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-r from-indigo-100 via-purple-100 to-transparent opacity-70 blur-[100px]"></div>
          <div className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full bg-blue-50 opacity-80 blur-[120px]"></div>
        </div>

        <div className="relative z-10 text-center max-w-5xl mx-auto space-y-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-blue-100 shadow-sm text-sm font-semibold text-blue-700 mb-4">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            AI-Powered Fertilizer Analysis 2.0
          </div>
          {backendStatus === 'warming' && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium mb-2">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full"></span>
              AI backend waking up… (may take ~30s)
            </div>
          )}
          {backendStatus === 'error' && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-medium mb-2 cursor-pointer"
              onClick={() => { setBackendStatus('warming'); fetch(HEALTH_URL).then(r => r.ok ? setBackendStatus('ready') : setBackendStatus('error')).catch(() => setBackendStatus('error')); }}>
              ⚠ Backend unreachable — click to retry
            </div>
          )}
          {backendStatus === 'ready' && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-2">
              ✓ Backend ready
            </div>
          )}

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-tight">
            Precision Farming <br />
            Starts with <span className="text-blue-600">Perfect NPK.</span>
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button onClick={scrollToAnalyzer} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 text-lg">
              <Microscope size={24} /> Start Analyzing
            </button>
          </div>

          <div className="pt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard icon={<Zap className="w-6 h-6" />} title="Instant AI Analysis" desc="Detects N, P, K particles in milliseconds." />
            <FeatureCard icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />} title="Physics Engine" desc="Calculates weight based on volume & density." />
            <FeatureCard icon={<CalcIcon className="w-6 h-6 text-purple-500" />} title="Reverse Recipe" desc="Reverse engineering your mix recipe." />
          </div>
        </div>
      </section>

      <div id="analyzer-section" className="min-h-screen py-20 bg-white border-t border-slate-100 relative z-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-black text-slate-900">Analysis Dashboard</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <ControlPanel
                file={file}
                threshold={threshold}
                totalWeight={totalWeight}
                targets={targets}
                histChartData={histChartData}
                pieChartData={pieChartData}
                onFileUpload={handleFileUpload}
                onSliderChange={handleSliderChange}
                onAutoClick={() => { setThreshold(autoThreshold); if (file) analyzeImage(file, autoThreshold, false); }}
                onWeightChange={setTotalWeight}
                onTargetChange={handleTargetChange}
              />
            </div>
            <div className="lg:col-span-8 space-y-6 flex flex-col h-full">
              <ImagePreview
                loading={loading}
                processedImage={processedImage}
                currentDisplayImage={currentDisplayImage}
                onToggleStart={() => {
                  if (croppedRawImage) setCurrentDisplayImage(croppedRawImage);
                  else if (originalImage) setCurrentDisplayImage(originalImage);
                }}
                onToggleEnd={() => { if (processedImage) setCurrentDisplayImage(processedImage); }}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="N (Urea)" subLabel="46-0-0" value={finalWeights.N} total={totalWeight} target={targets.N} color="text-slate-600" barColor="bg-slate-400" />
                <StatCard label="P (DAP)" subLabel="18-46-0" value={finalWeights.P} total={totalWeight} target={targets.P} color="text-emerald-600" barColor="bg-emerald-500" />
                <StatCard label="K (Potash)" subLabel="0-0-60" value={finalWeights.K} total={totalWeight} target={targets.K} color="text-rose-600" barColor="bg-rose-500" />
                <StatCard label="Filler" subLabel="Inert" value={finalWeights.Filler} total={totalWeight} target={targets.Filler} color="text-amber-600" barColor="bg-amber-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-left">
      <div className="mb-4 bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600">
        {icon}
      </div>
      <h3 className="font-bold text-slate-800 text-lg mb-3">{title}</h3>
      <p className="text-slate-500 text-sm">{desc}</p>
    </div>
  )
}

export default function NPKSenseDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}