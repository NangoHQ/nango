import { useMatches } from 'react-router-dom';

export interface BreadcrumbHandle {
    breadcrumb?: string | ((params: Record<string, string | undefined>) => string);
}

export interface BreadcrumbItem {
    label: string;
    path: string;
}

export function useBreadcrumbs(): BreadcrumbItem[] {
    const matches = useMatches();

    const breadcrumbs: BreadcrumbItem[] = [];

    matches.forEach((match) => {
        const handle = match.handle as BreadcrumbHandle | undefined;
        if (!handle?.breadcrumb) {
            return;
        }

        let breadcrumb: string | undefined;

        if (typeof handle.breadcrumb === 'string') {
            breadcrumb = handle.breadcrumb;
        } else if (typeof handle.breadcrumb === 'function') {
            breadcrumb = handle.breadcrumb(match.params as Record<string, string | undefined>);
        }

        if (!breadcrumb) {
            return;
        }

        // Use the pathname from the match (it's already the full path)
        const path = match.pathname || '/';

        breadcrumbs.push({
            label: breadcrumb,
            path
        });
    });

    return breadcrumbs;
}
