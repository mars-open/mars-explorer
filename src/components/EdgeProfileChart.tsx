import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import type { PlotHoverEvent } from "plotly.js";
import { EdgeProfilePoint } from "../pps";
import "./EdgeProfileChart.css";

const Plot = createPlotlyComponent(Plotly as never);

interface EdgeProfileChartProps {
  points: EdgeProfilePoint[];
  title: string;
  yPropertyOptions: string[];
  selectedYProperty: string;
  onChangeYProperty: (key: string) => void;
  onClose?: () => void;
  onHoverPoint?: (point: EdgeProfilePoint) => void;
  onClearHover?: () => void;
}

export function EdgeProfileChart({
  points,
  title,
  yPropertyOptions,
  selectedYProperty,
  onChangeYProperty,
  onClose,
  onHoverPoint,
  onClearHover
}: EdgeProfileChartProps) {
  const activeYProperty = selectedYProperty || yPropertyOptions[0] || "value";

  return (
    <div className="edge-profile-chart-shell">
      <div className="edge-profile-chart-header">
        <div className="edge-profile-chart-title">{title || "Edge profile"}</div>
        <div className="edge-profile-chart-controls">
          <label className="edge-profile-chart-select-label" htmlFor="edge-profile-y-select">Y</label>
          <select
            id="edge-profile-y-select"
            className="edge-profile-chart-select"
            value={activeYProperty}
            onChange={(event) => onChangeYProperty(event.target.value)}
          >
            {yPropertyOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
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
              y: points.map(point => point.yValuesByKey[activeYProperty] ?? point.yValue),
              type: 'scatter',
              mode: 'lines',
              line: { color: '#1d4ed8', width: 2 },
              hovertemplate: 's=%{x:.2f} m<br>y=%{y}<extra></extra>'
            }
          ]}
          layout={{
            margin: { l: 52, r: 18, t: 12, b: 42 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: '#ffffff',
            xaxis: { title: { text: 'Position [m]' }, zeroline: false },
            yaxis: { title: { text: activeYProperty }, zeroline: false }
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
