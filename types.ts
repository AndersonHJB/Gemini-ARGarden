
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

export const BIOME_COLORS: Record<BiomeTheme, string[]> = {
  [BiomeTheme.Sunset]: ['#FF9A9E', '#FECFEF', '#FF6B6B', '#FAD0C4'],
  [BiomeTheme.Ocean]: ['#4FACFE', '#00F2FE', '#43E97B', '#38F9D7'],
  [BiomeTheme.Forest]: ['#11998e', '#38ef7d', '#a8e063', '#56ab2f'],
  [BiomeTheme.Lavender]: ['#E0C3FC', '#8EC5FC', '#C2E9FB', '#A18CD1']
};