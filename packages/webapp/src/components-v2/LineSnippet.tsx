import { CopyButton } from './CopyButton';

export const LineSnippet: React.FC<{ snippet: string }> = ({ snippet }) => {
    return (
        <div className="inline-flex items-center justify-between gap-2 min-w-100 h-10 p-4 rounded-sm bg-bg-elevated border border-border-disabled ">
            <span className="text-text-secondary text-body-medium-regular">{snippet}</span>
            <CopyButton text={snippet} />
        </div>
    );
};
