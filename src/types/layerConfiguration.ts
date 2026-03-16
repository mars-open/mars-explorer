import { Layer } from "../LayerControl";

export interface LayerConfiguration {
  id: string;
  label: string;
  description?: string;
  layers: Layer[];
  interactive: string[];
}
