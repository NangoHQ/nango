import { CopyButton } from './CopyButton';
import { cn } from '@/utils/utils';

export const LineSnippet: React.FC<{ snippet: string; className?: string }> = ({ snippet, className }) => {
    return (
        <div
            className={cn(
                'inline-flex items-center justify-between gap-2 min-w-100 h-10 p-4 rounded-sm bg-bg-elevated border border-border-disabled',
                className
            )}
        >
            <span className="text-text-secondary text-body-medium-regular">{snippet}</span>
            <CopyButton text={snippet} />
        </div>
    );
};
