import React from 'react';
import { BiomeTheme, BIOME_COLORS, FlowerSpecies } from '../types';
import { clsx } from 'clsx';

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
    clsx(
      "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all duration-200",
      active ? "bg-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.6)]" : "bg-black/60 text-gray-400 backdrop-blur-sm"
    );

  const indicatorClass = (active: boolean) =>
    clsx("w-2 h-2 rounded-full", active ? "bg-white animate-pulse" : "bg-gray-600");

  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
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
    <div className="absolute top-4 right-4 w-72 bg-black/80 backdrop-blur-md rounded-xl p-4 text-white border border-white/10 shadow-2xl z-20">
      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-gray-300">WORLD CONTROLS</h2>
        <span className="text-xs font-bold text-pink-500">V2.5</span>
      </div>

      {/* Camera Source */}
      <div className="mb-4">
        <label className="text-[10px] text-gray-400 uppercase font-semibold mb-1 block">Camera Source <span className="text-green-400 float-right">ON</span></label>
        <select 
          value={selectedCamera} 
          onChange={(e) => setSelectedCamera(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-pink-500 transition-colors"
        >
          {cameras.map(cam => (
            <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 4)}`}</option>
          ))}
        </select>
      </div>

      {/* Growth Height */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-semibold mb-1">
          <span>Growth Height</span>
          <span>{Math.round(growthHeight * 100)}%</span>
        </div>
        <input 
          type="range" 
          min="0.2" 
          max="1.5" 
          step="0.01" 
          value={growthHeight}
          onChange={(e) => setGrowthHeight(parseFloat(e.target.value))}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
        />
      </div>

      {/* Biome Theme */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-semibold mb-2">
          <span>Biome Theme</span>
          <span className="text-xs text-gray-500">{biome}</span>
        </div>
        <div className="flex gap-2">
          {Object.values(BiomeTheme).map((theme) => {
             const colors = BIOME_COLORS[theme];
             const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[2]})`;
             return (
               <button
                 key={theme}
                 onClick={() => setBiome(theme)}
                 className={clsx(
                   "w-full h-8 rounded-md transition-transform hover:scale-105 border border-transparent",
                   biome === theme ? "ring-2 ring-white scale-110" : "opacity-60 hover:opacity-100"
                 )}
                 style={{ background: gradient }}
                 title={theme}
               />
             );
          })}
        </div>
      </div>

      {/* Flower Species */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase font-semibold mb-2 block">Flower Species</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(FlowerSpecies).map((s) => (
            <button
              key={s}
              onClick={() => setSpecies(s)}
              className={clsx(
                "px-2 py-1.5 rounded border text-[10px] font-medium transition-colors uppercase",
                species === s 
                  ? "bg-white text-black border-white" 
                  : "bg-transparent text-gray-400 border-white/20 hover:border-white/50"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};