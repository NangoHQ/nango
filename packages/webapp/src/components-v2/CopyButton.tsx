import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button';

export const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setCopied(false);
        }, 1000);

        return () => {
            clearTimeout(timer);
        };
    }, [copied]);

    return (
        <Button data-copied={copied} variant="ghost" size="icon" onClick={copyToClipboard} className="group">
            <Check className="size-3.5 hidden group-data-[copied=true]:inline animate-in zoom-in-45" />
            <Copy className="size-3.5 inline group-data-[copied=true]:hidden animate-in zoom-in-45" />
        </Button>
    );
};
