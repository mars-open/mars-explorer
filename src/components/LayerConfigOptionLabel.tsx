import { Text } from "react-aria-components";
import { HoverTooltip } from "./HoverTooltip";

interface LayerConfigOptionLabelProps {
  label: string;
  description?: string;
}

export function LayerConfigOptionLabel({
  label,
  description
}: LayerConfigOptionLabelProps) {
  const labelContent = (
    <div className="app-bar__select-option-body">
      <Text slot="label" className="app-bar__select-option-label">
        {label}
      </Text>
    </div>
  );

  if (!description) {
    return labelContent;
  }

  return (
    <HoverTooltip content={description} placement="left">
      {labelContent}
    </HoverTooltip>
  );
}
