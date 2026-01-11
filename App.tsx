import React, { useEffect, useRef, useState, useCallback } from 'react';
import { visionService } from './services/visionService';
import { analyzeGarden, getRandomMessage } from './services/geminiService';
import { StatusPanel, WorldControls } from './components/Controls';
import { BiomeTheme, BIOME_COLORS, Flower, FlowerSpecies, Point, Seed, Particle, BackgroundMode, ARTISTIC_BG } from './types';
import {MdAutoAwesome, MdDownload, MdClose, MdCheck} from "react-icons/md";

// Refined detection constants for high responsiveness
const PINCH_THRESHOLD_START = 0.045; 
const PINCH_THRESHOLD_END = 0.060;   
const DEPTH_THRESHOLD = 0.15;        
const PLANTING_COOLDOWN_MS = 250;    

const FIST_CLEAR_SECONDS = 2.0;      
const FIST_GRACE_FRAMES = 12;
const CAMERA_STORAGE_KEY = 'gemini_ar_garden_camera_id';
const GARDEN_DATA_KEY = 'gemini_ar_garden_flowers_data';

// Frame Styles Configuration - "ONE" Style
const FRAME_STYLES = [
  { id: 'classic', name: '经典', bg: '#ffffff', text: '#444444', sub: '#888888', accent: '#000000', shadow: 'rgba(0,0,0,0.1)' },
  { id: 'warm', name: '暖阳', bg: '#f4f0e6', text: '#5d5550', sub: '#98908a', accent: '#8c7b75', shadow: 'rgba(93,85,80,0.1)' },
  { id: 'dark', name: '午夜', bg: '#1a1a1a', text: '#cccccc', sub: '#666666', accent: '#ffffff', shadow: 'rgba(0,0,0,0.5)' },
  { id: 'cool', name: '冷调', bg: '#eceff1', text: '#37474f', sub: '#90a4ae', accent: '#455a64', shadow: 'rgba(55,71,79,0.1)' }
];

// Helper to load initial state safely
const loadSavedFlowers = (): Flower[] => {
  try {
    const saved = localStorage.getItem(GARDEN_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error("Failed to load saved garden:", e);
    return [];
  }
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  
  const seedsRef = useRef<Seed[]>([]);
  // Initialize with saved data
  const flowersRef = useRef<Flower[]>(loadSavedFlowers());
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
  const windStrengthRef = useRef(0.5);
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
  const [windStrength, setWindStrengthState] = useState(0.5);
  const [bgMode, setBgMode] = useState<BackgroundMode>(BackgroundMode.Camera);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  // Capture Logic States
  const [rawCapture, setRawCapture] = useState<HTMLCanvasElement | null>(null);
  const [capturedCard, setCapturedCard] = useState<string | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string>('classic');

  useEffect(() => { biomeRef.current = biome; }, [biome]);
  useEffect(() => { speciesRef.current = species; }, [species]);
  useEffect(() => { growthHeightRef.current = growthHeight; }, [growthHeight]);
  useEffect(() => { growthSpeedRef.current = growthSpeed; }, [growthSpeed]);
  useEffect(() => { petalScaleRef.current = petalScale; }, [petalScale]);
  useEffect(() => { windStrengthRef.current = windStrength; }, [windStrength]);
  useEffect(() => { bgModeRef.current = bgMode; }, [bgMode]);

  // Auto-Save Garden Data Periodically
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (flowersRef.current.length > 0) {
        localStorage.setItem(GARDEN_DATA_KEY, JSON.stringify(flowersRef.current));
      }
    }, 2000); 

    return () => clearInterval(saveInterval);
  }, []);

  // Initial Setup: Permissions -> Stream -> Vision -> Devices
  useEffect(() => {
    const init = async () => {
      try {
        await visionService.initialize();

        const savedCameraId = localStorage.getItem(CAMERA_STORAGE_KEY);
        let stream;

        try {
          if (savedCameraId) {
             stream = await navigator.mediaDevices.getUserMedia({
              video: { 
                deviceId: { exact: savedCameraId },
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
              }
            });
          } else {
             throw new Error("No saved camera");
          }
        } catch (e) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'user', 
              width: { ideal: 1280 }, 
              height: { ideal: 720 } 
            }
          });
        }

        currentStreamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Play error:", e));
            if (!requestRef.current) {
               lastTimeRef.current = performance.now();
               requestRef.current = requestAnimationFrame(animate);
            }
          };
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.deviceId) {
          setSelectedCamera(settings.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }

        setLoaded(true);

      } catch (err) {
        console.error("Initialization failed:", err);
        alert(lang === 'CN' 
          ? "无法启动相机，请确保允许访问摄像头权限。\n如果是iOS，请使用Safari浏览器并添加到主屏幕使用。" 
          : "Unable to start camera. Please ensure permissions are granted.\nUse Safari on iOS.");
      }
    };

    init();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Handle Camera Switching & Persistence
  useEffect(() => {
    if (!loaded || !selectedCamera) return;
    localStorage.setItem(CAMERA_STORAGE_KEY, selectedCamera);
    const activeTrack = currentStreamRef.current?.getVideoTracks()[0];
    if (activeTrack?.getSettings().deviceId === selectedCamera) return;

    const switchCamera = async () => {
      try {
        if (currentStreamRef.current) {
          currentStreamRef.current.getTracks().forEach(t => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            deviceId: { exact: selectedCamera }, 
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
          }
        });
        currentStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Play error:", e));
        }
      } catch (err) {
        console.error("Failed to switch camera:", err);
      }
    };
    switchCamera();
  }, [selectedCamera, loaded]);

  const mapCoordinates = (normX: number, normY: number, canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Default to stretched mapping if video not ready
    if (!videoWidth || !videoHeight) {
       return { x: normX * canvasWidth, y: normY * canvasHeight };
    }

    // "object-cover" logic: maintain aspect ratio, fill canvas
    const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
    const scaledWidth = videoWidth * scale;
    const scaledHeight = videoHeight * scale;

    // Calculate centering offsets
    const xOffset = (canvasWidth - scaledWidth) / 2;
    const yOffset = (canvasHeight - scaledHeight) / 2;

    return {
      x: normX * scaledWidth + xOffset,
      y: normY * scaledHeight + yOffset
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
    const time = performance.now();

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    config.sky.forEach((color, i) => skyGrad.addColorStop(i / (config.sky.length - 1), color));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Distant atmospheric elements based on theme
    ctx.save();
    if (config.particleType === 'star') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 100; i++) {
        const x = (Math.sin(i * 1234.5) * 0.5 + 0.5) * width;
        const y = (Math.cos(i * 6789.0) * 0.5 + 0.5) * height * 0.7;
        const size = (Math.sin(time * 0.001 + i) * 0.5 + 0.5) * 2;
        ctx.globalAlpha = Math.sin(time * 0.002 + i) * 0.4 + 0.6;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      }
    } else if (config.particleType === 'bubble') {
      ctx.strokeStyle = '#ffffff33';
      for (let i = 0; i < 30; i++) {
        const x = (Math.sin(i * 456.7) * 0.5 + 0.5) * width;
        const y = ((time * 0.05 + i * 100) % height);
        const size = (Math.cos(i) * 5 + 10);
        ctx.beginPath(); ctx.arc(x, height - y, size, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (config.particleType === 'firefly') {
      ctx.fillStyle = config.accent;
      ctx.shadowBlur = 15;
      ctx.shadowColor = config.accent;
      for (let i = 0; i < 25; i++) {
        const tx = time * 0.001;
        const x = (Math.sin(tx + i * 10) * 0.2 + 0.5 + Math.sin(i * 3) * 0.4) * width;
        const y = (Math.cos(tx * 0.8 + i * 5) * 0.2 + 0.4 + Math.cos(i * 2) * 0.3) * height;
        ctx.globalAlpha = Math.sin(tx * 3 + i) * 0.5 + 0.5;
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // 3. Main Accent (Sun/Moon/Core)
    ctx.save();
    ctx.fillStyle = config.accent;
    ctx.shadowBlur = 60;
    ctx.shadowColor = config.accent;
    ctx.globalAlpha = 0.9;
    
    if (theme === BiomeTheme.Sunset) {
      // Big Sun
      const sunX = width * 0.75;
      const sunY = height * 0.4;
      ctx.beginPath(); ctx.arc(sunX, sunY, 80, 0, Math.PI * 2); ctx.fill();
      // Glow rings
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.1;
      ctx.beginPath(); ctx.arc(sunX, sunY, 120, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sunX, sunY, 160, 0, Math.PI * 2); ctx.fill();
    } else if (theme === BiomeTheme.Ocean) {
      // Light rays
      const rayGrad = ctx.createLinearGradient(0, 0, 0, height);
      rayGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
      rayGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = rayGrad;
      for (let i = 0; i < 5; i++) {
        const rx = width * (0.2 + i * 0.15) + Math.sin(time * 0.001 + i) * 50;
        ctx.beginPath();
        ctx.moveTo(rx - 40, 0);
        ctx.lineTo(rx + 40, 0);
        ctx.lineTo(rx + 100, height);
        ctx.lineTo(rx - 100, height);
        ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.arc(width * 0.8, height * 0.2, 50, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 4. Hills / Depth Silhouettes
    if (config.showHills) {
      ctx.fillStyle = config.ground;
      // Mid hill
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.8);
      for (let i = 0; i <= 10; i++) {
        const hx = (i / 10) * width;
        const hy = height * 0.75 + Math.sin(i * 1.5 + theme.length) * 40;
        ctx.lineTo(hx, hy);
      }
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
      
      // Front hill
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.9);
      ctx.lineTo(width * 0.3, height * 0.82);
      ctx.lineTo(width * 0.6, height * 0.92);
      ctx.lineTo(width, height * 0.85);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();
    } else {
      // Ground plane
      ctx.fillStyle = config.ground;
      ctx.fillRect(0, height * 0.85, width, height * 0.15);
    }
  };

  const handleClearGarden = useCallback(() => {
    localStorage.removeItem(GARDEN_DATA_KEY);
    
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
    
    if (!canvas || !video || video.readyState < 2) { 
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
            // Pass video element to properly map coordinates accounting for object-cover
            const pos = mapCoordinates((thumb.x + indexFinger.x) / 2, (thumb.y + indexFinger.y) / 2, canvas, video);
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

    const time = performance.now();
    const windStr = windStrengthRef.current;
    const uniqueOffset = x * 0.01 + (f.id.charCodeAt(0) || 0);
    const swayAmp = 20 * windStr * (f.currentHeight / 150); 
    const sway = Math.sin(time * 0.002 + uniqueOffset) * swayAmp;

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

    const cp1x = f.stemControlPoints[1].x + sway * 0.25;
    const cp1y = -h * 0.33;
    const cp2x = f.stemControlPoints[2].x + sway * 0.5;
    const cp2y = -h * 0.66;
    const tipX = f.stemControlPoints[3].x + sway;
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
        ctx.rotate(Math.sin(time * 0.003 + uniqueOffset) * 0.2 * windStr);
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
      ctx.rotate(sway * 0.015);

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

  // 1. Capture Logic: Use intermediate canvas to fix black screen & flip issues
  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create a temporary canvas for the un-mirrored composition
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    // A. Draw Video Background (Unmirrored first to handle crop correctly)
    if (bgMode === BackgroundMode.Camera && video.videoWidth) {
        // Calculate "object-cover" crop metrics
        const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
        const sw = video.videoWidth * scale;
        const sh = video.videoHeight * scale;
        const ox = (width - sw) / 2;
        const oy = (height - sh) / 2;
        
        tCtx.drawImage(video, ox, oy, sw, sh);
    } else {
        drawArtisticBackground(tCtx, width, height, biome);
    }

    // B. Draw AR Layer (Unmirrored)
    // The canvas itself has CSS scaleX(-1), but its internal buffer is standard.
    // Drawing it directly to tempCanvas (standard) preserves the buffer content.
    tCtx.drawImage(canvas, 0, 0);

    // C. Flip the result onto the final scene canvas
    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = width;
    sceneCanvas.height = height;
    const sCtx = sceneCanvas.getContext('2d');
    if (!sCtx) return;

    // Apply horizontal flip to match the "Selfie Mirror" effect seen on screen
    sCtx.translate(width, 0);
    sCtx.scale(-1, 1);
    sCtx.drawImage(tempCanvas, 0, 0);

    setRawCapture(sceneCanvas);
    setActiveFrameId('classic');
  }, [bgMode, biome]);

  // 2. Effect to generate the framed card
  useEffect(() => {
    if (!rawCapture) return;

    const generateCard = async () => {
        const frameStyle = FRAME_STYLES.find(f => f.id === activeFrameId) || FRAME_STYLES[0];
        const CARD_WIDTH = 1080;
        const SIDE_MARGIN = 60;
        
        // Calculate image dimensions to fit within width but maintain aspect ratio
        const sceneAspect = rawCapture.width / rawCapture.height;
        const imgWidth = CARD_WIDTH - (SIDE_MARGIN * 2);
        const imgHeight = imgWidth / sceneAspect;

        // Heights
        const headerHeight = 160;
        // Estimate footer space dynamically or fixed
        
        // Content
        const reflection = getRandomMessage('CN'); // Force CN for share card as requested
        const now = new Date();
        const dayStr = now.getDate().toString();
        const monthYearStr = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
        
        // Measure text
        const tempCtx = document.createElement('canvas').getContext('2d');
        if (!tempCtx) return;
        const quoteSize = 36;
        tempCtx.font = `normal ${quoteSize}px "Inter", sans-serif`;
        const maxTextWidth = CARD_WIDTH - (SIDE_MARGIN * 4);
        
        // Wrapping Logic
        const getLines = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number) => {
            const lines = [];
            let currentLine = '';
            for(let i=0; i<text.length; i++) {
                const char = text[i];
                const test = currentLine + char;
                if (ctx.measureText(test).width > maxWidth) {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = test;
                }
            }
            lines.push(currentLine);
            return lines;
        };

        const lines = getLines(tempCtx, reflection, maxTextWidth);
        const lineHeight = quoteSize * 1.8;
        const textBlockHeight = lines.length * lineHeight;
        const footerHeight = textBlockHeight + 240; // Space for logo and attribution

        const CARD_HEIGHT = headerHeight + imgHeight + footerHeight;

        const cardCanvas = document.createElement('canvas');
        cardCanvas.width = CARD_WIDTH;
        cardCanvas.height = CARD_HEIGHT;
        const ctx = cardCanvas.getContext('2d');
        if (!ctx) return;

        // 1. Background
        ctx.fillStyle = frameStyle.bg;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        // 2. Header
        ctx.fillStyle = frameStyle.accent;
        ctx.font = 'bold 100px "Inter", sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(dayStr, SIDE_MARGIN, 50);
        
        const dayWidth = ctx.measureText(dayStr).width;
        ctx.fillStyle = frameStyle.text;
        ctx.font = 'bold 32px "Inter", sans-serif';
        ctx.fillText(monthYearStr, SIDE_MARGIN + dayWidth + 20, 65);
        
        // Location / Context
        ctx.textAlign = 'right';
        ctx.fillStyle = frameStyle.sub;
        ctx.font = 'normal 26px "Inter", sans-serif';
        ctx.fillText('数字花园 · AR空间', CARD_WIDTH - SIDE_MARGIN, 70);

        // 3. Image with Shadow
        const imgX = SIDE_MARGIN;
        const imgY = headerHeight;

        ctx.save();
        ctx.shadowColor = frameStyle.shadow || 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 15;
        ctx.fillStyle = '#000'; // Shadow caster
        ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
        ctx.restore();

        ctx.drawImage(rawCapture, imgX, imgY, imgWidth, imgHeight);

        // 4. Footer Content
        const textStartY = imgY + imgHeight + 100;
        ctx.textAlign = 'center';
        
        // Attribution
        ctx.fillStyle = frameStyle.sub;
        ctx.font = 'normal 24px "Inter", sans-serif';
        ctx.fillText('Garden Created by You', CARD_WIDTH / 2, textStartY - 50);

        // Divider Line (Optional)
        ctx.beginPath();
        ctx.moveTo(CARD_WIDTH / 2 - 30, textStartY - 25);
        ctx.lineTo(CARD_WIDTH / 2 + 30, textStartY - 25);
        ctx.strokeStyle = frameStyle.sub;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Quote
        ctx.fillStyle = frameStyle.text;
        ctx.font = `normal ${quoteSize}px "Inter", sans-serif`;
        lines.forEach((line, i) => {
           ctx.fillText(line, CARD_WIDTH / 2, textStartY + (i * lineHeight));
        });

        // Branding
        const brandY = CARD_HEIGHT - 70;
        ctx.fillStyle = frameStyle.accent;
        ctx.font = 'bold 32px "Inter", sans-serif';
        ctx.fillText('GEMINI AR GARDEN', CARD_WIDTH / 2, brandY - 40);
        
        ctx.fillStyle = frameStyle.sub;
        ctx.font = 'normal 16px "Inter", sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText('BORNFORTHIS AI LAB', CARD_WIDTH / 2, brandY);

        setCapturedCard(cardCanvas.toDataURL('image/png'));
    };

    generateCard();
  }, [rawCapture, activeFrameId, lang]);

  const downloadCapturedImage = () => {
    if (!capturedCard) return;
    const link = document.createElement('a');
    link.href = capturedCard;
    link.download = `ar-garden-${Date.now()}.png`;
    link.click();
  };

  const closeCapture = () => {
      setCapturedCard(null);
      setRawCapture(null);
  };

  const reflectionsBtnText = lang === 'CN' ? "花园感悟" : "GARDEN REFLECTIONS";
  const reflectionsLoadingText = lang === 'CN' ? "正在感悟生命..." : "CONSULTING SPIRITS...";
  const reflectionsCloseText = lang === 'CN' ? "关闭感悟" : "CLOSE VISION";
  const capturedMemoryText = lang === 'CN' ? "记忆已定格" : "MEMORY CAPTURED";
  const downloadBtnText = lang === 'CN' ? "保存卡片" : "SAVE CARD";
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
          className="absolute inset-0 w-full h-full object-cover" 
          playsInline muted autoPlay
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
          windStrength={windStrength} setWindStrength={setWindStrengthState}
          cameras={cameras} selectedCamera={selectedCamera} setSelectedCamera={setSelectedCamera}
          bgMode={bgMode} setBgMode={setBgMode}
          onCapture={handleCapture}
          onClearGarden={handleClearGarden}
          lang={lang} setLang={setLang}
        />

        {/* Updated "Garden Reflections" Button for Mobile Responsiveness */}
        <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 z-20 flex flex-col items-end pointer-events-none">
          <button 
            onClick={(e) => { e.stopPropagation(); handleAnalyze(); }} 
            disabled={isAnalyzing}
            className={`
              pointer-events-auto
              relative groupqp flex items-center justify-center 
              bg-black/60 backdrop-blur-xl border border-white/10 text-white 
              shadow-2xl transition-all duration-300 ease-out
              active:scale-95 disabled:opacity-50
              hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_20px_rgba(236,72,153,0.3)]
              ${isAnalyzing 
                ? 'px-6 py-3 rounded-2xl gap-3 w-auto' // Loading state: expanded pill
                : 'w-14 h-14 rounded-full sm:w-auto sm:h-auto sm:px-6 sm:py-3 sm:rounded-2xl sm:gap-3' // Default: Circle on mobile, Pill on desktop
              }
            `}
          >
            <MdAutoAwesome className={`text-xl text-pink-400 shrink-0 ${isAnalyzing ? "animate-spin" : "group-hover:rotate-12 transition-transform"}`} />
            
            <span className={`
              font-bold text-[10px] tracking-[0.2em] uppercase whitespace-nowrap
              ${isAnalyzing ? 'block' : 'hidden sm:block'}
            `}>
              {isAnalyzing ? reflectionsLoadingText : reflectionsBtnText}
            </span>
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

        {/* Capture Preview Modal */}
        {capturedCard && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl z-50 p-6 pb-12" onClick={(e) => e.stopPropagation()}>
             <div className="flex justify-between w-full max-w-lg mb-4 px-2 shrink-0">
                <h3 className="text-[12px] font-black tracking-[0.3em] text-white/50 uppercase">{capturedMemoryText}</h3>
                <button onClick={closeCapture} className="text-white/50 hover:text-white transition-colors">
                   <MdClose className="text-2xl" />
                </button>
             </div>
             
             {/* Preview Container - Scrollable if needed, but mostly fitted */}
             <div className="relative w-full max-w-lg flex-1 min-h-0 flex items-center justify-center mb-6">
                <img 
                   src={capturedCard} 
                   alt="Captured Garden" 
                   className="max-w-full max-h-full object-contain rounded-sm shadow-2xl"
                   style={{ boxShadow: '0 0 50px rgba(0,0,0,0.5)' }} 
                />
             </div>

             {/* Frame Selector */}
             <div className="flex gap-4 mb-6 shrink-0 overflow-x-auto max-w-full pb-2 px-2 mask-linear">
                {FRAME_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setActiveFrameId(style.id)}
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${activeFrameId === style.id ? 'border-white scale-110 shadow-lg' : 'border-white/20 opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: style.bg }}
                    title={style.name}
                  >
                    {activeFrameId === style.id && <MdCheck className={`text-xl ${style.id === 'dark' ? 'text-white' : 'text-black'}`} />}
                  </button>
                ))}
             </div>

             <div className="flex gap-4 w-full max-w-lg shrink-0">
               <button onClick={downloadCapturedImage} className="flex-1 flex items-center justify-center gap-3 py-4 bg-white text-black rounded-xl font-bold text-[11px] tracking-widest uppercase hover:bg-gray-200 transition-all shadow-lg shadow-white/10">
                 <MdDownload className="text-lg" /> {downloadBtnText}
               </button>
               <button onClick={closeCapture} className="px-8 py-4 bg-white/10 text-white rounded-xl font-bold text-[11px] tracking-widest uppercase hover:bg-white/20 transition-all">
                 {exitBtnText}
               </button>
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