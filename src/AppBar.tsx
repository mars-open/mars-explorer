import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue
} from "react-aria-components";
import "./AppBar.css";
import { LayerConfigOptionLabel } from "./components/LayerConfigOptionLabel";
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
  const handleConfigChange = (key: string | number | null) => {
    if (key == null) return;
    onLayerConfigChange(String(key));
  };

  return (
    <header className="app-bar" aria-label="Application controls">
      <div className="app-bar__branding">
        <span>MARS Explorer</span>
        <p className="app-bar__subtitle">Maintenance Applications for Railway Systems</p>
      </div>
      <div className="app-bar__config">
        {selectedLayerConfigId === 'gbm' && (
          <Button
            className="app-bar__upload-button"
            onPress={onGbmUploadClick}
            aria-label="Upload GBM ZIP (*.json.gz)"
          >
            Upload GBM ZIP
          </Button>
        )}
        <Select
          value={selectedLayerConfigId}
          onChange={handleConfigChange}
          aria-label="Layer configuration"
          className="app-bar__select"
        >
          <Button className="app-bar__select-button">
            <SelectValue />
            <span aria-hidden="true" className="app-bar__select-chevron">▾</span>
          </Button>
          <Popover className="app-bar__select-popover" placement="bottom end" offset={6}>
            <ListBox className="app-bar__select-listbox">
              {layerConfigurations.map(config => (
                <ListBoxItem
                  key={config.id}
                  id={config.id}
                  textValue={config.label}
                  className="app-bar__select-option"
                >
                  <LayerConfigOptionLabel
                    label={config.label}
                    description={config.description}
                  />
                </ListBoxItem>
              ))}
            </ListBox>
          </Popover>
        </Select>
      </div>
    </header>
  );
}
