import { Check, Copy, Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@nangohq/design-system';

export const RecoveryCodes: React.FC<{ codes: string[] }> = ({ codes }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    const copyAll = async () => {
        await navigator.clipboard.writeText(codes.join('\n'));
        setCopied(true);
    };

    const downloadAll = () => {
        const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nango-recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="grid w-full grid-cols-2 gap-x-8 gap-y-1 rounded-ds-xs border-ds-hairline border-border-default bg-surface-input px-6 py-4 font-mono text-ds-sm text-text-default">
                {codes.map((code, index) => (
                    <code key={`${code}-${index}`}>{code}</code>
                ))}
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={downloadAll}>
                    <Download className="size-4" />
                    Download all
                </Button>
                <Button variant="outline" onClick={() => void copyAll()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Copied' : 'Copy all'}
                </Button>
            </div>
        </div>
    );
};
