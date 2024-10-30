import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/Tooltip';

interface SimpleTooltipProps {
    tooltipContent: React.ReactNode;
}

export function SimpleTooltip(props: React.PropsWithChildren<SimpleTooltipProps>) {
    if (!props.tooltipContent) {
        return <>{props.children}</>;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipContent>{props.tooltipContent}</TooltipContent>
                <TooltipTrigger>{props.children}</TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
}
