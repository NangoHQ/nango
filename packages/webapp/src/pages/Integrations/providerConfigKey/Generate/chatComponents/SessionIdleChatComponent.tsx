import { CircleCheck } from 'lucide-react';

export const SessionIdleChatComponent: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
            <CircleCheck className="size-4 text-green-500 shrink-0" />
            <span>{message}</span>
        </div>
    );
};
