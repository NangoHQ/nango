import { Spinner } from '@/components-v2/ui/spinner';

export const LifecycleChatComponent: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Spinner className="size-3.5 text-text-subtle" />
            <span>{message}</span>
        </div>
    );
};
