import { Layer, LayerColor, SourceDefinition } from "../mapHelpers";

export interface LayerColorOverride {
  color: LayerColor;
}

export type SourceOverride = Omit<SourceDefinition, 'id'>;

export interface LayerConfiguration {
  id: string;
  label: string;
  description?: string;
  mapStyle?: string;
  defaultViewState?: {
    latitude: number;
    longitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
  };
  layers: Layer[];
  interactive: string[];
  filterableTags?: string[];
  colorOverrides?: Record<string, LayerColorOverride>;
  sourceOverrides?: Record<string, SourceOverride>;
}
