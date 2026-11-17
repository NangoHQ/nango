import { Check, Copy } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';

import { copyText } from '../../lib/clipboard';
import { cn } from '../../lib/cn';
import { IconButton } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { IconButtonProps } from './button';

export const COPY_BUTTON_SIZES = ['2xs', 'xs', 'sm'] as const;
export type CopyButtonSize = (typeof COPY_BUTTON_SIZES)[number];

export const COPY_BUTTON_RESET_MS = 1500;

export interface CopyButtonProps extends Omit<IconButtonProps, 'variant' | 'size' | 'label' | 'children' | 'asChild' | 'loading' | 'onCopy'> {
    /** The text written to the clipboard on click. */
    value: string;
    size?: CopyButtonSize;
    /** Accessible name and resting tooltip. Make it specific when there are several on a screen, e.g. "Copy secret key". */
    label?: string;
    /** Tooltip text and screen-reader announcement after a successful copy. */
    copiedLabel?: string;
    /** Forces the copied state — for when the copy happens elsewhere (e.g. a keyboard shortcut). Leave unset to let the button manage it. */
    copied?: boolean;
    /** Called after the value has been written to the clipboard. */
    onCopy?: (value: string) => void;
}

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
    ({ value, size = 'sm', label = 'Copy', copiedLabel = 'Copied', copied: copiedProp, onCopy, onClick, disabled, className, ...props }, ref) => {
        const [copiedState, setCopiedState] = useState(false);
        const [tooltipOpen, setTooltipOpen] = useState(false);
        const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const copied = copiedProp ?? copiedState;
        // 2xs sets no icon size of its own; NAN-8095 replaces it with an inline icon button size.
        const iconSize = size === '2xs' ? 'size-3.5' : undefined;

        useEffect(() => () => clearTimeout(timer.current), []);

        const copy = async () => {
            try {
                await copyText(value);
            } catch {
                return;
            }
            setCopiedState(true);
            // Radix closes the tooltip on pointer-down; reopen it so "Copied" shows after the click.
            setTooltipOpen(true);
            // a repeat click restarts the window rather than cutting it short
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopiedState(false), COPY_BUTTON_RESET_MS);
            onCopy?.(value);
        };

        const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
            // Copy buttons often sit inside clickable rows; copying shouldn't also trigger the row.
            event.stopPropagation();
            onClick?.(event);
            // a consumer's onClick can call preventDefault() to skip the copy
            if (!event.defaultPrevented) {
                void copy();
            }
        };

        return (
            <>
                <Tooltip open={tooltipOpen && !disabled} onOpenChange={setTooltipOpen}>
                    <TooltipTrigger asChild>
                        <IconButton
                            ref={ref}
                            variant="ghost"
                            size={size}
                            label={label}
                            disabled={disabled}
                            data-copied={copied || undefined}
                            onClick={handleClick}
                            className={className}
                            {...props}
                            // the Tooltip replaces IconButton's native `title` fallback, which would show a second chip
                            title=""
                        >
                            {copied ? <Check className={cn('text-icon-success', iconSize)} /> : <Copy className={iconSize} />}
                        </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? copiedLabel : label}</TooltipContent>
                </Tooltip>
                {/* Always mounted so screen readers register the region before its text changes. Kept outside the button: aria-label overrides its content. */}
                <span role="status" aria-live="polite" className="sr-only">
                    {copied ? copiedLabel : ''}
                </span>
            </>
        );
    }
);

CopyButton.displayName = 'CopyButton';
