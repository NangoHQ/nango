import { Badge } from '@/components-v2/ui/badge';

export const MessageUpdatedChatComponent: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex items-center gap-2">
            <Badge variant="gray">msg</Badge>
            <span className="text-body-small-regular text-text-tertiary font-mono">{message}</span>
        </div>
    );
};
