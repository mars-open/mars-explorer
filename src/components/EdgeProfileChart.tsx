import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import type { PlotHoverEvent } from "plotly.js";
import { EdgeProfilePoint } from "../pps";
import "./EdgeProfileChart.css";

const Plot = createPlotlyComponent(Plotly as never);

interface EdgeProfileChartProps {
  points: EdgeProfilePoint[];
  title: string;
  yLabel: string;
  onClose?: () => void;
  onHoverPoint?: (point: EdgeProfilePoint) => void;
  onClearHover?: () => void;
}

export function EdgeProfileChart({ points, title, yLabel, onClose, onHoverPoint, onClearHover }: EdgeProfileChartProps) {
  return (
    <div className="edge-profile-chart-shell">
      <div className="edge-profile-chart-header">
        <div className="edge-profile-chart-title">{title || "Edge profile"}</div>
        <button
          type="button"
          className="maplibregl-ctrl-icon edge-profile-chart-close-button"
          title="Close profile"
          onClick={() => onClose?.()}
        >
          ×
        </button>
      </div>
      <div className="edge-profile-chart-body">
        <Plot
          data={[
            {
              x: points.map(point => point.xMeters),
              y: points.map(point => point.yValue),
              type: 'scatter',
              mode: 'lines+markers',
              line: { color: '#1d4ed8', width: 2 },
              marker: { color: '#ef4444', size: 5 },
              hovertemplate: 's=%{x:.2f} m<br>y=%{y}<extra></extra>'
            }
          ]}
          layout={{
            margin: { l: 52, r: 18, t: 12, b: 42 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: '#ffffff',
            xaxis: { title: { text: 'Distance along edge [m]' }, zeroline: false },
            yaxis: { title: { text: yLabel }, zeroline: false }
          }}
          config={{ responsive: true, displayModeBar: false }}
          onHover={(event: PlotHoverEvent) => {
            const pointIndex = event.points?.[0]?.pointIndex;
            if (typeof pointIndex !== 'number') return;
            const profilePoint = points[pointIndex];
            if (!profilePoint) return;
            onHoverPoint?.(profilePoint);
          }}
          onUnhover={() => onClearHover?.()}
          useResizeHandler={true}
          className="edge-profile-plot"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}

export default EdgeProfileChart;
