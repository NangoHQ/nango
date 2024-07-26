import { useState, useEffect } from 'react';
import { CopyIcon, Link2Icon } from '@radix-ui/react-icons';
import type { ClassValue } from 'clsx';
import { cn } from '../../../utils/utils';
import Button from './Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';

interface ClipboardButtonProps {
    text: string;
    iconType?: 'clipboard' | 'link';
    textPrompt?: string;
    className?: ClassValue;
}

export const CopyButton: React.FC<ClipboardButtonProps> = ({ text, iconType = 'clipboard', textPrompt = 'Copy', className }) => {
    const [tooltipText, setTooltipText] = useState(textPrompt);

    const copyToClipboard = async (e: React.MouseEvent) => {
        try {
            e.stopPropagation();
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
                <Button variant={'icon'} onClick={copyToClipboard} size={'sm'}>
                    {iconType === 'link' ? <Link2Icon className={cn(`h-4`, className)} /> : <CopyIcon className={cn(`h-4 w-4`, className)} />}
                </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={10} className="text-white">
                {tooltipText}
            </TooltipContent>
        </Tooltip>
    );
};
