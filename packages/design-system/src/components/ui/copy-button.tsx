import { Check, Copy } from 'lucide-react';
import * as React from 'react';

import { copyText } from '../../lib/clipboard';
import { IconButton } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { IconButtonProps } from './button';

/** How long the Copied state (check icon + "Copied" tooltip) stays up. */
export const COPIED_DURATION_MS = 1500;

export interface CopyButtonProps extends Omit<IconButtonProps, 'label' | 'children' | 'onClick' | 'className' | 'variant' | 'title' | 'asChild'> {
    /** Text written to the clipboard. */
    text: string;
    /** Accessible name and tooltip before copying. */
    label?: string;
    onCopy?: () => void;
}

/**
 * Ghost icon button that copies `text`, then shows a check and a "Copied" tooltip for ~1.5s.
 * 24px by default, which is the InputGroup button-addon size.
 */
export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(({ text, label = 'Copy', onCopy, size = 'xs', disabled, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false);
    const [hovered, setHovered] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    React.useEffect(() => () => clearTimeout(timer.current), []);

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        try {
            await copyText(text);
        } catch {
            return;
        }
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
        setCopied(true);
        onCopy?.();
    };

    return (
        <Tooltip open={!disabled && (hovered || copied)} onOpenChange={setHovered}>
            <TooltipTrigger asChild>
                <IconButton
                    ref={ref}
                    type="button"
                    variant="ghost"
                    size={size}
                    label={copied ? 'Copied' : label}
                    // The tooltip replaces the native title
                    title=""
                    data-copied={copied}
                    disabled={disabled}
                    onClick={(e) => void handleClick(e)}
                    className="[&_svg:not([class*='size-'])]:size-3.5"
                    {...props}
                >
                    {copied ? <Check /> : <Copy />}
                </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">{copied ? 'Copied' : label}</TooltipContent>
        </Tooltip>
    );
});
CopyButton.displayName = 'CopyButton';
