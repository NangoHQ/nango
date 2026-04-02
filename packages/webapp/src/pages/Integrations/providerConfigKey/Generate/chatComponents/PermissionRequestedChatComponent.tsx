import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components-v2/ui/button';

export const PermissionRequestedChatComponent: React.FC<{
    permission: string;
    patterns: string[];
    onAnswer: (response: string) => void;
}> = ({ permission, patterns, onAnswer }) => {
    return (
        <div className="rounded-lg border border-border-default bg-bg-subtle p-4 flex flex-col gap-3 max-w-2xl">
            <div className="flex items-center gap-2 text-text-secondary">
                <ShieldAlert className="size-4 shrink-0" />
                <span className="text-sm font-medium">Permission requested</span>
            </div>
            <p className="text-text-primary text-sm">{permission}</p>
            {patterns.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {patterns.map((pattern) => (
                        <li key={pattern} className="text-text-tertiary text-xs font-mono">
                            {pattern}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => onAnswer('once')}>
                    Allow once
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onAnswer('always')}>
                    Always allow
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onAnswer('reject')}>
                    Reject
                </Button>
            </div>
        </div>
    );
};
