import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

export const SectionHeader: React.FC = () => {
    const breadcrumbs = useBreadcrumbs();
    const current = breadcrumbs[breadcrumbs.length - 1];

    if (!current) {
        return null;
    }

    return (
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--border-default)] bg-surface-page px-6">
            <span className="text-[16px] font-medium leading-tight tracking-tight text-text-strong">{current.label}</span>
        </div>
    );
};
