import { useState, useEffect } from 'react';
import { Tooltip } from '@geist-ui/core';
import { CopyIcon, Link2Icon } from '@radix-ui/react-icons';
import type { ClassValue } from 'clsx';
import { cn } from '../../../utils/utils';

interface ClipboardButtonProps {
    text: string;
    icontype?: 'clipboard' | 'link';
    textPrompt?: string;
    dark?: boolean;
    className?: ClassValue;
}

export default function ClipboardButton({ text, icontype = 'clipboard', textPrompt = 'Copy', dark = false, className }: ClipboardButtonProps) {
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
        <Tooltip className="text-xs" text={tooltipText} type={dark ? 'dark' : 'default'}>
            {icontype === 'link' ? (
                <Link2Icon className={cn(`h-4 cursor-pointer text-gray-400 hover:text-white`, className)} onClick={copyToClipboard} />
            ) : (
                <CopyIcon color="gray" className={cn(`h-4 w-4 cursor-pointer`, className)} onClick={copyToClipboard} />
            )}
        </Tooltip>
    );
}
