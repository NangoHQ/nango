import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

export const Breadcrumbs = () => {
    const breadcrumbs = useBreadcrumbs();
    const current = breadcrumbs.at(-1);

    if (!current) {
        return null;
    }

    const ancestors = breadcrumbs.slice(0, -1);

    return (
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
            <h1 aria-current="page" className="truncate type-text-medium-md text-text-default">
                {current.label}
            </h1>
        </nav>
    );
};
