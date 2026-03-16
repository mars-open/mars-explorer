import { ChangeEvent } from "react";
import "./AppBar.css";
import { LayerConfiguration } from "./types/layerConfiguration";

interface AppBarProps {
  selectedLayerConfigId: string;
  layerConfigurations: LayerConfiguration[];
  onLayerConfigChange: (id: string) => void;
  onGbmUploadClick: () => void;
}

export function AppBar({
  selectedLayerConfigId,
  layerConfigurations,
  onLayerConfigChange,
  onGbmUploadClick
}: AppBarProps) {
  const handleConfigChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onLayerConfigChange(event.target.value);
  };

  return (
    <header className="app-bar" aria-label="Application controls">
      <div className="app-bar__branding">
        <span>MARS Explorer</span>
        <p className="app-bar__subtitle">Maintenance Applications for Railway Systems</p>
      </div>
      <div className="app-bar__config">
        {selectedLayerConfigId === 'gbm' && (
          <button
            type="button"
            className="app-bar__upload-button"
            onClick={onGbmUploadClick}
            title="Upload GBM ZIP (id=<uuid>/*.json.gz)"
          >
            Upload GBM ZIP
          </button>
        )}
        <select
        id="layer-config-select"
        value={selectedLayerConfigId}
        onChange={handleConfigChange}
        >
        {layerConfigurations.map(config => (
          <option key={config.id} value={config.id} title={config.description ?? config.label}>
            {config.label}
            </option>
        ))}
        </select>
      </div>
    </header>
  );
}
