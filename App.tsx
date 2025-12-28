
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed } from './types';
import { MdAutoAwesome } from "react-icons/md";

const PINCH_THRESHOLD = 0.04; 

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  
  const seedsRef = useRef<Seed[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const isPinchingRef = useRef(false);
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistHoldFramesRef = useRef(0);
  
  // Settings Refs for low-latency access in loop
  const biomeRef = useRef<BiomeTheme>(BiomeTheme.Sunset);
  const speciesRef = useRef<FlowerSpecies>(FlowerSpecies.Random);
  const growthHeightRef = useRef(1.0);

  // UI State
  const [loaded, setLoaded] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [uiState, setUiState] = useState({ isPinching: false, isMouthOpen: false, isFist: false });
  
  const [biome, setBiomeState] = useState<BiomeTheme>(BiomeTheme.Sunset);
  const [species, setSpeciesState] = useState<FlowerSpecies>(FlowerSpecies.Random);
  const [growthHeight, setGrowthHeightState] = useState(1.0);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  useEffect(() => { biomeRef.current = biome; }, [biome]);
  useEffect(() => { speciesRef.current = species; }, [species]);
  useEffect(() => { growthHeightRef.current = growthHeight; }, [growthHeight]);

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
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            requestRef.current = requestAnimationFrame(animate);
          };
        }
      } catch (err) { console.error(err); }
    };
    startStream();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [selectedCamera]);

  const createFlower = (x: number, y: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    const colors = BIOME_COLORS[theme];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const secondaryColor = colors[Math.floor(Math.random() * colors.length)];
    return {
      id: Math.random().toString(36).substr(2, 9),
      x, y,
      maxHeight: 180 + Math.random() * 220,
      currentHeight: 10, bloomProgress: 0,
      species: spec === FlowerSpecies.Random 
        ? Object.values(FlowerSpecies).filter(s => s !== 'RANDOM')[Math.floor(Math.random() * 5)] 
        : spec,
      color, secondaryColor,
      stemControlPoints: [{x:0,y:0}, {x:(Math.random()-0.5)*60,y:-50}, {x:(Math.random()-0.5)*60,y:-100}, {x:0,y:-150}]
    };
  };

  const animate = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) { requestRef.current = requestAnimationFrame(animate); return; }

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const groundY = height - 80;

    const results = visionService.detect(video);
    let pinching = false, mouthOpen = false, fist = false;
    
    // Hand Logic
    if (results?.hands?.landmarks?.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumb = landmarks[4], index = landmarks[8], wrist = landmarks[0];
      const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];

      if (Math.hypot(thumb.x - index.x, thumb.y - index.y) < PINCH_THRESHOLD) {
        pinching = true;
        // Seed only once per pinch action
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
      if (avgDist < 0.15) fist = true;
    }

    // Face Logic
    if (results?.faces?.faceBlendshapes?.[0]) {
      const jaw = results.faces.faceBlendshapes[0].categories.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jaw > 0.25) mouthOpen = true;
    }

    isPinchingRef.current = pinching;
    isMouthOpenRef.current = mouthOpen;
    isFistRef.current = fist;

    if (fist) {
      fistHoldFramesRef.current++;
      if (fistHoldFramesRef.current === 25) { flowersRef.current = []; seedsRef.current = []; }
    } else fistHoldFramesRef.current = 0;

    // Physics & Growth
    seedsRef.current.forEach(s => { s.y += s.vy; s.vy += 0.5; });
    const landing = seedsRef.current.filter(s => s.y >= groundY);
    landing.forEach(s => flowersRef.current.push(createFlower(s.x, groundY, biomeRef.current, speciesRef.current)));
    seedsRef.current = seedsRef.current.filter(s => s.y < groundY);

    flowersRef.current.forEach(f => {
      const targetMax = f.maxHeight * growthHeightRef.current;
      // Mouth controls growth speed: 5.0 when open, 0.2 when closed
      const rate = mouthOpen ? 5.5 : 0.2; 
      
      if (f.currentHeight < targetMax) {
        f.currentHeight += rate;
      }
      
      if (f.currentHeight > targetMax * 0.5 && f.bloomProgress < 1) {
        f.bloomProgress += mouthOpen ? 0.08 : 0.005;
      }
    });

    // Drawing
    ctx.clearRect(0, 0, width, height);

    // Soil Effect
    const soilGrad = ctx.createLinearGradient(0, groundY, 0, height);
    soilGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    soilGrad.addColorStop(0.1, 'rgba(0, 0, 0, 0.4)');
    soilGrad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, groundY, width, height - groundY);

    flowersRef.current.forEach(f => drawFlower(ctx, f));
    
    // Draw Seeds with Glow
    seedsRef.current.forEach(s => { 
      ctx.save();
      ctx.fillStyle = '#FFF'; 
      ctx.shadowBlur = 15; 
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); 
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); 
      ctx.fill();
      ctx.restore();
    });

    // Update UI Indicators
    if (uiState.isPinching !== pinching || uiState.isMouthOpen !== mouthOpen || uiState.isFist !== fist) {
      setUiState({ isPinching: pinching, isMouthOpen: mouthOpen, isFist: fist });
    }
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, f: Flower) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    const h = f.currentHeight;
    
    // Stem
    ctx.beginPath(); 
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      f.stemControlPoints[1].x, -h * 0.33, 
      f.stemControlPoints[2].x, -h * 0.66, 
      f.stemControlPoints[3].x, -h
    );
    ctx.lineWidth = 4; 
    ctx.strokeStyle = '#4CAF50'; 
    ctx.stroke();
    
    // Bloom
    if (f.bloomProgress > 0) {
      ctx.translate(f.stemControlPoints[3].x, -h);
      const scale = f.bloomProgress * (f.maxHeight / 220);
      ctx.scale(scale, scale);
      
      ctx.shadowBlur = 20;
      ctx.shadowColor = f.color;
      ctx.fillStyle = f.color;
      
      if (f.species === FlowerSpecies.Daisy) {
        ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = f.color;
        for (let j = 0; j < 10; j++) { 
          ctx.beginPath(); ctx.rotate((Math.PI * 2) / 10); 
          ctx.ellipse(14, 0, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); 
        }
      } else if (f.species === FlowerSpecies.Tulip) {
        ctx.beginPath(); ctx.moveTo(0, 0); 
        ctx.bezierCurveTo(18, -18, 18, -45, 0, -55); 
        ctx.bezierCurveTo(-18, -45, -18, -18, 0, 0); 
        ctx.fill();
      } else if (f.species === FlowerSpecies.Rose) {
         ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = f.secondaryColor; 
         ctx.beginPath(); ctx.arc(4, -4, 12, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = f.secondaryColor; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };

  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    setAnalysisResult(await analyzeGarden(canvasRef.current.toDataURL('image/png'), flowersRef.current.length));
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none font-sans">
      <div className="relative w-full h-full">
        <video 
          ref={videoRef} 
          style={{ transform: `scaleX(-1)` }}
          className="absolute inset-0 w-full h-full object-cover" 
          playsInline muted 
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform scale-x-[-1] pointer-events-none" />

        <StatusPanel {...uiState} />
        <WorldControls 
          biome={biome} setBiome={setBiomeState}
          species={species} setSpecies={setSpeciesState}
          growthHeight={growthHeight} setGrowthHeight={setGrowthHeightState}
          cameras={cameras} selectedCamera={selectedCamera} setSelectedCamera={setSelectedCamera}
        />

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
          <button onClick={handleAnalyze} disabled={isAnalyzing}
            className="group flex items-center gap-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white px-8 py-4 rounded-full font-bold shadow-2xl transition-all active:scale-95 disabled:opacity-50">
            <MdAutoAwesome className={`text-xl text-pink-400 ${isAnalyzing ? "animate-spin" : "group-hover:rotate-12"}`} />
            <span className="tracking-[0.2em] text-[10px] uppercase">{isAnalyzing ? "CONSULTING GARDEN SPIRITS..." : "AI GARDEN ANALYSIS"}</span>
          </button>
        </div>

        {analysisResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-30 p-6">
             <div className="bg-[#0f0f0f] p-10 rounded-3xl max-w-xl text-center border border-white/10 shadow-2xl relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-pink-500 rounded-b-lg"></div>
                <p className="text-white text-xl font-light leading-relaxed mb-8 italic">"{analysisResult}"</p>
                <button onClick={() => setAnalysisResult(null)} className="px-10 py-3 bg-white text-black rounded-full font-bold text-[10px] tracking-widest uppercase hover:bg-gray-200 transition-colors">BACK TO GARDEN</button>
             </div>
          </div>
        )}

        {!loaded && (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
             <div className="w-16 h-16 border-2 border-white/5 border-t-pink-500 rounded-full animate-spin mb-6"></div>
             <p className="tracking-[0.6em] text-[10px] font-black text-white/40 uppercase">Awakening Nature</p>
           </div>
        )}
      </div>
    </div>
  );
}

export default App;
