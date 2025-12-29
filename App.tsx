
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed, Particle } from './types';
import { MdAutoAwesome } from "react-icons/md";

// Refined detection constants for high responsiveness
const PINCH_THRESHOLD_START = 0.042; 
const PINCH_THRESHOLD_END = 0.055;   
const DEPTH_THRESHOLD = 0.12;        
const STABILITY_REQUIRED_FRAMES = 1; 
const PLANTING_COOLDOWN_MS = 320;    

const FIST_CLEAR_SECONDS = 2.5;      
const FIST_GRACE_FRAMES = 10;

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  
  const seedsRef = useRef<Seed[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastResultsRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(performance.now());
  
  // Hand state tracking
  const pinchStableFramesRef = useRef(0);
  const lastSeedSpawnTimeRef = useRef(0);
  const isPinchingRef = useRef(false);
  
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistSecondsRef = useRef(0);
  const fistGraceRef = useRef(0);
  
  const biomeRef = useRef<BiomeTheme>(BiomeTheme.Sunset);
  const speciesRef = useRef<FlowerSpecies>(FlowerSpecies.Random);
  const growthHeightRef = useRef(1.0);

  const [loaded, setLoaded] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [uiState, setUiState] = useState({ 
    isPinching: false, 
    isMouthOpen: false, 
    isFist: false,
    fistTimeRemaining: FIST_CLEAR_SECONDS
  });
  
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
          video: { deviceId: selectedCamera, width: { ideal: 1280 }, height: { ideal: 720 } }
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

  const spawnExplosion = (x: number, y: number, color: string, count: number = 20) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, 
        life: 1.0,
        color,
        size: 2 + Math.random() * 4
      });
    }
  };

  const spawnSparks = (x: number, y: number, color: string = '#FFD700') => {
    for (let i = 0; i < 4; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 0.6 + Math.random() * 0.4,
        color,
        size: 1 + Math.random() * 2
      });
    }
  };

  const createFlower = (relX: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    let colorPool: string[];
    if (spec === FlowerSpecies.Random) {
      colorPool = Object.values(BIOME_COLORS).flat();
    } else {
      colorPool = BIOME_COLORS[theme];
    }

    const color = colorPool[Math.floor(Math.random() * colorPool.length)];
    const secondaryColor = colorPool[Math.floor(Math.random() * colorPool.length)];
    
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

  const checkIsFist = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const fingers = [
      { mcp: landmarks[5], tip: landmarks[8] },   // Index
      { mcp: landmarks[9], tip: landmarks[12] },  // Middle
      { mcp: landmarks[13], tip: landmarks[16] }, // Ring
      { mcp: landmarks[17], tip: landmarks[20] }  // Pinky
    ];

    let foldedCount = 0;
    fingers.forEach(f => {
      const distTipWrist = Math.hypot(f.tip.x - wrist.x, f.tip.y - wrist.y);
      const distMcpWrist = Math.hypot(f.mcp.x - wrist.x, f.mcp.y - wrist.y);
      if (distTipWrist < distMcpWrist * 1.1) { 
        foldedCount++;
      }
    });

    const tips = fingers.map(f => f.tip);
    const avgDist = tips.reduce((acc, t) => acc + Math.hypot(t.x - wrist.x, t.y - wrist.y), 0) / tips.length;

    return foldedCount >= 3 || avgDist < 0.18;
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
    const dtSeconds = (currentTime - lastTimeRef.current) / 1000;
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

    let currentlyPinching = false, mouthOpen = false, fistDetected = false;
    
    if (results?.hands?.landmarks?.length > 0) {
      results.hands.landmarks.forEach((landmarks: any[]) => {
        const thumb = landmarks[4], indexFinger = landmarks[8];
        const dist2D = Math.hypot(thumb.x - indexFinger.x, thumb.y - indexFinger.y);
        const distZ = Math.abs(thumb.z - indexFinger.z);
        const threshold = isPinchingRef.current ? PINCH_THRESHOLD_END : PINCH_THRESHOLD_START;
        
        if (dist2D < threshold && distZ < DEPTH_THRESHOLD) {
          currentlyPinching = true;
          const now = Date.now();
          if (now - lastSeedSpawnTimeRef.current > PLANTING_COOLDOWN_MS) {
            const pos = mapCoordinates((thumb.x + indexFinger.x) / 2, (thumb.y + indexFinger.y) / 2, canvas);
            seedsRef.current.push({
              id: 'gold-' + Math.random().toString(36).substring(2, 7) + now,
              x: pos.x,
              y: pos.y,
              vy: 5 + Math.random() * 2, 
              color: '#FFD700'
            });
            spawnSparks(pos.x, pos.y);
            lastSeedSpawnTimeRef.current = now;
          }
        }
        if (checkIsFist(landmarks)) fistDetected = true;
      });
      if (currentlyPinching) pinchStableFramesRef.current++;
      else pinchStableFramesRef.current = 0;
    } else {
      pinchStableFramesRef.current = 0;
      isPinchingRef.current = false;
    }

    if (results?.faces?.faceBlendshapes?.[0]) {
      const jaw = results.faces.faceBlendshapes[0].categories.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jaw > 0.25) mouthOpen = true;
    }

    isPinchingRef.current = currentlyPinching;
    isMouthOpenRef.current = mouthOpen;

    if (fistDetected) {
      fistGraceRef.current = FIST_GRACE_FRAMES;
      isFistRef.current = true;
      fistSecondsRef.current += dtSeconds;
      if (fistSecondsRef.current >= FIST_CLEAR_SECONDS) {
        flowersRef.current.forEach(f => {
          const fx = f.relX * width;
          const fy = groundY - (f.currentHeight * growthHeightRef.current);
          spawnExplosion(fx, fy, f.color, 12);
        });
        flowersRef.current = [];
        seedsRef.current = [];
        fistSecondsRef.current = 0;
      }
    } else {
      if (fistGraceRef.current > 0) fistGraceRef.current--;
      else { isFistRef.current = false; fistSecondsRef.current = 0; }
    }

    // Physics
    seedsRef.current.forEach(s => { 
      s.y += s.vy * dt; 
      s.vy += 0.45 * dt; 
      // Slight air wobble
      s.x += Math.sin(s.y * 0.05) * 0.8 * dt;
    });

    const landing = seedsRef.current.filter(s => s.y >= groundY);
    landing.forEach(s => {
      const relX = s.x / width;
      spawnSparks(s.x, groundY, '#FDB931');
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

    particlesRef.current.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.2 * dt; 
      p.life -= 0.02 * dt;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    ctx.clearRect(0, 0, width, height);

    flowersRef.current.forEach(f => {
      const x = f.relX * width;
      const displayHeight = f.currentHeight * growthHeightRef.current;
      drawFlower(ctx, f, x, groundY, displayHeight);
    });
    
    seedsRef.current.forEach(s => drawSeed(ctx, s.x, s.y));

    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    const soilGrad = ctx.createLinearGradient(0, groundY, 0, height);
    soilGrad.addColorStop(0, 'rgba(40, 20, 5, 0.4)');
    soilGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, groundY, width, height - groundY);

    const currentFistRemaining = Math.max(0, FIST_CLEAR_SECONDS - fistSecondsRef.current);

    if (uiState.isPinching !== currentlyPinching || uiState.isMouthOpen !== mouthOpen || uiState.isFist !== isFistRef.current || Math.abs(uiState.fistTimeRemaining - currentFistRemaining) > 0.1) {
      setUiState({ 
        isPinching: currentlyPinching, 
        isMouthOpen: mouthOpen, 
        isFist: isFistRef.current,
        fistTimeRemaining: currentFistRemaining
      });
    }
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const drawSeed = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.save();
    
    // Outer Glow
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';

    // Main Golden Bean Body (Radial Gradient for 3D look)
    const gradient = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    gradient.addColorStop(0, '#FFFACD'); // Center highlight
    gradient.addColorStop(0.4, '#FFD700'); // Pure gold
    gradient.addColorStop(1, '#B8860B'); // Deep gold edge

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Slightly egg-shaped like a bean
    ctx.ellipse(x, y, 6, 8, Math.sin(Date.now() * 0.01) * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Specular Highlight (Small white dot on top-left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x - 2.5, y - 3, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, f: Flower, x: number, y: number, displayHeight: number) => {
    if (f.currentHeight === 0) {
      drawSeed(ctx, x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y);

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

    if (h > 60) {
      const leafCount = Math.floor(h / 90);
      for (let i = 0; i < leafCount; i++) {
        const baseT = (i + 0.5) / (leafCount + 0.5);
        const t = Math.min(0.85, Math.max(0.15, baseT + (Math.sin(f.relX * 5 + i) * 0.1)));

        const px = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * tipX;
        const py = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * tipY;
        
        const isRight = (i + Math.floor(f.relX * 10)) % 2 === 0;
        const sway = Math.sin(i * 1.5 + f.relX) * 0.2;
        
        ctx.save();
        ctx.translate(px, py);
        const angle = isRight ? (0.7 + sway) : (-0.7 + sway);
        ctx.rotate(angle);
        const scale = 0.8 + Math.abs(Math.sin(f.relX * 12 + i) * 0.5);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        const xOffset = isRight ? 8 : -8;
        ctx.ellipse(xOffset, 0, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

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
    const drawPetal = (w: number, h: number, c: string, stroke: boolean = true) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-w * 0.8, -h * 0.2, -w, -h * 0.8, 0, -h);
      ctx.bezierCurveTo(w, -h * 0.8, w * 0.8, -h * 0.2, 0, 0);
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    };

    switch (species) {
      case FlowerSpecies.Daisy:
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.rotate((Math.PI * 2) / 12);
          ctx.ellipse(18, 0, 15, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#FFD600';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        break;

      case FlowerSpecies.Rose:
        const roseRotation = f.relX * Math.PI; 
        for (let i = 0; i < 6; i++) {
          ctx.save();
          ctx.rotate(roseRotation + (i * Math.PI * 2 / 6));
          drawPetal(18, 24, color);
          ctx.restore();
        }
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate(roseRotation + 0.5 + (i * Math.PI * 2 / 5));
          drawPetal(14, 20, secondaryColor);
          ctx.restore();
        }
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate(roseRotation + 1.2 + (i * Math.PI * 2 / 3));
          drawPetal(8, 14, color);
          ctx.restore();
        }
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.arc(0, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case FlowerSpecies.Tulip:
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(-8, -10, 14, 22, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, -10, 14, 22, 0.2, 0, Math.PI * 2);
        ctx.fill();
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
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate((Math.PI * 2 / 3) * i);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-25, -20, -20, -35, 0, -35);
          ctx.bezierCurveTo(20, -35, 25, -20, 0, 0);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < 8; j++) {
          const angle = (Math.PI * 2 / 8) * j;
          const dist = 5;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      default:
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

  const handleApplySpeciesToAll = useCallback(() => {
    const currentSpecies = speciesRef.current;
    const speciesOptions = Object.values(FlowerSpecies).filter(s => s !== FlowerSpecies.Random);
    
    flowersRef.current = flowersRef.current.map(f => ({
      ...f,
      species: currentSpecies === FlowerSpecies.Random 
        ? speciesOptions[Math.floor(Math.random() * speciesOptions.length)]
        : currentSpecies
    }));
  }, []);

  const handleApplyBiomeToAll = useCallback(() => {
    const currentBiome = biomeRef.current;
    const colorPool = BIOME_COLORS[currentBiome];
    
    flowersRef.current = flowersRef.current.map(f => ({
      ...f,
      color: colorPool[Math.floor(Math.random() * colorPool.length)],
      secondaryColor: colorPool[Math.floor(Math.random() * colorPool.length)]
    }));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    setAnalysisResult(await analyzeGarden(canvasRef.current.toDataURL('image/png'), flowersRef.current.length));
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none font-sans text-white">
      <div className="relative w-full h-full">
        <video 
          ref={videoRef} 
          style={{ transform: `scaleX(-1)` }}
          className="absolute inset-0 w-full h-full object-fill opacity-70" 
          playsInline muted 
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform scale-x-[-1] pointer-events-none" />

        <StatusPanel {...uiState} />
        <WorldControls 
          biome={biome} setBiome={setBiomeState}
          onApplyBiomeToAll={handleApplyBiomeToAll}
          species={species} setSpecies={setSpeciesState}
          onApplySpeciesToAll={handleApplySpeciesToAll}
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
