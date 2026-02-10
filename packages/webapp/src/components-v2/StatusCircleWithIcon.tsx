import { cva } from 'class-variance-authority';

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const statusCircleVariants = cva('size-4.5 rounded-full flex items-center justify-center [&_svg]:size-2 [&_svg]:stroke-3', {
    variants: {
        variant: {
            success: 'bg-feedback-success-bg [&>div]:bg-feedback-success-fg [&_svg]:text-feedback-success-bg',
            error: 'bg-feedback-error-bg [&>div]:bg-feedback-error-fg [&_svg]:text-feedback-error-bg',
            warning: 'bg-feedback-warning-bg [&>div]:bg-feedback-warning-fg [&_svg]:text-feedback-warning-bg'
        }
    },
    defaultVariants: {
        variant: 'error'
    }
});

interface StatusCircleWithIconProps extends VariantProps<typeof statusCircleVariants> {
    children: React.ReactNode;
    className?: string;
    tooltipContent?: string;
}

export const StatusCircleWithIcon: React.FC<StatusCircleWithIconProps> = ({ variant, className, children, tooltipContent, ...props }) => {
    const circle = (
        <div className={cn(statusCircleVariants({ variant, className }))} {...props}>
            <div className="size-3 rounded-full flex items-center justify-center">{children}</div>
        </div>
    );

    if (tooltipContent) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{circle}</TooltipTrigger>
                <TooltipContent side="top" align="center">
                    {tooltipContent}
                </TooltipContent>
            </Tooltip>
        );
    }

    return circle;
};
