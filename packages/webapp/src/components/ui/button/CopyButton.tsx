import { useState, useEffect, useRef } from 'react';
import { CopyIcon, Link2Icon } from '@radix-ui/react-icons';
import type { ClassValue } from 'clsx';
import { cn } from '../../../utils/utils';
import { Button } from './Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';

interface ClipboardButtonProps {
    text: string;
    iconType?: 'clipboard' | 'link';
    textPrompt?: string;
    className?: ClassValue;
}

export const CopyButton: React.FC<ClipboardButtonProps> = ({ text, iconType = 'clipboard', textPrompt = 'Copy', className }) => {
    const [tooltipText, setTooltipText] = useState(textPrompt);
    const triggerRef = useRef(null);

    const copyToClipboard = async (e: React.MouseEvent) => {
        try {
            e.stopPropagation();
            e.preventDefault();
            await navigator.clipboard.writeText(text);
            setTooltipText('Copied');
        } catch (err) {
            //this should never happen!
            console.error('Failed to copy:', err);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setTooltipText(textPrompt);
        }, 1000);

        return () => {
            clearTimeout(timer);
        };
    }, [tooltipText, textPrompt]);

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
                <Button variant={'icon'} onClick={copyToClipboard} size={'xs'} ref={triggerRef}>
                    {iconType === 'link' ? <Link2Icon className={cn(`h-4`, className)} /> : <CopyIcon className={cn(`h-4 w-4`, className)} />}
                </Button>
            </TooltipTrigger>
            <TooltipContent
                sideOffset={10}
                className="text-white"
                onPointerDownOutside={(event) => {
                    // Radix assume a click on a tooltip should close it
                    // https://github.com/radix-ui/primitives/issues/2029
                    if (event.target === triggerRef.current || (event.target as any).parentNode === triggerRef.current) {
                        event.preventDefault();
                    }
                }}
            >
                {tooltipText}
            </TooltipContent>
        </Tooltip>
    );
};
