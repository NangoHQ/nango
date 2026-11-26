import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import type { IconButtonProps } from '@nangohq/design-system';

/** `tooltip` is shorter visible text, for when the context names the target. `label` stays the accessible name. */
export const TooltipIconButton: React.FC<IconButtonProps & { label: string; tooltip?: string }> = ({ label, tooltip = label, ...props }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            {/* An empty title stops IconButton's native tooltip from showing next to this one. */}
            <IconButton label={label} {...props} title="" />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
);
