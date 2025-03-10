import { cn } from '../../../utils/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

const variantStyles = cva('', {
    variants: {
        variant: {
            success: 'bg-success-400 border-success-400 text-success-400',
            alert: 'bg-alert-400 border-alert-400 text-alert-400',
            info: 'bg-info-400 border-info-400 text-info-400',
            warning: 'bg-warning-400 border-warning-400 text-warning-400',
            gray: 'bg-grayscale-500 border-grayscale-500 text-grayscale-500',
            gray1: 'bg-grayscale-500 border-grayscale-700 text-white',
            neutral: 'bg-grayscale-900 border-grayscale-700 text-grayscale-100'
        },
        size: {
            md: 'px-2 pt-[1px] leading-[17px] text-[12px]', // for some reasons text-s is conflicting with the color
            sm: 'px-1 pb-[1px] leading-[13px] text-[12px]'
        }
    },
    defaultVariants: {
        variant: 'neutral',
        size: 'md'
    }
});

const textCaseStyles = cva('', {
    variants: {
        textCase: {
            uppercase: 'uppercase',
            lowercase: 'lowercase',
            capitalize: 'capitalize',
            normal: 'normal-case'
        }
    },
    defaultVariants: {
        textCase: 'uppercase'
    }
});

export const Tag: React.FC<
    {
        children: React.ReactNode;
        textCase?: 'uppercase' | 'lowercase' | 'capitalize' | 'normal';
        size?: 'md' | 'sm';
    } & VariantProps<typeof variantStyles>
> = ({ children, variant, textCase, size }) => {
    return (
        <div className={cn('inline-flex border-[0.5px] bg-opacity-30 rounded', variantStyles({ variant, size }))}>
            <div className={cn(textCaseStyles({ textCase }))}>{children}</div>
        </div>
    );
};
