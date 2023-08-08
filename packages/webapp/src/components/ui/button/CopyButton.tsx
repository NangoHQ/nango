import { useState, useEffect } from 'react';
import { Tooltip } from '@geist-ui/core';
import { Clipboard, Link } from '@geist-ui/icons';

interface ClipboardButtonProps {
    text: string;
    icontype?: 'clipboard' | 'link';
    textPrompt?: string;
    dark?: boolean;
}

export default function ClipboardButton({ text, icontype = 'clipboard', textPrompt = 'Copy', dark = false }: ClipboardButtonProps) {
    const [tooltipText, setTooltipText] = useState(textPrompt);

    const copyToClipboard = async () => {
        try {
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
        <Tooltip className="text-xs" text={tooltipText} type={`${dark ? 'dark': 'default'}`}>
            {icontype === 'link' ? (
                <Link color="gray" className="h-4 ml-1 cursor-pointer" onClick={copyToClipboard} />
            ) : (
                <Clipboard color="gray" className="h-4 ml-1 cursor-pointer" onClick={copyToClipboard} />
            )}
        </Tooltip>
    );
}
