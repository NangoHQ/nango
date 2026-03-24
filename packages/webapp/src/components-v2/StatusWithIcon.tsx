import { cva } from 'class-variance-authority';

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const statusVariants = cva('flex items-center justify-center [&_svg]:size-4.5 [&_svg]:stroke-1.6', {
    variants: {
        variant: {
            success: '[&_svg]:fill-feedback-success-bg [&_svg]:stroke-feedback-success-fg',
            error: '[&_svg]:fill-feedback-error-bg [&_svg]:stroke-feedback-error-fg',
            warning: '[&_svg]:fill-feedback-warning-bg [&_svg]:stroke-feedback-warning-fg',
            neutral: '[&_svg]:fill-feedback-neutral-bg [&_svg]:stroke-feedback-neutral-fg'
        }
    },
    defaultVariants: {
        variant: 'error'
    }
});

interface StatusWithIconProps extends VariantProps<typeof statusVariants> {
    children: React.ReactNode;
    className?: string;
    tooltipContent?: string;
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
                <TooltipContent side="bottom" align="center">
                    {tooltipContent}
                </TooltipContent>
            </Tooltip>
        );
    }

    return status;
};
