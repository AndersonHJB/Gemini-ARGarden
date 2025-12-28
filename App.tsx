import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed } from './types';
import { MdAutoAwesome } from "react-icons/md";

// Constants
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const PINCH_THRESHOLD = 0.05;
const GRAVITY = 8;
const GROUND_LEVEL_Y = 0.85; // Percentage of screen height

function App() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  // State
  const [loaded, setLoaded] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  
  // Game State Refs (Mutable for performance)
  const seedsRef = useRef<Seed[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const isPinchingRef = useRef(false);
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistHoldFramesRef = useRef(0);
  
  // UI Sync State (Ref to check diffs, State to trigger render)
  const uiStateRef = useRef({ isPinching: false, isMouthOpen: false, isFist: false });
  const [uiState, setUiState] = useState({
    isPinching: false,
    isMouthOpen: false,
    isFist: false
  });

  // Controls State
  const [biome, setBiome] = useState<BiomeTheme>(BiomeTheme.Sunset);
  const [species, setSpecies] = useState<FlowerSpecies>(FlowerSpecies.Random);
  const [growthHeight, setGrowthHeight] = useState(1.0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

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

  // Camera Stream
  useEffect(() => {
    if (!selectedCamera || !videoRef.current) return;
    
    const startStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: selectedCamera,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            requestRef.current = requestAnimationFrame(loop);
          };
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startStream();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [selectedCamera]);

  // Game Logic Helper: Generate Flower
  const createFlower = (x: number, y: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    const colors = BIOME_COLORS[theme];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const secondaryColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Bezier control points for a natural wavy stem
    const stemPoints: Point[] = [
      { x: 0, y: 0 }, // Base (relative)
      { x: (Math.random() - 0.5) * 60, y: -50 },
      { x: (Math.random() - 0.5) * 60, y: -100 },
      { x: 0, y: -150 } // Top (relative)
    ];

    return {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      maxHeight: 180 + Math.random() * 250,
      currentHeight: 5,
      bloomProgress: 0,
      species: spec === FlowerSpecies.Random 
        ? Object.values(FlowerSpecies).filter(s => s !== 'RANDOM')[Math.floor(Math.random() * 5)] 
        : spec,
      color,
      secondaryColor,
      stemControlPoints: stemPoints
    };
  };

  // --- Main Loop ---
  const loop = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Detection
    const results = visionService.detect(videoRef.current);
    
    // 2. Logic Process
    let pinching = false;
    let mouthOpen = false;
    let fist = false;
    
    if (results?.hands && results.hands.landmarks.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const wrist = landmarks[0];
      const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]; // Index, Middle, Ring, Pinky

      // Pinch Detection (Thumb + Index)
      const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      if (pinchDist < PINCH_THRESHOLD) {
        pinching = true;
        
        // Spawn seed logic
        // Only spawn on "fresh" pinch or periodically if held? 
        // Let's do: spawn one immediately on pinch start.
        if (!isPinchingRef.current) {
          const seedX = (thumbTip.x + indexTip.x) / 2 * CANVAS_WIDTH;
          const seedY = (thumbTip.y + indexTip.y) / 2 * CANVAS_HEIGHT;
          
          seedsRef.current.push({
            id: Date.now().toString(),
            x: seedX,
            y: seedY,
            vy: 4, // Initial velocity down
            color: '#FFFFFF'
          });
        }
      }

      // Fist Detection
      // Check average distance of fingertips to wrist.
      // Open hand: fingers far from wrist (~0.4 - 0.6). Closed fist: fingers close (~0.2).
      const avgDistToWrist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / 4;
      
      if (avgDistToWrist < 0.22) { 
        fist = true;
      }
    }

    // Mouth Detection
    if (results?.faces && results.faces.faceBlendshapes.length > 0) {
      const blendshapes = results.faces.faceBlendshapes[0].categories;
      const jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jawOpen > 0.25) {
        mouthOpen = true;
      }
    }

    // Update Logic State
    isPinchingRef.current = pinching;
    isMouthOpenRef.current = mouthOpen;
    isFistRef.current = fist;

    // Fist Hold Logic (Prevent accidental clears)
    if (fist) {
      fistHoldFramesRef.current++;
      if (fistHoldFramesRef.current > 10 && fistHoldFramesRef.current < 12) { // Trigger once after holding
         flowersRef.current = [];
         seedsRef.current = [];
      }
    } else {
      fistHoldFramesRef.current = 0;
    }

    // 3. UI Sync (Instant update if changed)
    const newUiState = { isPinching: pinching, isMouthOpen: mouthOpen, isFist: fist };
    if (
        newUiState.isPinching !== uiStateRef.current.isPinching ||
        newUiState.isMouthOpen !== uiStateRef.current.isMouthOpen ||
        newUiState.isFist !== uiStateRef.current.isFist
    ) {
        setUiState(newUiState);
        uiStateRef.current = newUiState;
    }

    // 4. Physics & Growth Update
    const groundY = CANVAS_HEIGHT * GROUND_LEVEL_Y;

    // Seeds
    seedsRef.current.forEach(seed => {
      seed.y += seed.vy;
      seed.vy += 0.5; // Gravity
    });

    const fallingSeeds = seedsRef.current.filter(s => s.y < groundY);
    const plantingSeeds = seedsRef.current.filter(s => s.y >= groundY);
    plantingSeeds.forEach(seed => {
      flowersRef.current.push(createFlower(seed.x, groundY, biome, species));
    });
    seedsRef.current = fallingSeeds;

    // Flowers
    flowersRef.current.forEach(flower => {
      const targetMax = flower.maxHeight * growthHeight;
      const growthRate = mouthOpen ? 4.0 : 0.2; // Faster growth when mouth open
      
      if (flower.currentHeight < targetMax) {
        flower.currentHeight += growthRate;
      } else if (flower.currentHeight > targetMax + 5) {
        flower.currentHeight -= 2.0; // Shrink back down smoothly
      }

      // Bloom logic
      if (flower.currentHeight > targetMax * 0.7) {
        // Only bloom if mouth is open or it's fully grown
        const bloomSpeed = mouthOpen ? 0.08 : 0.01;
        if (flower.bloomProgress < 1) {
          flower.bloomProgress += bloomSpeed;
        }
      }
    });

    // 5. Rendering
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Transparent Land
    // A slight gradient from the bottom
    const gradient = ctx.createLinearGradient(0, groundY, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(60, 40, 30, 0.4)');
    gradient.addColorStop(1, 'rgba(20, 10, 5, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, groundY, CANVAS_WIDTH, CANVAS_HEIGHT - groundY);
    
    // Ground Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(CANVAS_WIDTH, groundY);
    ctx.stroke();

    // Flowers
    flowersRef.current.forEach(flower => drawFlower(ctx, flower));

    // Seeds
    seedsRef.current.forEach(seed => {
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(seed.x, seed.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFF';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Visual Feedback for Hand
    if (results?.hands && results.hands.landmarks.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumb = landmarks[4];
      const index = landmarks[8];
      
      // We are drawing on a canvas that is CSS-scaled by -1.
      // So drawing at x * width is correct for a "mirror" feel if CSS is flipping it.
      
      if (pinching) {
          ctx.beginPath();
          ctx.arc((thumb.x + index.x)/2 * CANVAS_WIDTH, (thumb.y + index.y)/2 * CANVAS_HEIGHT, 15, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(236, 72, 153, 0.5)'; // Pink glow
          ctx.fill();
      }
    }

    requestRef.current = requestAnimationFrame(loop);
  };

  // --- Drawing Helpers ---
  const drawFlower = (ctx: CanvasRenderingContext2D, flower: Flower) => {
    ctx.save();
    ctx.translate(flower.x, flower.y);

    const h = flower.currentHeight;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      flower.stemControlPoints[1].x, -h * 0.33,
      flower.stemControlPoints[2].x, -h * 0.66,
      flower.stemControlPoints[3].x, -h
    );
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8BC34A'; // Light Green
    ctx.stroke();

    // Leaves
    if (h > 40) {
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      ctx.ellipse(8, -h * 0.3, 10 + h/20, 4, Math.PI / 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-8, -h * 0.5, 10 + h/20, 4, -Math.PI / 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bloom
    if (flower.bloomProgress > 0) {
      ctx.translate(flower.stemControlPoints[3].x, -h);
      const scale = flower.bloomProgress * (flower.maxHeight / 200); // Scale with height roughly
      ctx.scale(scale, scale);
      
      if (flower.species === FlowerSpecies.Daisy) {
        ctx.fillStyle = '#FFD700'; // Center
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flower.color;
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 12);
          ctx.ellipse(12, 0, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (flower.species === FlowerSpecies.Tulip) {
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(15, -15, 15, -40, 0, -50);
        ctx.bezierCurveTo(-15, -40, -15, -15, 0, 0);
        ctx.fill();
      } else if (flower.species === FlowerSpecies.Rose) {
         // Layered circles
         ctx.fillStyle = flower.color;
         ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = flower.secondaryColor;
         ctx.beginPath(); ctx.arc(3, -3, 10, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = flower.color;
         ctx.beginPath(); ctx.arc(-2, 2, 6, 0, Math.PI*2); ctx.fill();
      } else {
        // Generic
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flower.secondaryColor;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    const imageData = canvasRef.current.toDataURL('image/png');
    const result = await analyzeGarden(imageData, flowersRef.current.length);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex justify-center items-center font-sans">
      <div className="relative w-full h-full max-w-[1280px] max-h-[720px] bg-black rounded-none sm:rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
        
        {/* Webcam Layer */}
        <video 
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" 
          playsInline 
          muted
        />

        {/* AR Canvas Layer */}
        <canvas 
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full transform scale-x-[-1]"
        />

        {/* UI Controls */}
        <StatusPanel 
          isPinching={uiState.isPinching}
          isMouthOpen={uiState.isMouthOpen}
          isFist={uiState.isFist}
        />

        <WorldControls 
          biome={biome}
          setBiome={setBiome}
          species={species}
          setSpecies={setSpecies}
          growthHeight={growthHeight}
          setGrowthHeight={setGrowthHeight}
          cameras={cameras}
          selectedCamera={selectedCamera}
          setSelectedCamera={setSelectedCamera}
        />

        {/* Analyze Button */}
        <div className="absolute bottom-8 right-8 z-20">
          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="group flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-full font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MdAutoAwesome className={`text-xl text-pink-500 group-hover:rotate-12 transition-transform ${isAnalyzing ? "animate-spin" : ""}`} />
            <span className="tracking-wide text-sm">{isAnalyzing ? "ANALYZING..." : "ANALYZE GARDEN"}</span>
          </button>
        </div>

        {/* Analysis Modal */}
        {analysisResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-[fadeIn_0.3s_ease-out]">
             <div className="bg-[#121212] p-8 rounded-2xl max-w-lg text-center border border-pink-500/30 shadow-[0_0_50px_rgba(236,72,153,0.15)] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500"></div>
                <MdAutoAwesome className="text-5xl text-pink-500 mx-auto mb-6" />
                <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-widest">Garden Insight</h3>
                <p className="text-gray-300 font-light text-lg leading-relaxed mb-8">
                  "{analysisResult}"
                </p>
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="bg-white text-black px-8 py-3 rounded-full font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
                >
                  DISMISS
                </button>
             </div>
          </div>
        )}

        {/* Loading State */}
        {!loaded && (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
             <div className="w-16 h-16 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-6"></div>
             <p className="tracking-[0.3em] text-xs font-bold text-pink-500 animate-pulse">INITIALIZING NEURAL NETWORKS</p>
           </div>
        )}
      </div>
    </div>
  );
}

export default App;