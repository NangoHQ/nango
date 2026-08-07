import { cn } from '@/utils/utils';
import { CopyButton } from './CopyButton';

interface LineSnippetProps {
    snippet: string;
    className?: string;
    onCopy?: () => void;
}

export const LineSnippet: React.FC<LineSnippetProps> = ({ snippet, className, onCopy }) => {
    return (
        <div className={cn('relative flex h-8 min-w-100 overflow-hidden rounded-sm bg-surface-canvas border border-border-disabled', className)}>
            <div className="flex min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden overscroll-x-contain px-4">
                <span className="whitespace-nowrap text-text-secondary text-body-medium-regular">{snippet}</span>
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-surface-canvas to-transparent" />
            <div className="relative flex items-center pr-2">
                <CopyButton text={snippet} onCopy={onCopy} />
            </div>
        </div>
    );
};
