import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';

export const AppHeader: React.FC = () => {
    return (
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-border-default bg-surface-canvas px-6">
            <Breadcrumbs />
        </header>
    );
};
