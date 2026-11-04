import { Check, Copy } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { IconButton } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { IconButtonProps } from './button';

/** CopyButton only comes in the two smallest IconButton sizes — xs 24 / icon 12, sm 28 / icon 14. */
export const COPY_BUTTON_SIZES = ['xs', 'sm'] as const;
export type CopyButtonSize = (typeof COPY_BUTTON_SIZES)[number];

/** How long the check icon and "Copied" tooltip stay before reverting. */
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

        useEffect(() => () => clearTimeout(timer.current), []);

        const copy = useCallback(async () => {
            try {
                await navigator.clipboard.writeText(value);
            } catch {
                // Clipboard access denied or unavailable — don't claim a copy that didn't happen.
                return;
            }
            setCopiedState(true);
            // a repeat click restarts the window rather than cutting it short
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopiedState(false), COPY_BUTTON_RESET_MS);
            onCopy?.(value);
        }, [onCopy, value]);

        const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            // a consumer's onClick can call preventDefault() to skip the copy
            if (!event.defaultPrevented) {
                void copy();
            }
        };

        return (
            <>
                {/* Radix closes a tooltip on pointer-down; holding it open while copied keeps "Copied" visible after the click. */}
                <Tooltip open={(tooltipOpen || copied) && !disabled} onOpenChange={setTooltipOpen}>
                    <TooltipTrigger asChild>
                        <IconButton
                            ref={ref}
                            variant="ghost"
                            size={size}
                            label={label}
                            // the Tooltip replaces IconButton's native `title` fallback, which would show a second chip
                            title=""
                            disabled={disabled}
                            data-copied={copied || undefined}
                            onClick={handleClick}
                            className={className}
                            {...props}
                        >
                            {copied ? <Check className="text-icon-success" /> : <Copy />}
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
