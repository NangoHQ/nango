import { Badge } from '@/components-v2/ui/badge';

interface Props {
    tokens: { input: number; output: number; total: number };
    cost: number;
    finish: string;
    duration: number;
}

export const MessageUpdatedChatComponent: React.FC<Props> = ({ tokens, cost, finish, duration }) => {
    return (
        <div className="flex items-center gap-2">
            <Badge variant="gray">{finish}</Badge>
            <span className="text-body-small-regular text-text-tertiary font-mono">
                {tokens.input}↑ {tokens.output}↓ · ${cost.toFixed(4)} · {duration}ms
            </span>
        </div>
    );
};
