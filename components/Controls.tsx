
import React from 'react';
import { BiomeTheme, BIOME_COLORS, FlowerSpecies } from '../types';
import { twMerge } from 'tailwind-merge';

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
  videoScale: number;
  setVideoScale: (s: number) => void;
  soilDepth: number;
  setSoilDepth: (d: number) => void;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (id: string) => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ isPinching, isMouthOpen, isFist }) => {
  const itemClass = (active: boolean) => 
    twMerge(
      "flex items-center gap-3 px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest transition-all duration-300 border",
      active 
        ? "bg-pink-500/90 text-white border-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.5)] scale-105" 
        : "bg-black/40 text-gray-500 border-white/5 backdrop-blur-sm"
    );

  const indicatorClass = (active: boolean) =>
    twMerge(
      "w-1.5 h-1.5 rounded-full transition-all duration-300", 
      active ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-125" : "bg-gray-600"
    );

  return (
    <div className="absolute top-6 left-6 flex flex-col gap-2 z-20 font-mono">
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
  biome, setBiome, species, setSpecies, growthHeight, setGrowthHeight, 
  videoScale, setVideoScale, soilDepth, setSoilDepth,
  cameras, selectedCamera, setSelectedCamera
}) => {
  return (
    <div className="absolute top-6 right-6 w-72 bg-black/60 backdrop-blur-2xl rounded-2xl p-5 text-white border border-white/10 shadow-2xl z-20 overflow-y-auto max-h-[85vh]">
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-3">
        <h2 className="text-[10px] font-black tracking-[0.2em] text-gray-300">GARDEN SETTINGS</h2>
        <span className="text-[9px] font-bold text-pink-500 border border-pink-500/30 px-2 py-0.5 rounded">PRO</span>
      </div>

      <ControlSlider label="View Zoom" value={videoScale} min={0.5} max={1.5} step={0.01} onChange={setVideoScale} unit="%" />
      <ControlSlider label="Growth Power" value={growthHeight} min={0.2} max={1.5} step={0.01} onChange={setGrowthHeight} unit="%" />
      <ControlSlider label="Soil Depth" value={soilDepth} min={10} max={150} step={1} onChange={setSoilDepth} unit="px" />

      <div className="mb-6">
        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">Biome Theme</label>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(BiomeTheme).map((theme) => {
             const isActive = biome === theme;
             return (
               <button
                 key={theme}
                 onClick={() => setBiome(theme)}
                 className={twMerge(
                   "h-8 rounded-md transition-all relative overflow-hidden",
                   isActive ? "ring-2 ring-pink-500 ring-offset-2 ring-offset-black scale-105" : "opacity-40 hover:opacity-100"
                 )}
                 style={{ background: `linear-gradient(135deg, ${BIOME_COLORS[theme][0]}, ${BIOME_COLORS[theme][2]})` }}
               />
             );
          })}
        </div>
      </div>

      <div className="mb-6">
        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-3 block">Species</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(FlowerSpecies).map((s) => (
            <button
              key={s}
              onClick={() => setSpecies(s)}
              className={twMerge(
                "py-2 rounded-md text-[9px] font-bold transition-all border",
                species === s ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:bg-white/5"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2 block">Camera</label>
        <select 
          value={selectedCamera} 
          onChange={(e) => setSelectedCamera(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-gray-300 outline-none cursor-pointer"
        >
          {cameras.map(cam => (
            <option key={cam.deviceId} value={cam.deviceId}>{cam.label || "Default Camera"}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
