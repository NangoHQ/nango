import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

export const Breadcrumbs = () => {
    const breadcrumbs = useBreadcrumbs();

    return (
        <div className="flex gap-1.5 items-center">
            {breadcrumbs.map((breadcrumb) => (
                <div className="group flex items-center gap-1.5" key={breadcrumb.path}>
                    <Link to={breadcrumb.path} key={breadcrumb.path}>
                        <span className="text-breadcrumb-default group-[&:last-child]:text-breadcrumb-press hover:text-breadcrumb-press transition-colors text-body-medium-medium">
                            {breadcrumb.label}
                        </span>
                    </Link>
                    <ChevronRight className="size-4 text-breadcrumb-default group-[&:last-child]:hidden" />
                </div>
            ))}
        </div>
    );
};
