
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

export const ARTISTIC_BG: Record<BiomeTheme, { sky: string[], ground: string, accent: string }> = {
  [BiomeTheme.Sunset]: {
    sky: ['#2D3436', '#D63031', '#E17055'],
    ground: '#2D3436',
    accent: '#FAD390'
  },
  [BiomeTheme.Ocean]: {
    sky: ['#0984E3', '#74B9FF', '#81ECEC'],
    ground: '#006266',
    accent: '#55EFC4'
  },
  [BiomeTheme.Forest]: {
    sky: ['#1B4F72', '#2ECC71', '#ABEBC6'],
    ground: '#186A3B',
    accent: '#F4D03F'
  },
  [BiomeTheme.Lavender]: {
    sky: ['#4834D4', '#686DE0', '#BE90D4'],
    ground: '#30336B',
    accent: '#EBBEBB'
  }
};
