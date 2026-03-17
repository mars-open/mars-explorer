import { Layer, LayerColor } from "../mapHelpers";

export interface LayerColorOverride {
  color: LayerColor;
}

export interface LayerConfiguration {
  id: string;
  label: string;
  description?: string;
  layers: Layer[];
  interactive: string[];
  filterableTags?: string[];
  colorOverrides?: Record<string, LayerColorOverride>;
}
