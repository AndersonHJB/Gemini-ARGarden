
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden, getRandomMessage } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed, Particle, BackgroundMode, ARTISTIC_BG } from './types';
import { MdAutoAwesome, MdDownload, MdClose } from "react-icons/md";

// Refined detection constants for high responsiveness
const PINCH_THRESHOLD_START = 0.045; 
const PINCH_THRESHOLD_END = 0.060;   
const DEPTH_THRESHOLD = 0.15;        
const PLANTING_COOLDOWN_MS = 250;    

const FIST_CLEAR_SECONDS = 2.0;      
const FIST_GRACE_FRAMES = 12;

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
  const lastSeedSpawnTimeRef = useRef(0);
  const isPinchingRef = useRef(false);
  
  const isMouthOpenRef = useRef(false);
  const isFistRef = useRef(false);
  const fistSecondsRef = useRef(0);
  const fistGraceRef = useRef(0);
  
  const biomeRef = useRef<BiomeTheme>(BiomeTheme.Sunset);
  const speciesRef = useRef<FlowerSpecies>(FlowerSpecies.Random);
  const growthHeightRef = useRef(1.0);
  const growthSpeedRef = useRef(1.0);
  const petalScaleRef = useRef(1.0);
  const bgModeRef = useRef<BackgroundMode>(BackgroundMode.Camera);

  const [loaded, setLoaded] = useState(false);
  const [lang, setLang] = useState<'CN' | 'EN'>('CN');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  const [growthSpeed, setGrowthSpeedState] = useState(1.0);
  const [petalScale, setPetalScaleState] = useState(1.0);
  const [bgMode, setBgMode] = useState<BackgroundMode>(BackgroundMode.Camera);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => { biomeRef.current = biome; }, [biome]);
  useEffect(() => { speciesRef.current = species; }, [species]);
  useEffect(() => { growthHeightRef.current = growthHeight; }, [growthHeight]);
  useEffect(() => { growthSpeedRef.current = growthSpeed; }, [growthSpeed]);
  useEffect(() => { petalScaleRef.current = petalScale; }, [petalScale]);
  useEffect(() => { bgModeRef.current = bgMode; }, [bgMode]);

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
    for (let i = 0; i < 6; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 0.6 + Math.random() * 0.4,
        color,
        size: 1.5 + Math.random() * 2.5
      });
    }
  };

  const createFlower = (relX: number, theme: BiomeTheme, spec: FlowerSpecies): Flower => {
    let colorPool = BIOME_COLORS[theme];
    const color = colorPool[Math.floor(Math.random() * colorPool.length)];
    let secondaryColor = colorPool[(colorPool.indexOf(color) + 1) % colorPool.length];
    
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
      if (distTipWrist < distMcpWrist * 1.1) foldedCount++;
    });
    return foldedCount >= 3;
  };

  const drawArtisticBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, theme: BiomeTheme) => {
    const config = ARTISTIC_BG[theme];
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    config.sky.forEach((color, i) => skyGrad.addColorStop(i / (config.sky.length - 1), color));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = config.accent;
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 40;
    ctx.shadowColor = config.accent;
    ctx.beginPath();
    ctx.arc(width * 0.75, height * 0.25, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = config.ground;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.85);
    ctx.lineTo(width * 0.4, height * 0.75);
    ctx.lineTo(width * 0.7, height * 0.88);
    ctx.lineTo(width, height * 0.82);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  };

  const handleClearGarden = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const groundY = canvas.height - 20;
    flowersRef.current.forEach(f => {
      const fx = f.relX * width;
      const fy = groundY - (f.currentHeight * growthHeightRef.current);
      spawnExplosion(fx, fy, f.color, 15);
    });
    flowersRef.current = [];
    seedsRef.current = [];
  }, []);

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
              id: 'seed-' + Math.random().toString(36).substring(2, 7) + now,
              x: pos.x,
              y: pos.y,
              vy: 6 + Math.random() * 3, 
              color: '#FFD700'
            });
            spawnSparks(pos.x, pos.y, '#FFFACD');
            lastSeedSpawnTimeRef.current = now;
          }
        }
        if (checkIsFist(landmarks)) fistDetected = true;
      });
    } else {
      isPinchingRef.current = false;
    }

    if (results?.faces?.faceBlendshapes?.[0]) {
      const jaw = results.faces.faceBlendshapes[0].categories.find(b => b.categoryName === 'jawOpen')?.score || 0;
      if (jaw > 0.3) mouthOpen = true;
    }

    isPinchingRef.current = currentlyPinching;
    isMouthOpenRef.current = mouthOpen;

    if (fistDetected) {
      fistGraceRef.current = FIST_GRACE_FRAMES;
      isFistRef.current = true;
      fistSecondsRef.current += dtSeconds;
      if (fistSecondsRef.current >= FIST_CLEAR_SECONDS) {
        handleClearGarden();
        fistSecondsRef.current = 0;
      }
    } else {
      if (fistGraceRef.current > 0) fistGraceRef.current--;
      else { isFistRef.current = false; fistSecondsRef.current = 0; }
    }

    // Physics
    seedsRef.current.forEach(s => { 
      s.y += s.vy * dt; 
      s.vy += 0.5 * dt; 
      s.x += Math.sin(s.y * 0.04) * 1.2 * dt;
    });

    const landing = seedsRef.current.filter(s => s.y >= groundY);
    landing.forEach(s => {
      const relX = s.x / width;
      spawnSparks(s.x, groundY, '#FDB931');
      flowersRef.current.push(createFlower(relX, biomeRef.current, speciesRef.current));
    });
    seedsRef.current = seedsRef.current.filter(s => s.y < groundY);

    flowersRef.current.forEach(f => {
      const rate = (mouthOpen ? (6.0 * growthSpeedRef.current) : 0) * dt; 
      if (f.currentHeight < f.maxHeight) {
        f.currentHeight += rate;
        if (f.currentHeight > f.maxHeight) f.currentHeight = f.maxHeight;
      } 
      if (f.currentHeight > f.maxHeight * 0.3 && f.bloomProgress < 1) {
        f.bloomProgress += (mouthOpen ? (0.09 * growthSpeedRef.current) : 0.01) * dt;
      }
    });

    particlesRef.current.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.25 * dt; 
      p.life -= 0.025 * dt;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    ctx.clearRect(0, 0, width, height);

    if (bgModeRef.current === BackgroundMode.Artistic) {
      drawArtisticBackground(ctx, width, height, biomeRef.current);
    }

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
    soilGrad.addColorStop(0, 'rgba(30, 15, 5, 0.2)');
    soilGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
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
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    const gradient = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    gradient.addColorStop(0, '#FFFACD'); 
    gradient.addColorStop(0.5, '#FFD700'); 
    gradient.addColorStop(1, '#B8860B'); 
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 8, Math.sin(Date.now() * 0.012) * 0.3, 0, Math.PI * 2);
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
    moundGrad.addColorStop(0, 'rgba(62, 39, 35, 0.8)');
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
    ctx.lineWidth = 4 + (f.currentHeight / 180);
    ctx.strokeStyle = '#2E7D32';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (h > 50) {
      const leafCount = Math.floor(h / 80);
      for (let i = 0; i < leafCount; i++) {
        const t = Math.min(0.85, Math.max(0.15, (i + 0.5) / (leafCount + 0.5)));
        const px = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * tipX;
        const py = (1-t)**3 * 0 + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * tipY;
        const isRight = (i + Math.floor(f.relX * 10)) % 2 === 0;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(isRight ? 0.7 : -0.7);
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.ellipse(isRight ? 8 : -8, 0, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#1B5E20';
        ctx.beginPath();
        ctx.ellipse(isRight ? 8 : -8, 0, 12, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    
    if (f.bloomProgress > 0) {
      ctx.translate(tipX, tipY);
      const scale = (f.maxHeight / 220) * growthHeightRef.current * petalScaleRef.current * Math.min(1.0, f.bloomProgress);
      ctx.scale(Math.max(0.01, scale), Math.max(0.01, scale));
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      renderFlowerHead(ctx, f);
    }
    ctx.restore();
  };

  const renderFlowerHead = (ctx: CanvasRenderingContext2D, f: Flower) => {
    const { species, color, secondaryColor } = f;

    switch (species) {
      case FlowerSpecies.Daisy:
        ctx.save();
        const petalCount = 24;
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < petalCount; i++) {
          ctx.rotate((Math.PI * 2) / petalCount);
          ctx.beginPath();
          ctx.ellipse(22, 1, 18, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < petalCount; i++) {
          ctx.rotate((Math.PI * 2) / petalCount);
          ctx.beginPath();
          ctx.ellipse(20, 0, 18, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const centerGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 12);
        centerGrad.addColorStop(0, '#FFF176');
        centerGrad.addColorStop(0.7, '#FBC02D');
        centerGrad.addColorStop(1, '#F57F17');
        ctx.fillStyle = centerGrad;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;

      case FlowerSpecies.Rose:
        const roseLayers = 3;
        for (let l = 0; l < roseLayers; l++) {
          const count = 5 + l;
          const radius = 25 - l * 7;
          const layerColor = l % 2 === 0 ? color : secondaryColor;
          ctx.save();
          ctx.rotate(l * 0.5);
          for (let i = 0; i < count; i++) {
            ctx.rotate((Math.PI * 2) / count);
            ctx.fillStyle = layerColor;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(radius, -radius, radius * 1.5, 0);
            ctx.quadraticCurveTo(radius, radius, 0, 0);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.fillStyle = secondaryColor;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        break;

      case FlowerSpecies.Tulip:
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.ellipse(0, -18, 12, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.save();
        ctx.rotate(-0.2);
        ctx.beginPath(); ctx.ellipse(-8, -15, 12, 24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.rotate(0.2);
        ctx.beginPath(); ctx.ellipse(8, -15, 12, 24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;

      case FlowerSpecies.Lily:
        const lilyCount = 6;
        ctx.fillStyle = color;
        for (let i = 0; i < lilyCount; i++) {
          ctx.rotate((Math.PI * 2) / lilyCount);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(20, -12, 40, 0);
          ctx.quadraticCurveTo(20, 12, 0, 0);
          ctx.fill();
          ctx.fillStyle = secondaryColor;
          ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.ellipse(15, 0, 10, 1.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = color;
        }
        break;

      case FlowerSpecies.Poppy:
        ctx.save();
        const poppyPetals = 4;
        for (let i = 0; i < poppyPetals; i++) {
          ctx.rotate((Math.PI * 2) / poppyPetals);
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.ellipse(18, 0, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;

      default:
        for (let i = 0; i < 8; i++) {
          ctx.rotate((Math.PI * 2) / 8);
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.ellipse(16, 0, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
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
      secondaryColor: colorPool[(colorPool.indexOf(f.color) + 1) % colorPool.length]
    }));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    const result = await analyzeGarden(canvasRef.current.toDataURL('image/png'), flowersRef.current.length, lang);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  }, [lang]);

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tctx = tempCanvas.getContext('2d');
    if (!tctx) return;

    if (bgMode === BackgroundMode.Camera) {
      tctx.save(); 
      tctx.scale(-1, 1); 
      tctx.drawImage(video, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height); 
      tctx.restore();
    } else {
      drawArtisticBackground(tctx, tempCanvas.width, tempCanvas.height, biome);
    }

    tctx.save(); 
    tctx.scale(-1, 1); 
    tctx.drawImage(canvas, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height); 
    tctx.restore();

    // Add Reflection Overlay
    const reflection = getRandomMessage(lang);
    tctx.save();
    
    // Bottom Gradient Overlay for text readability
    const gradHeight = 160;
    const textGrad = tctx.createLinearGradient(0, tempCanvas.height - gradHeight, 0, tempCanvas.height);
    textGrad.addColorStop(0, 'transparent');
    textGrad.addColorStop(1, 'rgba(0,0,0,0.8)');
    tctx.fillStyle = textGrad;
    tctx.fillRect(0, tempCanvas.height - gradHeight, tempCanvas.width, gradHeight);

    // Text Rendering
    tctx.fillStyle = 'white';
    tctx.shadowColor = 'black';
    tctx.shadowBlur = 10;
    tctx.textAlign = 'center';
    tctx.font = 'italic 600 24px "Inter", sans-serif';
    
    // Wrapping text if needed
    const maxWidth = tempCanvas.width * 0.8;
    const words = reflection.split(' ');
    let line = '';
    let y = tempCanvas.height - 70;
    
    // Simple line wrap for reflections
    if (lang === 'CN') {
       tctx.fillText(`"${reflection}"`, tempCanvas.width / 2, y);
    } else {
       tctx.fillText(`"${reflection}"`, tempCanvas.width / 2, y);
    }

    // App Branding
    tctx.globalAlpha = 0.5;
    tctx.font = 'black 12px "Inter", sans-serif';
    tctx.textAlign = 'right';
    tctx.fillText('GEMINI AR GARDEN', tempCanvas.width - 40, tempCanvas.height - 30);
    
    tctx.restore();

    setCapturedImage(tempCanvas.toDataURL('image/png'));
  }, [bgMode, biome, lang]);

  const downloadCapturedImage = () => {
    if (!capturedImage) return;
    const link = document.createElement('a');
    link.href = capturedImage;
    link.download = `ar-garden-${Date.now()}.png`;
    link.click();
  };

  const reflectionsBtnText = lang === 'CN' ? "花园感悟" : "GARDEN REFLECTIONS";
  const reflectionsLoadingText = lang === 'CN' ? "正在感悟生命..." : "CONSULTING SPIRITS...";
  const reflectionsCloseText = lang === 'CN' ? "关闭感悟" : "CLOSE VISION";
  const capturedMemoryText = lang === 'CN' ? "记忆已定格" : "MEMORY CAPTURED";
  const downloadBtnText = lang === 'CN' ? "下载图片" : "DOWNLOAD";
  const exitBtnText = lang === 'CN' ? "返回" : "EXIT";

  return (
    <div 
      className="fixed inset-0 bg-black overflow-hidden select-none font-sans text-white"
      onClick={() => setIsMenuOpen(false)}
    >
      <div className="relative w-full h-full">
        <video 
          ref={videoRef} 
          style={{ transform: `scaleX(-1)`, visibility: bgMode === BackgroundMode.Camera ? 'visible' : 'hidden' }}
          className="absolute inset-0 w-full h-full object-fill opacity-100" 
          playsInline muted 
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform scale-x-[-1] pointer-events-none" />

        <StatusPanel {...uiState} lang={lang} />
        <WorldControls 
          isOpen={isMenuOpen} setIsOpen={setIsMenuOpen}
          biome={biome} setBiome={setBiomeState}
          onApplyBiomeToAll={handleApplyBiomeToAll}
          species={species} setSpecies={setSpeciesState}
          onApplySpeciesToAll={handleApplySpeciesToAll}
          growthHeight={growthHeight} setGrowthHeight={setGrowthHeightState}
          growthSpeed={growthSpeed} setGrowthSpeed={setGrowthSpeedState}
          petalScale={petalScale} setPetalScale={setPetalScaleState}
          cameras={cameras} selectedCamera={selectedCamera} setSelectedCamera={setSelectedCamera}
          bgMode={bgMode} setBgMode={setBgMode}
          onCapture={handleCapture}
          onClearGarden={handleClearGarden}
          lang={lang} setLang={setLang}
        />

        <div className="absolute bottom-8 right-8 z-20 w-72">
          <button onClick={(e) => { e.stopPropagation(); handleAnalyze(); }} disabled={isAnalyzing}
            className="w-full group flex items-center justify-center gap-4 bg-white/10 hover:bg-white/20 backdrop-blur-2xl border border-white/20 text-white py-4 rounded-2xl font-bold shadow-2xl transition-all active:scale-95 disabled:opacity-50">
            <MdAutoAwesome className={`text-xl text-pink-400 ${isAnalyzing ? "animate-spin" : "group-hover:rotate-12"}`} />
            <span className="tracking-[0.2em] text-[10px] uppercase font-black">{isAnalyzing ? reflectionsLoadingText : reflectionsBtnText}</span>
          </button>
        </div>

        {analysisResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-40 p-6" onClick={(e) => e.stopPropagation()}>
             <div className="bg-[#0f0f0f] p-8 sm:p-12 rounded-[2rem] max-w-xl text-center border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500"></div>
                <p className="text-white text-xl sm:text-2xl font-light leading-relaxed mb-10 italic">"{analysisResult}"</p>
                <button onClick={() => setAnalysisResult(null)} className="px-12 py-4 bg-white text-black rounded-2xl font-black text-[10px] tracking-widest uppercase hover:bg-pink-500 hover:text-white transition-all">{reflectionsCloseText}</button>
             </div>
          </div>
        )}

        {capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-2xl z-50 p-4" onClick={(e) => e.stopPropagation()}>
             <div className="bg-white/5 p-4 rounded-[2.5rem] max-w-2xl w-full border border-white/10 shadow-2xl flex flex-col items-center">
                <div className="flex justify-between w-full mb-4 px-4">
                   <h3 className="text-[10px] font-black tracking-[0.3em] text-pink-400 uppercase">{capturedMemoryText}</h3>
                   <button onClick={() => setCapturedImage(null)} className="text-white hover:text-pink-400 transition-colors">
                      <MdClose className="text-2xl" />
                   </button>
                </div>
                <div className="relative w-full rounded-[2rem] overflow-hidden border border-white/10 mb-6 bg-black">
                   <img src={capturedImage} alt="Captured Garden" className="w-full h-auto block" />
                </div>
                <div className="flex gap-4 w-full">
                  <button onClick={downloadCapturedImage} className="flex-1 flex items-center justify-center gap-3 py-5 bg-white text-black rounded-2xl font-black text-[10px] tracking-widest uppercase hover:bg-pink-500 hover:text-white transition-all">
                    <MdDownload className="text-xl" /> {downloadBtnText}
                  </button>
                  <button onClick={() => setCapturedImage(null)} className="px-8 py-5 bg-white/5 text-white border border-white/10 rounded-2xl font-black text-[10px] tracking-widest uppercase hover:bg-white/10 transition-all">
                    {exitBtnText}
                  </button>
                </div>
             </div>
          </div>
        )}

        {!loaded && (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
             <div className="w-16 h-16 border-2 border-white/5 border-t-pink-500 rounded-full animate-spin mb-6"></div>
             <p className="tracking-[0.8em] text-[10px] font-black text-white/40 uppercase">{lang === 'CN' ? '唤醒自然中' : 'Awakening Nature'}</p>
           </div>
        )}
      </div>
    </div>
  );
}

export default App;
