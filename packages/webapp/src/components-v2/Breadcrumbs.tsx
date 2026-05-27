import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

export const Breadcrumbs = () => {
    const breadcrumbs = useBreadcrumbs();

    if (breadcrumbs.length <= 1) {
        return <div />;
    }

    return (
        <div className="flex items-center gap-2">
            {breadcrumbs.map((breadcrumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                    <div className="flex items-center gap-2" key={breadcrumb.path}>
                        <Link to={breadcrumb.path}>
                            <span className={`text-[13px] transition-colors hover:text-text-default ${isLast ? 'text-text-default' : 'text-text-muted'}`}>
                                {breadcrumb.label}
                            </span>
                        </Link>
                        {!isLast && <ChevronRight className="h-5 w-5 text-icon-secondary" />}
                    </div>
                );
            })}
        </div>
    );
};
