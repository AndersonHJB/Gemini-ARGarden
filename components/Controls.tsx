import React from 'react';
import { BiomeTheme, BIOME_COLORS, FlowerSpecies, BackgroundMode } from '../types';
import { twMerge } from 'tailwind-merge';
import { MdCameraAlt, MdBrush, MdVideocam, MdSettings, MdClose, MdDeleteSweep, MdLanguage } from "react-icons/md";

interface StatusPanelProps {
  isPinching: boolean;
  isMouthOpen: boolean;
  isFist: boolean;
  fistTimeRemaining: number;
  lang: 'CN' | 'EN';
}

interface WorldControlsProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  biome: BiomeTheme;
  setBiome: (b: BiomeTheme) => void;
  onApplyBiomeToAll: () => void;
  species: FlowerSpecies;
  setSpecies: (s: FlowerSpecies) => void;
  onApplySpeciesToAll: () => void;
  growthHeight: number;
  setGrowthHeight: (h: number) => void;
  growthSpeed: number;
  setGrowthSpeed: (s: number) => void;
  petalScale: number;
  setPetalScale: (s: number) => void;
  windStrength: number;
  setWindStrength: (w: number) => void;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (id: string) => void;
  bgMode: BackgroundMode;
  setBgMode: (m: BackgroundMode) => void;
  onCapture: () => void;
  onClearGarden: () => void;
  lang: 'CN' | 'EN';
  setLang: (l: 'CN' | 'EN') => void;
}

const UI_STRINGS = {
  CN: {
    PINCH: "捏合：播种",
    MOUTH: "张嘴：生长",
    CLEARING: "正在清理...",
    SETTINGS: "花园设置",
    CAPTURE: "拍摄",
    CLEAR: "清除",
    GROWTH_SCALE: "世界生长比例",
    GROWTH_SPEED: "生长活力",
    PETAL_SIZE: "花瓣规模",
    WIND: "微风轻拂",
    PERSPECTIVE: "视角",
    AR_VIEW: "增强现实",
    ARTISTIC: "艺术视图",
    BIOME_DNA: "环境基因",
    MUTATE: "变异全部",
    SPECIES: "花卉品种",
    CONVERT: "转换全部",
    HARDWARE: "硬件输出",
    LANGUAGE: "语言 (Language)"
  },
  EN: {
    PINCH: "PINCH: PLANT",
    MOUTH: "MOUTH: GROW",
    CLEARING: "CLEARING...",
    SETTINGS: "GARDEN SETTINGS",
    CAPTURE: "CAPTURE",
    CLEAR: "CLEAR",
    GROWTH_SCALE: "World Growth Scale",
    GROWTH_SPEED: "Growth Vigor",
    PETAL_SIZE: "Petal Scale",
    WIND: "Breeze Intensity",
    PERSPECTIVE: "Perspective",
    AR_VIEW: "AR VIEW",
    ARTISTIC: "ARTISTIC",
    BIOME_DNA: "Biome DNA",
    MUTATE: "MUTATE ALL",
    SPECIES: "Flower Species",
    CONVERT: "CONVERT ALL",
    HARDWARE: "Hardware Output",
    LANGUAGE: "Language (语言)"
  }
};

export const StatusPanel: React.FC<StatusPanelProps> = ({ isPinching, isMouthOpen, isFist, fistTimeRemaining, lang }) => {
  const t = UI_STRINGS[lang];
  
  const itemClass = (active: boolean, isClear: boolean = false) => 
    twMerge(
      "flex items-center gap-3 px-5 py-3 rounded-xl text-[11px] font-black tracking-[0.15em] transition-all duration-300 border-2 shadow-2xl backdrop-blur-xl min-w-[180px] sm:min-w-[200px]",
      active 
        ? isClear 
          ? "bg-red-600/90 text-white border-red-400/50 shadow-[0_0_25px_rgba(220,38,38,0.5)] scale-105"
          : "bg-pink-500/90 text-white border-pink-400/50 shadow-[0_0_25px_rgba(236,72,153,0.5)] scale-105" 
        : "bg-black/75 text-gray-300 border-white/20"
    );

  const indicatorClass = (active: boolean) =>
    twMerge(
      "w-2.5 h-2.5 rounded-full transition-all duration-300", 
      active ? "bg-white shadow-[0_0_12px_rgba(255,255,255,1)] scale-125" : "bg-gray-600"
    );

  return (
    <div className="absolute top-6 left-6 flex flex-col gap-3 z-20 font-mono pointer-events-none">
      <div className={itemClass(isPinching)}>
        <div className={indicatorClass(isPinching)} />
        <span className="drop-shadow-sm">{t.PINCH}</span>
      </div>
      <div className={itemClass(isMouthOpen)}>
        <div className={indicatorClass(isMouthOpen)} />
        <span className="drop-shadow-sm">{t.MOUTH}</span>
      </div>
      {isFist && (
        <div className={itemClass(isFist, true)}>
          <div className={indicatorClass(isFist)} />
          <div className="flex-1 drop-shadow-sm">{t.CLEARING}</div>
          <span className="text-[12px] font-black tabular-nums">
            {fistTimeRemaining.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
};

const ControlSlider = ({ label, value, min, max, step, onChange, unit = "" }: any) => (
  <div className="mb-5">
    <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">
      <span>{label}</span>
      <span className="text-pink-400 font-mono">{Math.round(value * (unit === "%" ? 100 : 1))}{unit}</span>
    </div>
    <div className="relative h-4 flex items-center">
       <input 
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
      />
    </div>
  </div>
);

export const WorldControls: React.FC<WorldControlsProps> = ({
  isOpen, setIsOpen, biome, setBiome, onApplyBiomeToAll, species, setSpecies, onApplySpeciesToAll, 
  growthHeight, setGrowthHeight, growthSpeed, setGrowthSpeed, petalScale, setPetalScale,
  windStrength, setWindStrength,
  cameras, selectedCamera, setSelectedCamera, bgMode, setBgMode, 
  onCapture, onClearGarden, lang, setLang
}) => {
  const t = UI_STRINGS[lang];
  return (
    <>
      {!isOpen && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
          className="absolute top-6 right-6 w-12 h-12 bg-black/60 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl z-20 hover:bg-white/10 transition-all active:scale-90"
        >
          <MdSettings className="text-xl text-white" />
        </button>
      )}

      <div 
        onClick={(e) => e.stopPropagation()}
        className={twMerge(
          "absolute top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-3xl p-6 text-white border-l border-white/10 shadow-2xl z-30 transition-transform duration-500 ease-in-out flex flex-col overflow-y-auto",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
             <h2 className="text-[10px] font-black tracking-[0.2em] text-gray-300">{t.SETTINGS}</h2>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <MdClose className="text-xl text-gray-400" />
          </button>
        </div>

        <div className="flex gap-2 mb-6">
           <button 
            onClick={onCapture}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pink-500 hover:bg-pink-600 rounded-xl transition-all font-bold text-[9px] tracking-widest uppercase shadow-[0_0_15px_rgba(236,72,153,0.3)]"
          >
            <MdCameraAlt className="text-sm" /> {t.CAPTURE}
          </button>
          <button 
            onClick={() => { onClearGarden(); setIsOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-xl transition-all font-bold text-[9px] tracking-widest uppercase text-red-400"
          >
            <MdDeleteSweep className="text-sm" /> {t.CLEAR}
          </button>
        </div>

        <div className="mb-6">
           <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">{t.LANGUAGE}</label>
           <div className="flex gap-2">
              <button 
                onClick={() => setLang('CN')}
                className={twMerge(
                  "flex-1 py-2 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                  lang === 'CN' ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
                )}
              >
                中文
              </button>
              <button 
                onClick={() => setLang('EN')}
                className={twMerge(
                  "flex-1 py-2 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                  lang === 'EN' ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
                )}
              >
                ENGLISH
              </button>
           </div>
        </div>

        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 mb-6">
          <ControlSlider label={t.GROWTH_SCALE} value={growthHeight} min={0.2} max={1.8} step={0.01} onChange={setGrowthHeight} unit="%" />
          <ControlSlider label={t.GROWTH_SPEED} value={growthSpeed} min={0.2} max={2.0} step={0.1} onChange={setGrowthSpeed} unit="x" />
          <ControlSlider label={t.PETAL_SIZE} value={petalScale} min={0.5} max={1.5} step={0.05} onChange={setPetalScale} unit="x" />
          <ControlSlider label={t.WIND} value={windStrength} min={0} max={3.0} step={0.1} onChange={setWindStrength} unit="" />
        </div>

        <div className="mb-6">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">{t.PERSPECTIVE}</label>
          <div className="flex gap-2">
            <button 
              onClick={() => setBgMode(BackgroundMode.Camera)}
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                bgMode === BackgroundMode.Camera ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
              )}
            >
              <MdVideocam className="text-sm" /> {t.AR_VIEW}
            </button>
            <button 
              onClick={() => setBgMode(BackgroundMode.Artistic)}
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                bgMode === BackgroundMode.Artistic ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
              )}
            >
              <MdBrush className="text-sm" /> {t.ARTISTIC}
            </button>
          </div>
        </div>

        <div className="mb-6 bg-white/5 p-4 rounded-2xl border border-white/5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">{t.BIOME_DNA}</label>
            <button 
              onClick={onApplyBiomeToAll}
              className="text-[8px] font-black tracking-widest text-pink-400 hover:text-white transition-all"
            >
              {t.MUTATE}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Object.values(BiomeTheme).map((theme) => {
               const isActive = biome === theme;
               return (
                 <button
                   key={theme}
                   onClick={() => setBiome(theme)}
                   className={twMerge(
                     "h-10 rounded-xl transition-all relative overflow-hidden",
                     isActive ? "ring-2 ring-pink-500 ring-offset-2 ring-offset-black scale-110 z-10" : "opacity-40 hover:opacity-100 hover:scale-105"
                   )}
                   style={{ background: `linear-gradient(135deg, ${BIOME_COLORS[theme][0]}, ${BIOME_COLORS[theme][2]})` }}
                 />
               );
            })}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">{t.SPECIES}</label>
            <button 
              onClick={onApplySpeciesToAll}
              className="text-[8px] font-black tracking-widest text-pink-400 hover:text-white transition-all"
            >
              {t.CONVERT}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(FlowerSpecies).map((s) => (
              <button
                key={s}
                onClick={() => setSpecies(s)}
                className={twMerge(
                  "py-3 rounded-xl text-[9px] font-bold transition-all border uppercase tracking-widest",
                  species === s 
                    ? "bg-pink-500 text-white border-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.3)]" 
                    : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-white/10">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2 block">{t.HARDWARE}</label>
          <select 
            value={selectedCamera} 
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-[10px] text-gray-300 outline-none cursor-pointer hover:bg-white/5 transition-all"
          >
            {cameras.map(cam => (
              <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Lens ${cam.deviceId.slice(0,4)}`}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
};