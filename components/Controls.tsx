import React from 'react';
import { BiomeTheme, BIOME_COLORS, FlowerSpecies } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Types ---
interface StatusPanelProps {
  isPinching: boolean;
  isMouthOpen: boolean;
  isFist: boolean;
}

interface WorldControlsProps {
  biome: BiomeTheme;
  setBiome: (b: BiomeTheme) => void;
  species: FlowerSpecies;
  setSpecies: (s: FlowerSpecies) => void;
  growthHeight: number;
  setGrowthHeight: (h: number) => void;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (id: string) => void;
}

// --- Components ---

export const StatusPanel: React.FC<StatusPanelProps> = ({ isPinching, isMouthOpen, isFist }) => {
  const itemClass = (active: boolean) => 
    twMerge(
      "flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold tracking-widest transition-all duration-300 border",
      active 
        ? "bg-pink-500/90 text-white border-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.5)] scale-105" 
        : "bg-black/40 text-gray-500 border-white/5 backdrop-blur-sm"
    );

  const indicatorClass = (active: boolean) =>
    twMerge(
      "w-2 h-2 rounded-full transition-all duration-300", 
      active ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-125" : "bg-gray-600"
    );

  return (
    <div className="absolute top-6 left-6 flex flex-col gap-3 z-20 font-mono">
      <div className={itemClass(isPinching)}>
        <div className={indicatorClass(isPinching)} />
        PINCH: PLANT
      </div>
      <div className={itemClass(isMouthOpen)}>
        <div className={indicatorClass(isMouthOpen)} />
        MOUTH: BLOOM
      </div>
      <div className={itemClass(isFist)}>
        <div className={indicatorClass(isFist)} />
        FIST: CLEAR
      </div>
    </div>
  );
};

export const WorldControls: React.FC<WorldControlsProps> = ({
  biome, setBiome, species, setSpecies, growthHeight, setGrowthHeight, cameras, selectedCamera, setSelectedCamera
}) => {
  return (
    <div className="absolute top-6 right-6 w-80 bg-[#0a0a0a]/90 backdrop-blur-xl rounded-2xl p-5 text-white border border-white/10 shadow-2xl z-20">
      <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-3">
        <div>
          <h2 className="text-xs font-black tracking-[0.25em] text-gray-400 mb-1">WORLD CONTROLS</h2>
          <div className="h-0.5 w-8 bg-pink-500 rounded-full"></div>
        </div>
        <span className="text-[10px] font-bold text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">V2.5</span>
      </div>

      {/* Camera Source */}
      <div className="mb-6 group">
        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2 flex justify-between">
          Camera Source 
          <span className="text-green-400 text-[9px] px-1.5 py-px bg-green-400/10 rounded border border-green-400/20">ON</span>
        </label>
        <div className="relative">
          <select 
            value={selectedCamera} 
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all appearance-none cursor-pointer hover:bg-white/5"
          >
            {cameras.map(cam => (
              <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 4)}`}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-[10px]">▼</div>
        </div>
      </div>

      {/* Growth Height */}
      <div className="mb-6">
        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3">
          <span>Growth Height</span>
          <span className="text-pink-400">{Math.round(growthHeight * 100)}%</span>
        </div>
        <div className="relative h-4 flex items-center">
           <input 
            type="range" 
            min="0.2" 
            max="1.5" 
            step="0.01" 
            value={growthHeight}
            onChange={(e) => setGrowthHeight(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(236,72,153,0.8)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
          />
        </div>
      </div>

      {/* Biome Theme */}
      <div className="mb-6">
        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3">
          <span>Biome Theme</span>
          <span className="text-[9px] text-gray-500 bg-white/5 px-1.5 rounded">{biome}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(BiomeTheme).map((theme) => {
             const colors = BIOME_COLORS[theme];
             const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[2]})`;
             const isActive = biome === theme;
             return (
               <button
                 key={theme}
                 onClick={() => setBiome(theme)}
                 className={twMerge(
                   "h-9 rounded-lg transition-all duration-300 relative overflow-hidden group",
                   isActive ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-105" : "opacity-60 hover:opacity-100 hover:scale-105"
                 )}
                 style={{ background: gradient }}
                 title={theme}
               >
                 {isActive && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
               </button>
             );
          })}
        </div>
      </div>

      {/* Flower Species */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">Flower Species</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(FlowerSpecies).map((s) => {
            const isActive = species === s;
            return (
              <button
                key={s}
                onClick={() => setSpecies(s)}
                className={twMerge(
                  "px-2 py-2 rounded-md text-[9px] font-bold transition-all uppercase tracking-wide border",
                  isActive 
                    ? "bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.3)] transform scale-105" 
                    : "bg-transparent text-gray-500 border-white/10 hover:border-white/30 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};