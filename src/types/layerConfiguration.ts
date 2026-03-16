import { Layer } from "../mapHelpers";

export interface LayerColorOverride {
  color: string;
  target?: "stroke" | "fill";
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
