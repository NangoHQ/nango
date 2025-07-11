import { Tooltip } from '@geist-ui/core';
import { HelpCircle } from '@geist-ui/icons';
import { cva } from 'class-variance-authority';
import classNames from 'classnames';
import React, { forwardRef } from 'react';

import type { VariantProps } from 'class-variance-authority';

const typographyStyles = cva('flex gap-2 items-center tracking-tight font-bold', {
    variants: {
        variant: {
            h1: 'text-4xl',
            h2: 'text-3xl',
            h3: 'text-2xl',
            h4: 'text-xl',
            h5: 'text-lg'
        },
        textColor: {
            white: 'text-white',
            black: 'text-black',
            gray: 'text-gray-400'
        }
    },
    defaultVariants: {
        variant: 'h1',
        textColor: 'white'
    }
});

type TypographyProps = JSX.IntrinsicElements['h1'] & {
    tooltipProps?: {
        text: React.ReactNode;
    };
} & VariantProps<typeof typographyStyles>;

const Typography = forwardRef<HTMLHeadingElement, TypographyProps>(function Typography(
    { tooltipProps, className, variant, textColor, children, ...props },
    ref
) {
    return (
        <>
            {React.createElement(
                variant ?? 'h1',
                {
                    className: classNames(typographyStyles({ className, variant, textColor })),
                    ...props,
                    ref
                },
                <>
                    {children}
                    {tooltipProps && (
                        <Tooltip text={tooltipProps.text}>
                            <HelpCircle className="h-5" />
                        </Tooltip>
                    )}
                </>
            )}
        </>
    );
});

export default Typography;
