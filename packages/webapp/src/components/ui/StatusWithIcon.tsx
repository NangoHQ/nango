import { cva } from 'class-variance-authority';

import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const statusVariants = cva('flex items-center justify-center [&_svg]:size-4.5 [&_svg]:stroke-1.6', {
    variants: {
        variant: {
            success: '[&_svg]:fill-status-success-bg [&_svg]:stroke-status-success-text',
            error: '[&_svg]:fill-status-danger-bg [&_svg]:stroke-status-danger-text',
            warning: '[&_svg]:fill-status-warning-bg [&_svg]:stroke-status-warning-text',
            neutral: '[&_svg]:fill-transparent [&_svg]:stroke-status-neutral-text'
        }
    },
    defaultVariants: {
        variant: 'error'
    }
});

interface StatusWithIconProps extends VariantProps<typeof statusVariants> {
    children: React.ReactNode;
    className?: string;
    tooltipContent?: React.ReactNode;
}

export const StatusWithIcon: React.FC<StatusWithIconProps> = ({ variant, className, children, tooltipContent, ...props }) => {
    const status = (
        <div className={cn(statusVariants({ variant, className }))} {...props}>
            {children}
        </div>
    );

    if (tooltipContent) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{status}</TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="pointer-events-auto">
                    {tooltipContent}
                </TooltipContent>
            </Tooltip>
        );
    }

    return status;
};
