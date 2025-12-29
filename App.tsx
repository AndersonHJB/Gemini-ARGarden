
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
  const lastResultsRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(performance.now());
  
  const isPinchingRef = useRef(false);
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistHoldFramesRef = useRef(0);
  
  const biomeRef = useRef<BiomeTheme>(BiomeTheme.Sunset);
  const speciesRef = useRef<FlowerSpecies>(FlowerSpecies.Random);
  const growthHeightRef = useRef(1.0);

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
            lastTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
          };
        }
      } catch (err) { console.error(err); }
    };
    startStream();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [selectedCamera]);

  const mapCoordinates = (normX: number, normY: number, canvas: HTMLCanvasElement) => {
    return {
      x: normX * canvas.width,
      y: normY * canvas.height
    };
  };

  const createFlower = (relX: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    const colors = BIOME_COLORS[theme];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const secondaryColor = colors[Math.floor(Math.random() * colors.length)];
    
    const speciesOptions = Object.values(FlowerSpecies).filter(s => s !== FlowerSpecies.Random);
    const chosenSpecies = spec === FlowerSpecies.Random 
      ? speciesOptions[Math.floor(Math.random() * speciesOptions.length)] 
      : spec;

    return {
      id: Math.random().toString(36).substr(2, 9),
      relX,
      maxHeight: 180 + Math.random() * 240,
      currentHeight: 0, 
      bloomProgress: 0,
      species: chosenSpecies,
      color, secondaryColor,
      stemControlPoints: [
        {x: 0, y: 0}, 
        {x: (Math.random() - 0.5) * 80, y: -50}, 
        {x: (Math.random() - 0.5) * 80, y: -100}, 
        {x: (Math.random() - 0.5) * 40, y: -150}
      ]
    };
  };

  const animate = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.videoWidth === 0) { 
      requestRef.current = requestAnimationFrame(animate); 
      return; 
    }

    const currentTime = performance.now();
    const dt = (currentTime - lastTimeRef.current) / 16.666;
    lastTimeRef.current = currentTime;

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const groundY = height - 20; 

    const currentResults = visionService.detect(video);
    const results = currentResults || lastResultsRef.current;
    lastResultsRef.current = results;

    let currentlyPinching = false, mouthOpen = false, fist = false;
    
    if (results?.hands?.landmarks?.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumb = landmarks[4], index = landmarks[8], wrist = landmarks[0];
      const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];

      const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      if (distance < PINCH_THRESHOLD) {
        currentlyPinching = true;
        if (!isPinchingRef.current) {
          const pos = mapCoordinates((thumb.x + index.x) / 2, (thumb.y + index.y) / 2, canvas);
          seedsRef.current.push({
            id: Math.random().toString(36).substring(7) + Date.now(),
            x: pos.x,
            y: pos.y,
            vy: 5, color: '#5D4037'
          });
        }
      }
      const avgDist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / 4;
      if (avgDist < 0.15) fist = true;
    }

    if (results?.faces?.faceBlendshapes?.[0]) {
      const jaw = results.faces.faceBlendshapes[0].categories.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jaw > 0.28) mouthOpen = true;
    }

    isPinchingRef.current = currentlyPinching;
    isMouthOpenRef.current = mouthOpen;
    isFistRef.current = fist;

    if (fist) {
      fistHoldFramesRef.current++;
      if (fistHoldFramesRef.current === 25) { flowersRef.current = []; seedsRef.current = []; }
    } else fistHoldFramesRef.current = 0;

    seedsRef.current.forEach(s => { 
      s.y += s.vy * dt; 
      s.vy += 0.5 * dt; 
    });

    const landing = seedsRef.current.filter(s => s.y >= groundY);
    landing.forEach(s => {
      const relX = s.x / width;
      flowersRef.current.push(createFlower(relX, biomeRef.current, speciesRef.current));
    });
    seedsRef.current = seedsRef.current.filter(s => s.y < groundY);

    flowersRef.current.forEach(f => {
      const rate = (mouthOpen ? 5.5 : 0) * dt; 
      if (f.currentHeight < f.maxHeight) {
        f.currentHeight += rate;
        if (f.currentHeight > f.maxHeight) f.currentHeight = f.maxHeight;
      } 
      if (f.currentHeight > f.maxHeight * 0.4 && f.bloomProgress < 1) {
        f.bloomProgress += (mouthOpen ? 0.08 : 0) * dt;
      }
    });

    ctx.clearRect(0, 0, width, height);

    flowersRef.current.forEach(f => {
      const x = f.relX * width;
      const displayHeight = f.currentHeight * growthHeightRef.current;
      drawFlower(ctx, f, x, groundY, displayHeight);
    });
    
    seedsRef.current.forEach(s => { 
      drawSeed(ctx, s.x, s.y);
    });

    // Darker, more grounded soil line
    const soilGrad = ctx.createLinearGradient(0, groundY, 0, height);
    soilGrad.addColorStop(0, 'rgba(30, 15, 5, 0.5)');
    soilGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, groundY, width, height - groundY);

    if (uiState.isPinching !== currentlyPinching || uiState.isMouthOpen !== mouthOpen || uiState.isFist !== fist) {
      setUiState({ isPinching: currentlyPinching, isMouthOpen: mouthOpen, isFist: fist });
    }
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const drawSeed = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.save();
    ctx.fillStyle = '#5D4037'; 
    ctx.shadowBlur = 4; 
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); 
    ctx.ellipse(x, y, 6, 4, Math.PI / 6, 0, Math.PI * 2); 
    ctx.fill();
    ctx.restore();
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, f: Flower, x: number, y: number, displayHeight: number) => {
    // Requirements: Show seed if not grown yet.
    // If growth started (currentHeight > 0), show soil mound.
    if (f.currentHeight === 0) {
      drawSeed(ctx, x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y);

    // 1. Organic Soil Mound (only shows once growth starts)
    const moundWidth = 24 + (f.currentHeight / f.maxHeight) * 12;
    const moundHeight = 6 + (f.currentHeight / f.maxHeight) * 4;
    const moundGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, moundWidth);
    moundGrad.addColorStop(0, '#3E2723');
    moundGrad.addColorStop(0.6, '#4E342E');
    moundGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, moundWidth, moundHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Stem Rendering
    const h = displayHeight;
    ctx.beginPath(); 
    ctx.moveTo(0, 0);
    const cp1x = f.stemControlPoints[1].x;
    const cp1y = -h * 0.33;
    const cp2x = f.stemControlPoints[2].x;
    const cp2y = -h * 0.66;
    const tipX = f.stemControlPoints[3].x;
    const tipY = -h;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tipX, tipY);
    ctx.lineWidth = 3 + (f.currentHeight / 200);
    ctx.strokeStyle = '#2E7D32';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 3. Leaves along the stem
    if (h > 40) {
      const leafCount = Math.floor(h / 60) + 1;
      for (let i = 1; i <= leafCount; i++) {
        const t = (i / (leafCount + 1));
        // Approximate position on the cubic bezier
        const lx = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * tipX;
        const ly = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * tipY;
        
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(Math.sin(i * 1.5 + f.relX) * 0.4 + (i % 2 === 0 ? 0.8 : -0.8));
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.ellipse(8, 0, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 4. Bloom Rendering
    if (f.bloomProgress > 0) {
      ctx.translate(tipX, tipY);
      const baseScale = (f.maxHeight / 250) * growthHeightRef.current;
      const progressScale = f.bloomProgress;
      const finalScale = baseScale * progressScale;
      
      ctx.scale(Math.max(0.01, finalScale), Math.max(0.01, finalScale));
      ctx.shadowBlur = 15;
      ctx.shadowColor = f.color;
      
      renderFlowerHead(ctx, f);
    }
    ctx.restore();
  };

  const renderFlowerHead = (ctx: CanvasRenderingContext2D, f: Flower) => {
    const { species, color, secondaryColor } = f;
    
    switch (species) {
      case FlowerSpecies.Daisy:
        // Petals
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 12);
          ctx.ellipse(18, 0, 15, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Center
        ctx.fillStyle = '#FFD600';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        break;

      case FlowerSpecies.Rose:
        // Layered petals
        ctx.fillStyle = color;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 5);
          ctx.ellipse(12, 0, 18, 14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = secondaryColor;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.rotate(1.2);
          ctx.ellipse(6, 0, 12, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case FlowerSpecies.Tulip:
        ctx.fillStyle = color;
        // Outer
        ctx.beginPath();
        ctx.ellipse(-8, -10, 14, 22, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, -10, 14, 22, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Inner
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.ellipse(0, -12, 12, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case FlowerSpecies.Lily:
        ctx.fillStyle = color;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 6);
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(20, -20, 35, 0);
          ctx.quadraticCurveTo(20, 20, 0, 0);
          ctx.fill();
        }
        ctx.fillStyle = '#FBC02D';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        break;

      case FlowerSpecies.Poppy:
        ctx.fillStyle = color;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 4);
          ctx.ellipse(15, 0, 20, 18, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Dark center
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFC107';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;

      default:
        // Generic multi-petaled flower
        ctx.fillStyle = color;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 8);
          ctx.ellipse(15, 0, 12, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
    }
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
          className="absolute inset-0 w-full h-full object-fill" 
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
