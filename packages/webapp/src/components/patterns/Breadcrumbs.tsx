import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

interface BreadcrumbsProps {
    /** Render the last crumb as the page's `h1`. Off when the page shows its own title. */
    currentIsHeading: boolean;
    currentLabel?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentIsHeading, currentLabel }) => {
    const breadcrumbs = useBreadcrumbs();
    const current = breadcrumbs.at(-1);

    if (!current) {
        return null;
    }

    const ancestors = breadcrumbs.slice(0, -1);
    const CurrentTag = currentIsHeading ? 'h1' : 'span';

    return (
        <div className="flex min-w-0 items-center gap-2">
            {ancestors.length > 0 && (
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
                    {ancestors.map((breadcrumb) => (
                        <Fragment key={breadcrumb.path}>
                            <Link
                                to={breadcrumb.path}
                                className="min-w-0 truncate type-text-regular-md text-text-secondary transition-colors hover:text-text-default focus-default"
                            >
                                {breadcrumb.label}
                            </Link>
                            <ChevronRight className="size-3.5 shrink-0 text-icon-muted" />
                        </Fragment>
                    ))}
                </nav>
            )}
            <CurrentTag className="truncate type-text-medium-md text-text-default">{currentLabel ?? current.label}</CurrentTag>
        </div>
    );
};
