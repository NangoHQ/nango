import { useMatches } from 'react-router-dom';

// Type for breadcrumb handle (for use in useBreadcrumbs hook)
// - string: static breadcrumb label
// - function: dynamic breadcrumb based on route params
export interface BreadcrumbHandle {
    breadcrumb?: string | ((params: Record<string, string | undefined>) => string);
}

export interface BreadcrumbItem {
    label: string;
    path: string;
}

/**
 * Hook to extract breadcrumbs from the current route matches.
 * Uses the `handle.breadcrumb` property from each matched route.
 *
 * @returns Array of breadcrumb items with label and path
 *
 * @example
 * ```tsx
 * const breadcrumbs = useBreadcrumbs();
 * // Returns: [{ label: 'Dashboard', path: '/dev' }, { label: 'Integrations', path: '/dev/integrations' }]
 * ```
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
    const matches = useMatches();

    const breadcrumbs: BreadcrumbItem[] = [];

    matches.forEach((match) => {
        const handle = match.handle as BreadcrumbHandle | undefined;
        if (!handle?.breadcrumb) {
            return;
        }

        let breadcrumb: string | undefined;

        // Handle different breadcrumb types
        if (typeof handle.breadcrumb === 'string') {
            breadcrumb = handle.breadcrumb;
        } else if (typeof handle.breadcrumb === 'function') {
            breadcrumb = handle.breadcrumb(match.params as Record<string, string | undefined>);
        }

        // Skip empty breadcrumbs
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
