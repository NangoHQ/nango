import { useState, useEffect } from 'react';
import { Tooltip } from '@geist-ui/core';
import { Link } from '@geist-ui/icons';
import { CopyIcon } from '@radix-ui/react-icons';

interface ClipboardButtonProps {
    text: string;
    icontype?: 'clipboard' | 'link';
    textPrompt?: string;
    dark?: boolean;
    classNames?: string;
}

export default function ClipboardButton({ text, icontype = 'clipboard', textPrompt = 'Copy', dark = false, classNames = '' }: ClipboardButtonProps) {
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
        <Tooltip className="text-xs" text={tooltipText} type={`${dark ? 'dark' : 'default'}`}>
            {icontype === 'link' ? (
                <Link color="gray" className={`h-4 cursor-pointer ${classNames}`} onClick={copyToClipboard} />
            ) : (
                <CopyIcon color="gray" className={`h-4 w-4 cursor-pointer ${classNames}`} onClick={copyToClipboard} />
            )}
        </Tooltip>
    );
}
