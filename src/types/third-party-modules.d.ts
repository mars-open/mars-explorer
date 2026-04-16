declare module "plotly.js-dist-min" {
  const Plotly: unknown;
  export default Plotly;
}

declare module "react-plotly.js/factory" {
  import { ComponentType } from "react";

  type PlotlyEventHandler = {
    bivarianceHack(event: unknown): void;
  }["bivarianceHack"];

  interface PlotlyReactProps {
    data?: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    className?: string;
    style?: Record<string, unknown>;
    useResizeHandler?: boolean;
    onHover?: PlotlyEventHandler;
    onUnhover?: PlotlyEventHandler;
  }

  export default function createPlotlyComponent(plotly: unknown): ComponentType<PlotlyReactProps>;
}

declare module "@mapbox/tile-cover" {
  export interface TileCoverLimits {
    min_zoom: number;
    max_zoom: number;
  }

  export function tiles(
    geometry: GeoJSON.Geometry,
    limits: TileCoverLimits
  ): number[][];
}
