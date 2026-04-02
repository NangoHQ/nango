import { CircleCheck } from 'lucide-react';

import { Spinner } from '@/components-v2/ui/spinner';

export const LifecycleChatComponent: React.FC<{ message: string; isDone?: boolean }> = ({ message, isDone }) => {
    return (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
            {isDone ? <CircleCheck className="size-3.5 text-text-subtle" /> : <Spinner className="size-3.5 text-text-subtle" />}
            <span>{message}</span>
        </div>
    );
};
