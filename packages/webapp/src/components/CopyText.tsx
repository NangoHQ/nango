import { useState, useEffect, useRef } from 'react';
import type { ClassValue } from 'clsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/Tooltip';
import { IconCopy } from '@tabler/icons-react';
import { cn } from '../utils/utils';

export const CopyText: React.FC<{ text: string; showOnHover?: boolean; className?: ClassValue }> = ({ text, showOnHover, className }) => {
    const [tooltipText, setTooltipText] = useState('Copy');
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
            setTooltipText('Copy');
        }, 1000);

        return () => {
            clearTimeout(timer);
        };
    }, [tooltipText]);

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
                <button
                    className={cn(
                        'group transition-colors inline-flex max-w-full items-center gap-1.5 text-dark-400 border border-transparent px-2 py-0.5 rounded-md hover:border-dark-500 hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        className
                    )}
                    onClick={copyToClipboard}
                    ref={triggerRef}
                >
                    <div className="truncate">{text}</div>
                    <div className={cn('text-xs text-white', showOnHover && 'transition-opacity opacity-0 group-hover:opacity-100')}>
                        <IconCopy stroke={1} size={15} />
                    </div>
                </button>
            </TooltipTrigger>
            <TooltipContent
                sideOffset={10}
                align="end"
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
