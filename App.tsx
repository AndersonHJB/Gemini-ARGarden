
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed } from './types';
import { MdAutoAwesome } from "react-icons/md";

// Constants
const PINCH_THRESHOLD = 0.05;
const GROUND_LEVEL_Y_RATIO = 0.94; // 纤薄土地比例

function App() {
  // Refs for persistent state across renders
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  
  // Game state held in refs to ensure the animation loop always has the latest data without closure staling
  const seedsRef = useRef<Seed[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const isPinchingRef = useRef(false);
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistHoldFramesRef = useRef(0);
  
  // Refs for settings to avoid re-triggering the loop setup
  const biomeRef = useRef<BiomeTheme>(BiomeTheme.Sunset);
  const speciesRef = useRef<FlowerSpecies>(FlowerSpecies.Random);
  const growthHeightRef = useRef(1.0);

  // UI state for React rendering
  const [loaded, setLoaded] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [uiState, setUiState] = useState({ isPinching: false, isMouthOpen: false, isFist: false });
  const [biome, setBiomeState] = useState<BiomeTheme>(BiomeTheme.Sunset);
  const [species, setSpeciesState] = useState<FlowerSpecies>(FlowerSpecies.Random);
  const [growthHeight, setGrowthHeightState] = useState(1.0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // Sync state to refs
  useEffect(() => { biomeRef.current = biome; }, [biome]);
  useEffect(() => { speciesRef.current = species; }, [species]);
  useEffect(() => { growthHeightRef.current = growthHeight; }, [growthHeight]);

  // Initialization
  useEffect(() => {
    const init = async () => {
      await visionService.initialize();
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameras(videoDevices);
      if (videoDevices.length > 0) setSelectedCamera(videoDevices[0].deviceId);
      setLoaded(true);
    };
    init();
  }, []);

  // Handle Resize and Camera Stream
  useEffect(() => {
    if (!selectedCamera || !videoRef.current) return;
    
    const startStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedCamera, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            // Start or restart the loop
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            requestRef.current = requestAnimationFrame(animate);
          };
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startStream();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [selectedCamera]);

  const createFlower = (x: number, y: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    const colors = BIOME_COLORS[theme];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const secondaryColor = colors[Math.floor(Math.random() * colors.length)];
    const stemPoints: Point[] = [
      { x: 0, y: 0 },
      { x: (Math.random() - 0.5) * 60, y: -50 },
      { x: (Math.random() - 0.5) * 60, y: -100 },
      { x: 0, y: -150 }
    ];
    return {
      id: Math.random().toString(36).substr(2, 9),
      x, y,
      maxHeight: 180 + Math.random() * 250,
      currentHeight: 5, bloomProgress: 0,
      species: spec === FlowerSpecies.Random 
        ? Object.values(FlowerSpecies).filter(s => s !== 'RANDOM')[Math.floor(Math.random() * 5)] 
        : spec,
      color, secondaryColor, stemControlPoints: stemPoints
    };
  };

  // --- Animation Loop ---
  const animate = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // 1. 核心：强制画布物理尺寸实时跟随窗口，解决 Resize 不同步问题
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const groundY = height * GROUND_LEVEL_Y_RATIO;

    // Detection
    const results = visionService.detect(video);
    
    // Logic
    let pinching = false;
    let mouthOpen = false;
    let fist = false;
    
    if (results?.hands && results.hands.landmarks.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumb = landmarks[4];
      const index = landmarks[8];
      const wrist = landmarks[0];
      const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];

      if (Math.hypot(thumb.x - index.x, thumb.y - index.y) < PINCH_THRESHOLD) {
        pinching = true;
        if (!isPinchingRef.current) {
          seedsRef.current.push({
            id: Date.now().toString(),
            x: (thumb.x + index.x) / 2 * width,
            y: (thumb.y + index.y) / 2 * height,
            vy: 4, color: '#FFFFFF'
          });
        }
      }
      const avgDist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / 4;
      if (avgDist < 0.22) fist = true;
    }

    if (results?.faces && results.faces.faceBlendshapes.length > 0) {
      const jawOpen = results.faces.faceBlendshapes[0].categories.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jawOpen > 0.25) mouthOpen = true;
    }

    // Update internal refs for next frame comparison
    isPinchingRef.current = pinching;
    isMouthOpenRef.current = mouthOpen;
    isFistRef.current = fist;

    if (fist) {
      fistHoldFramesRef.current++;
      if (fistHoldFramesRef.current === 15) {
         flowersRef.current = [];
         seedsRef.current = [];
      }
    } else {
      fistHoldFramesRef.current = 0;
    }

    // Physics
    seedsRef.current.forEach(s => { s.y += s.vy; s.vy += 0.5; });
    const landing = seedsRef.current.filter(s => s.y >= groundY);
    landing.forEach(s => flowersRef.current.push(createFlower(s.x, groundY, biomeRef.current, speciesRef.current)));
    seedsRef.current = seedsRef.current.filter(s => s.y < groundY);

    flowersRef.current.forEach(f => {
      f.y = groundY; // 核心：实时修正存量花朵的地平线锚点
      const targetMax = f.maxHeight * growthHeightRef.current;
      const rate = mouthOpen ? 4.0 : 0.2;
      if (f.currentHeight < targetMax) f.currentHeight += rate;
      else if (f.currentHeight > targetMax + 5) f.currentHeight -= 2.0;
      if (f.currentHeight > targetMax * 0.7 && f.bloomProgress < 1) f.bloomProgress += mouthOpen ? 0.08 : 0.01;
    });

    // Rendering
    ctx.clearRect(0, 0, width, height);

    // Soil (Always covers full width)
    const soilGrad = ctx.createLinearGradient(0, groundY, 0, height);
    soilGrad.addColorStop(0, 'rgba(40, 35, 30, 0.2)');
    soilGrad.addColorStop(1, 'rgba(10, 5, 0, 0.7)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, groundY, width, height - groundY);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(width, groundY); ctx.stroke();

    flowersRef.current.forEach(f => drawFlower(ctx, f));
    seedsRef.current.forEach(s => { ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill(); });

    if (pinching && results?.hands?.landmarks[0]) {
      const t = results.hands.landmarks[0][4];
      const i = results.hands.landmarks[0][8];
      ctx.beginPath(); ctx.arc((t.x + i.x)/2 * width, (t.y + i.y)/2 * height, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(236, 72, 153, 0.4)'; ctx.fill();
    }

    // Sync UI feedback (throttled by react)
    if (uiState.isPinching !== pinching || uiState.isMouthOpen !== mouthOpen || uiState.isFist !== fist) {
      setUiState({ isPinching: pinching, isMouthOpen: mouthOpen, isFist: fist });
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, f: Flower) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    const h = f.currentHeight;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(f.stemControlPoints[1].x, -h * 0.33, f.stemControlPoints[2].x, -h * 0.66, f.stemControlPoints[3].x, -h);
    ctx.lineWidth = 3; ctx.strokeStyle = '#8BC34A'; ctx.stroke();
    if (h > 40) {
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath(); ctx.ellipse(8, -h * 0.3, 10 + h/20, 4, Math.PI / 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, -h * 0.5, 10 + h/20, 4, -Math.PI / 5, 0, Math.PI * 2); ctx.fill();
    }
    if (f.bloomProgress > 0) {
      ctx.translate(f.stemControlPoints[3].x, -h);
      const scale = f.bloomProgress * (f.maxHeight / 200);
      ctx.scale(scale, scale);
      ctx.fillStyle = f.color;
      if (f.species === FlowerSpecies.Daisy) {
        ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = f.color;
        for (let j = 0; j < 12; j++) { ctx.beginPath(); ctx.rotate((Math.PI * 2) / 12); ctx.ellipse(12, 0, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); }
      } else if (f.species === FlowerSpecies.Tulip) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(15, -15, 15, -40, 0, -50); ctx.bezierCurveTo(-15, -40, -15, -15, 0, 0); ctx.fill();
      } else if (f.species === FlowerSpecies.Rose) {
         ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = f.secondaryColor; ctx.beginPath(); ctx.arc(3, -3, 10, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(-2, 2, 6, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = f.secondaryColor; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };

  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    const result = await analyzeGarden(canvasRef.current.toDataURL('image/png'), flowersRef.current.length);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <div className="relative w-full h-full">
        {/* Webcam */}
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" playsInline muted />

        {/* AR Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform scale-x-[-1] pointer-events-none" />

        {/* UI Controls */}
        <StatusPanel isPinching={uiState.isPinching} isMouthOpen={uiState.isMouthOpen} isFist={uiState.isFist} />

        <WorldControls 
          biome={biome} setBiome={setBiomeState}
          species={species} setSpecies={setSpeciesState}
          growthHeight={growthHeight} setGrowthHeight={setGrowthHeightState}
          cameras={cameras} selectedCamera={selectedCamera} setSelectedCamera={setSelectedCamera}
        />

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
          <button onClick={handleAnalyze} disabled={isAnalyzing}
            className="group flex items-center gap-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white px-10 py-5 rounded-full font-bold shadow-2xl transition-all active:scale-95 disabled:opacity-50">
            <MdAutoAwesome className={`text-2xl text-pink-400 ${isAnalyzing ? "animate-spin" : "group-hover:rotate-12"}`} />
            <span className="tracking-[0.2em] text-xs uppercase">{isAnalyzing ? "READING GARDEN SOUL..." : "ANALYZE GARDEN"}</span>
          </button>
        </div>

        {analysisResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-30 px-6">
             <div className="bg-[#111] p-12 rounded-[40px] max-w-2xl text-center border border-white/10 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-pink-500 rounded-b-full"></div>
                <h3 className="text-pink-400 font-black tracking-widest text-sm mb-8 uppercase">Garden Whisper</h3>
                <p className="text-white text-2xl font-light leading-relaxed mb-10 italic">"{analysisResult}"</p>
                <button onClick={() => setAnalysisResult(null)} className="px-12 py-4 bg-white text-black rounded-full font-bold text-xs tracking-widest uppercase hover:scale-105 transition-transform">BACK TO GARDEN</button>
             </div>
          </div>
        )}

        {!loaded && (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
             <div className="w-20 h-20 border-2 border-white/5 border-t-pink-500 rounded-full animate-spin mb-8"></div>
             <p className="tracking-[0.5em] text-[10px] font-black text-white/40 uppercase">Awakening Seeds</p>
           </div>
        )}
      </div>
    </div>
  );
}

export default App;
