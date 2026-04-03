import { Badge } from '@/components-v2/ui/badge';

interface Props {
    tool: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    input: Record<string, unknown>;
    title?: string;
    duration?: number;
}

export const ToolUpdatedChatComponent: React.FC<Props> = ({ tool, status, input, title, duration }) => {
    const inputEntries = Object.entries(input);

    return (
        <div className="flex items-center gap-2">
            <Badge variant="gray">{tool}</Badge>
            {status === 'pending' && <span className="text-body-small-regular text-text-tertiary">…</span>}
            {status === 'running' && inputEntries.length > 0 && (
                <span className="text-body-small-regular text-text-tertiary font-mono">{inputEntries.map(([k, v]) => `${k}: ${String(v)}`).join(', ')}</span>
            )}
            {status === 'completed' && (
                <>
                    {title && <span className="text-body-small-regular text-text-secondary">{title}</span>}
                    {duration !== undefined && <span className="text-body-small-regular text-text-tertiary">{duration}ms</span>}
                </>
            )}
            {status === 'error' && <span className="text-body-small-regular text-red-500">failed</span>}
        </div>
    );
};
