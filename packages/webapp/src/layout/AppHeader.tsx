import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';

interface AppHeaderProps {
    actions?: React.ReactNode;
    breadcrumbIsHeading: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ actions, breadcrumbIsHeading }) => {
    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b-[0.5px] border-border-default bg-surface-canvas px-5">
            <Breadcrumbs currentIsHeading={breadcrumbIsHeading} />
            {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
};
