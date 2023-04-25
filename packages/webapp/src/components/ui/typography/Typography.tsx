import React, { forwardRef } from 'react';
import { Tooltip } from '@geist-ui/core';
import { HelpCircle } from '@geist-ui/icons';
import { cva, VariantProps } from 'class-variance-authority';
import classNames from 'classnames';

const typographyStyles = cva('flex items-center text-white tracking-tight font-bold', {
    variants: {
        variant: {
            h1: 'text-4xl',
            h2: 'text-3xl',
            h3: 'text-2xl',
            h4: 'text-xl',
            h5: 'text-lg'
        }
    },
    defaultVariants: {
        variant: 'h1'
    }
});

type TypographyProps = JSX.IntrinsicElements['h1'] & {
    tooltipProps?: {
        text: React.ReactNode;
    };
} & VariantProps<typeof typographyStyles>;

const Typography = forwardRef<HTMLHeadingElement, TypographyProps>(function Typography({ tooltipProps, className, variant, children, ...props }, ref) {
    return (
        <>
            {React.createElement(
                variant ?? 'h1',
                {
                    className: classNames(typographyStyles({ className, variant })),
                    ...props,
                    ref
                },
                <>
                    {children}
                    {tooltipProps && (
                        <Tooltip text={tooltipProps.text}>
                            <HelpCircle color="white" className="h-5 ml-1"></HelpCircle>
                        </Tooltip>
                    )}
                </>
            )}
        </>
    );
});

export default Typography;
