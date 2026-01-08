
export interface Point {
  x: number;
  y: number;
}

export enum BiomeTheme {
  Sunset = 'SUNSET',
  Ocean = 'OCEAN',
  Forest = 'FOREST',
  Lavender = 'LAVENDER'
}

export enum BackgroundMode {
  Camera = 'CAMERA',
  Artistic = 'ARTISTIC'
}

export enum FlowerSpecies {
  Random = 'RANDOM',
  Rose = 'ROSE',
  Tulip = 'TULIP',
  Daisy = 'DAISY',
  Lily = 'LILY',
  Poppy = 'POPPY'
}

export interface Seed {
  id: string;
  x: number;
  y: number;
  vy: number; // Vertical velocity
  color: string;
}

export interface Flower {
  id: string;
  relX: number; // Normalized X coordinate (0 to 1)
  maxHeight: number;
  currentHeight: number;
  bloomProgress: number; // 0 to 1
  species: FlowerSpecies;
  color: string;
  secondaryColor: string;
  stemControlPoints: Point[]; // For bezier curve randomness
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1.0 to 0
  color: string;
  size: number;
}

export const BIOME_COLORS: Record<BiomeTheme, string[]> = {
  [BiomeTheme.Sunset]: ['#FF9A9E', '#FECFEF', '#FF6B6B', '#FAD0C4'],
  [BiomeTheme.Ocean]: ['#4FACFE', '#00F2FE', '#43E97B', '#38F9D7'],
  [BiomeTheme.Forest]: ['#11998e', '#38ef7d', '#a8e063', '#56ab2f'],
  [BiomeTheme.Lavender]: ['#E0C3FC', '#8EC5FC', '#C2E9FB', '#A18CD1']
};

export interface ArtisticConfig {
  sky: string[];
  ground: string;
  accent: string;
  secondaryAccent?: string;
  particleType: 'none' | 'star' | 'bubble' | 'firefly' | 'flare';
  showHills: boolean;
}

export const ARTISTIC_BG: Record<BiomeTheme, ArtisticConfig> = {
  [BiomeTheme.Sunset]: {
    sky: ['#1a0a2e', '#4a154b', '#ff4d6d', '#ffb38a'],
    ground: '#1a0a2e',
    accent: '#ff9e00',
    secondaryAccent: '#ff5400',
    particleType: 'flare',
    showHills: true
  },
  [BiomeTheme.Ocean]: {
    sky: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef'],
    ground: '#023e8a',
    accent: '#caf0f8',
    particleType: 'bubble',
    showHills: false
  },
  [BiomeTheme.Forest]: {
    sky: ['#081c15', '#1b4332', '#2d6a4f', '#74c69d'],
    ground: '#081c15',
    accent: '#d8f3dc',
    particleType: 'firefly',
    showHills: true
  },
  [BiomeTheme.Lavender]: {
    sky: ['#240046', '#3c096c', '#7b2cbf', '#c77dff'],
    ground: '#10002b',
    accent: '#e0aaff',
    secondaryAccent: '#ffffff',
    particleType: 'star',
    showHills: true
  }
};
