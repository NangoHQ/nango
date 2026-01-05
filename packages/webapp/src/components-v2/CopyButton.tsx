import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button';
import { cn } from '@/utils/utils';

export const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);

    const copyToClipboard = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setHasInteracted(true);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setCopied(false);
        }, 1000);

        return () => {
            clearTimeout(timer);
        };
    }, [copied]);

    // This avoids the animation from playing when the button is initially rendered
    const animationClass = hasInteracted ? 'animate-in zoom-in-45' : '';

    return (
        <Button data-copied={copied} variant="ghost" size="icon" onClick={copyToClipboard} className="group">
            <Check className={cn('size-3.5 hidden group-data-[copied=true]:inline', animationClass)} />
            <Copy className={cn('size-3.5 inline group-data-[copied=true]:hidden', animationClass)} />
        </Button>
    );
};
