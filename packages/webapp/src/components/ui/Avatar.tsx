import { toAcronym } from '@/utils/avatar';
import { cn } from '@/utils/utils';

export const Avatar = ({ name, className }: { name: string; className?: string }) => {
    const acronym = toAcronym(name);

    return (
        <div className={cn('size-8 flex items-center justify-center rounded bg-bg-subtle border border-border-muted', className)}>
            <span className="text-text-primary text-body-medium-medium uppercase">{acronym}</span>
        </div>
    );
};
