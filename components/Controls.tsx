
import React from 'react';
import { BiomeTheme, BIOME_COLORS, FlowerSpecies, BackgroundMode } from '../types';
import { twMerge } from 'tailwind-merge';
import { MdCameraAlt, MdBrush, MdVideocam, MdSettings, MdClose, MdDeleteSweep } from "react-icons/md";

interface StatusPanelProps {
  isPinching: boolean;
  isMouthOpen: boolean;
  isFist: boolean;
  fistTimeRemaining: number;
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
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (id: string) => void;
  bgMode: BackgroundMode;
  setBgMode: (m: BackgroundMode) => void;
  onCapture: () => void;
  onClearGarden: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ isPinching, isMouthOpen, isFist, fistTimeRemaining }) => {
  const itemClass = (active: boolean, isClear: boolean = false) => 
    twMerge(
      "flex items-center gap-3 px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest transition-all duration-300 border min-w-[160px] sm:min-w-[180px]",
      active 
        ? isClear 
          ? "bg-red-600/90 text-white border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)] scale-105"
          : "bg-pink-500/90 text-white border-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.5)] scale-105" 
        : "bg-black/40 text-gray-500 border-white/5 backdrop-blur-sm"
    );

  const indicatorClass = (active: boolean) =>
    twMerge(
      "w-1.5 h-1.5 rounded-full transition-all duration-300", 
      active ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-125" : "bg-gray-600"
    );

  return (
    <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex flex-col gap-2 z-20 font-mono pointer-events-none">
      <div className={itemClass(isPinching)}>
        <div className={indicatorClass(isPinching)} />
        PINCH: PLANT
      </div>
      <div className={itemClass(isMouthOpen)}>
        <div className={indicatorClass(isMouthOpen)} />
        MOUTH: GROW
      </div>
      {isFist && (
        <div className={itemClass(isFist, true)}>
          <div className={indicatorClass(isFist)} />
          <div className="flex-1">CLEARING...</div>
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
      <span className="text-pink-400">{Math.round(value * (unit === "%" ? 100 : 1))}{unit}</span>
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
  growthHeight, setGrowthHeight, cameras, selectedCamera, setSelectedCamera, bgMode, setBgMode, 
  onCapture, onClearGarden
}) => {
  return (
    <>
      {/* Menu Toggle Button */}
      {!isOpen && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
          className="absolute top-6 right-6 w-12 h-12 bg-black/60 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl z-20 hover:bg-white/10 transition-all active:scale-90"
        >
          <MdSettings className="text-xl text-white" />
        </button>
      )}

      {/* Main Panel */}
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
             <h2 className="text-[10px] font-black tracking-[0.2em] text-gray-300">GARDEN SETTINGS</h2>
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
            <MdCameraAlt className="text-sm" /> CAPTURE
          </button>
          <button 
            onClick={() => { onClearGarden(); setIsOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-xl transition-all font-bold text-[9px] tracking-widest uppercase text-red-400"
          >
            <MdDeleteSweep className="text-sm" /> CLEAR
          </button>
        </div>

        <ControlSlider label="World Growth Scale" value={growthHeight} min={0.2} max={1.5} step={0.01} onChange={setGrowthHeight} unit="%" />

        <div className="mb-6">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">Perspective</label>
          <div className="flex gap-2">
            <button 
              onClick={() => setBgMode(BackgroundMode.Camera)}
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                bgMode === BackgroundMode.Camera ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
              )}
            >
              <MdVideocam className="text-sm" /> AR VIEW
            </button>
            <button 
              onClick={() => setBgMode(BackgroundMode.Artistic)}
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[9px] font-bold tracking-widest border transition-all",
                bgMode === BackgroundMode.Artistic ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
              )}
            >
              <MdBrush className="text-sm" /> ARTISTIC
            </button>
          </div>
        </div>

        <div className="mb-6 bg-white/5 p-4 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Biome DNA</label>
            <button 
              onClick={onApplyBiomeToAll}
              className="text-[8px] font-black tracking-widest text-pink-400 hover:text-white transition-all"
            >
              MUTATE ALL
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
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Flower Species</label>
            <button 
              onClick={onApplySpeciesToAll}
              className="text-[8px] font-black tracking-widest text-pink-400 hover:text-white transition-all"
            >
              CONVERT ALL
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
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2 block">Hardware Output</label>
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
