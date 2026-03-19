import { ReactNode } from "react";
import { Tooltip, TooltipTrigger } from "react-aria-components";
import "./HoverTooltip.css";

interface HoverTooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  delay?: number;
  placement?: React.ComponentProps<typeof Tooltip>["placement"];
}

export function HoverTooltip({
  content,
  children,
  className,
  triggerClassName,
  delay = 250,
  placement = "left"
}: HoverTooltipProps) {
  const tooltipClassName = className
    ? `app-hover-tooltip ${className}`
    : "app-hover-tooltip";

  const wrapperClassName = triggerClassName
    ? `app-hover-tooltip__trigger ${triggerClassName}`
    : "app-hover-tooltip__trigger";

  return (
    <TooltipTrigger delay={delay} closeDelay={0}>
      <span className={wrapperClassName} title={content}>
        {children}
      </span>
      <Tooltip className={tooltipClassName} placement={placement}>
        {content}
      </Tooltip>
    </TooltipTrigger>
  );
}
