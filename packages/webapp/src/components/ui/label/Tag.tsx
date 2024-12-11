import { cn } from '../../../utils/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

const variants = cva('', {
    variants: {
        variant: {
            success: 'bg-success-400 border-success-400 text-success-400',
            alert: 'bg-alert-400 border-alert-400 text-alert-400',
            info: 'bg-info-400 border-info-400 text-info-400',
            warning: 'bg-warning-400 border-warning-400 text-warning-400',
            gray: 'bg-grayscale-500 border-grayscale-500 text-grayscale-500',
            neutral: 'bg-grayscale-900 border-grayscale-700 text-grayscale-100'
        }
    },
    defaultVariants: {
        variant: 'neutral'
    }
});

export const Tag: React.FC<
    {
        children: React.ReactNode;
    } & VariantProps<typeof variants>
> = ({ children, variant }) => {
    return (
        <div className={cn('inline-flex px-2 pt-[1px] border-[0.5px] bg-opacity-30 rounded', variants({ variant }))}>
            <div className={cn('uppercase text-[11px] leading-[17px]')}>{children}</div>
        </div>
    );
};
