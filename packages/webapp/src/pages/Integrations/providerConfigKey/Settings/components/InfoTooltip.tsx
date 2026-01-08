import { CircleQuestionMark } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

export const InfoTooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <CircleQuestionMark className="size-4 text-text-tertiary" />
            </TooltipTrigger>
            <TooltipContent>{children}</TooltipContent>
        </Tooltip>
    );
};
