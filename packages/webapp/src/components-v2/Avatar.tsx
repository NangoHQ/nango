import { toAcronym } from '@/utils/avatar';

export const Avatar = ({ name }: { name: string }) => {
    const acronym = toAcronym(name);

    return (
        <div className="size-8 flex items-center justify-center rounded bg-bg-subtle border border-border-muted">
            <span className="text-text-primary text-body-medium-medium uppercase">{acronym}</span>
        </div>
    );
};
