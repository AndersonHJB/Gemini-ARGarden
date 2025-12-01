import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed } from './types';
import { clsx } from 'clsx';
import { MdAutoAwesome } from "react-icons/md";

// Constants
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const PINCH_THRESHOLD = 0.05;
const MOUTH_OPEN_THRESHOLD = 0.05; // Diff between lips
const GRAVITY = 8;
const GROUND_LEVEL_Y = 0.9; // Percentage of screen height

function App() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  // State
  const [loaded, setLoaded] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  
  // Game State
  const seedsRef = useRef<Seed[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const isPinchingRef = useRef(false);
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  
  // Interaction State for UI
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
      { x: (Math.random() - 0.5) * 40, y: -50 },
      { x: (Math.random() - 0.5) * 40, y: -100 },
      { x: 0, y: -150 } // Top (relative)
    ];

    return {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      maxHeight: 150 + Math.random() * 200,
      currentHeight: 10,
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
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      const wrist = landmarks[0];

      // Pinch Detection (Thumb + Index)
      const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      if (pinchDist < PINCH_THRESHOLD) {
        pinching = true;
        
        // Spawn seed if not previously pinching (trigger once)
        if (!isPinchingRef.current) {
          const seedX = (thumbTip.x + indexTip.x) / 2 * CANVAS_WIDTH;
          const seedY = (thumbTip.y + indexTip.y) / 2 * CANVAS_HEIGHT;
          
          seedsRef.current.push({
            id: Date.now().toString(),
            x: seedX,
            y: seedY,
            vy: 2, // Initial velocity
            color: '#FFFFFF'
          });
        }
      }

      // Fist Detection (Simplified: All fingertips close to wrist/palm center)
      // Checking if fingertips are lower (higher Y) than usual extension relative to wrist
      // Or simply distance from wrist < threshold
      const tips = [indexTip, middleTip, ringTip, pinkyTip];
      const avgDistToWrist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / 4;
      
      if (avgDistToWrist < 0.25) { // Threshold for "curled" hand
        fist = true;
        if (!isFistRef.current) {
          // Clear Garden
          flowersRef.current = [];
          seedsRef.current = [];
        }
      }
    }

    if (results?.faces && results.faces.faceBlendshapes.length > 0) {
      // Use blendshapes for more accurate mouth open detection if available
      const blendshapes = results.faces.faceBlendshapes[0].categories;
      const jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen')?.score || 0;
      
      if (jawOpen > 0.2) {
        mouthOpen = true;
      }
    }

    // Update Refs
    isPinchingRef.current = pinching;
    isMouthOpenRef.current = mouthOpen;
    isFistRef.current = fist;

    // Throttled UI update (don't update React state every frame)
    if (Math.random() < 0.1) {
        setUiState({ isPinching: pinching, isMouthOpen: mouthOpen, isFist: fist });
    }

    // 3. Physics & Growth Update
    // Seeds
    seedsRef.current.forEach(seed => {
      seed.y += seed.vy;
      seed.vy += 0.5; // Gravity acceleration
    });

    // Remove seeds that hit ground and spawn flowers
    const groundY = CANVAS_HEIGHT * GROUND_LEVEL_Y;
    
    // Filter seeds that are still falling
    const fallingSeeds = seedsRef.current.filter(s => s.y < groundY);
    
    // Seeds that hit ground
    const plantingSeeds = seedsRef.current.filter(s => s.y >= groundY);
    plantingSeeds.forEach(seed => {
      flowersRef.current.push(createFlower(seed.x, groundY, biome, species));
    });
    
    seedsRef.current = fallingSeeds;

    // Grow Flowers
    flowersRef.current.forEach(flower => {
      const targetMax = flower.maxHeight * growthHeight;
      
      // Mouth open accelerates growth significantly
      const growthRate = mouthOpen ? 3.0 : 0.1; 
      
      if (flower.currentHeight < targetMax) {
        flower.currentHeight += growthRate;
      } else if (flower.currentHeight > targetMax) {
        flower.currentHeight -= 1.0; // Shrink if slider moved down
      }

      // Bloom only if near full height
      if (flower.currentHeight > targetMax * 0.8) {
        if (flower.bloomProgress < 1) {
          flower.bloomProgress += (mouthOpen ? 0.05 : 0.005);
        }
      }
    });


    // 4. Rendering
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Soil
    const gradient = ctx.createLinearGradient(0, groundY, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(80, 50, 30, 0.8)');
    gradient.addColorStop(1, 'rgba(40, 20, 10, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, groundY, CANVAS_WIDTH, CANVAS_HEIGHT - groundY);
    
    // Draw soil top border
    ctx.strokeStyle = '#8B5A2B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(CANVAS_WIDTH, groundY);
    ctx.stroke();

    // Draw Flowers
    flowersRef.current.forEach(flower => {
      drawFlower(ctx, flower);
    });

    // Draw Falling Seeds
    ctx.fillStyle = '#FFF';
    seedsRef.current.forEach(seed => {
      ctx.beginPath();
      ctx.arc(seed.x, seed.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // Glow trail
      ctx.shadowBlur = 10;
      ctx.shadowColor = biome === BiomeTheme.Sunset ? '#FF0' : '#FFF';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Landmarks (Visual Feedback)
    if (results?.hands && results.hands.landmarks.length > 0) {
      const landmarks = results.hands.landmarks[0];
      const thumb = landmarks[4];
      const index = landmarks[8];
      
      // Draw connection line
      ctx.beginPath();
      ctx.moveTo(thumb.x * CANVAS_WIDTH, thumb.y * CANVAS_HEIGHT);
      ctx.lineTo(index.x * CANVAS_WIDTH, index.y * CANVAS_HEIGHT);
      ctx.strokeStyle = pinching ? 'rgba(255, 105, 180, 0.8)' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = pinching ? 4 : 2;
      ctx.stroke();
      
      // Draw points
      ctx.fillStyle = pinching ? '#FF69B4' : '#FFF';
      [thumb, index].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * CANVAS_WIDTH, p.y * CANVAS_HEIGHT, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    requestRef.current = requestAnimationFrame(loop);
  };

  // --- Drawing Helpers ---
  const drawFlower = (ctx: CanvasRenderingContext2D, flower: Flower) => {
    ctx.save();
    ctx.translate(flower.x, flower.y);

    // Draw Stem
    const h = flower.currentHeight;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Bezier curve for stem
    ctx.bezierCurveTo(
      flower.stemControlPoints[1].x, -h * 0.3,
      flower.stemControlPoints[2].x, -h * 0.7,
      flower.stemControlPoints[3].x, -h
    );
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4CAF50'; // Green stem
    ctx.stroke();

    // Draw Leaves (simple)
    if (h > 50) {
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      ctx.ellipse(10, -h * 0.4, 15, 5, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-10, -h * 0.6, 15, 5, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Bloom
    if (flower.bloomProgress > 0) {
      ctx.translate(flower.stemControlPoints[3].x, -h);
      const scale = flower.bloomProgress;
      ctx.scale(scale, scale);
      
      // Flower Type Drawing
      if (flower.species === FlowerSpecies.Daisy) {
        // Center
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        // Petals
        ctx.fillStyle = flower.color;
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 12);
          ctx.ellipse(15, 0, 15, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (flower.species === FlowerSpecies.Tulip) {
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(20, -20, 20, -50, 0, -60);
        ctx.bezierCurveTo(-20, -50, -20, -20, 0, 0);
        ctx.fill();
      } else if (flower.species === FlowerSpecies.Rose) {
        ctx.fillStyle = flower.color;
        // Spiral approximation
        for(let i=0; i<5; i++) {
           ctx.beginPath();
           ctx.arc(0, 0, 10 + i*5, 0 + i, Math.PI + i);
           ctx.fillStyle = i % 2 === 0 ? flower.color : flower.secondaryColor;
           ctx.fill();
        }
      } else {
        // Generic/Poppy/Lily (Simple Circles)
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.arc(0, -10, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flower.secondaryColor;
        ctx.beginPath();
        ctx.arc(0, -10, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  // --- Interaction Handlers ---
  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    
    // Capture the current visual state
    const imageData = canvasRef.current.toDataURL('image/png');
    const flowerCount = flowersRef.current.length;
    
    const result = await analyzeGarden(imageData, flowerCount);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex justify-center items-center">
      {/* Container to maintain aspect ratio if needed, or full screen */}
      <div className="relative w-[1280px] h-[720px] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
        
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
        <div className="absolute bottom-6 right-6 z-20">
          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white px-6 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <MdAutoAwesome className={isAnalyzing ? "animate-spin" : ""} />
            {isAnalyzing ? "Analysing Garden..." : "Analyze Garden"}
          </button>
        </div>

        {/* Analysis Modal */}
        {analysisResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-30 animate-in fade-in duration-300">
             <div className="bg-[#1a1a1a] p-8 rounded-2xl max-w-lg text-center border border-white/10 shadow-2xl">
                <MdAutoAwesome className="text-4xl text-pink-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-4">Garden Analysis</h3>
                <p className="text-gray-300 italic text-lg leading-relaxed mb-6">
                  "{analysisResult}"
                </p>
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-gray-200"
                >
                  Close
                </button>
             </div>
          </div>
        )}

        {/* Loading State */}
        {!loaded && (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
             <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="tracking-widest font-light">INITIALIZING VISION SYSTEMS...</p>
           </div>
        )}
      </div>
    </div>
  );
}

export default App;