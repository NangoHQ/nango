import { Badge } from '@/components-v2/ui/badge';

export const SessionStartedChatComponent: React.FC<{ session_id: string }> = ({ session_id }) => {
    return (
        <div className="flex items-center gap-2">
            <Badge variant="mint">Session started</Badge>
            <span className="text-text-subtle text-xs font-mono">{session_id}</span>
        </div>
    );
};
