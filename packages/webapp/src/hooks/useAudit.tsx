import { useInfiniteQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';
import { downloadBlob } from '../utils/download';

import type { AuditAction, AuditResource, GetAuditTrail, GetAuditTrailExport } from '@nangohq/types';

interface AuditTrailFilters {
    from?: string | undefined;
    to?: string | undefined;
    resources?: AuditResource[] | undefined;
    actions?: AuditAction[] | undefined;
}

function auditFilterParams(filters: AuditTrailFilters): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.from) {
        params.append('from', filters.from);
    }
    if (filters.to) {
        params.append('to', filters.to);
    }
    if (filters.resources?.length) {
        params.append('resources', filters.resources.join(','));
    }
    if (filters.actions?.length) {
        params.append('actions', filters.actions.join(','));
    }
    return params;
}

export function useApiGetAuditTrail(filters: AuditTrailFilters, options?: { enabled?: boolean }) {
    return useInfiniteQuery<GetAuditTrail['Success'], APIError, { pages: GetAuditTrail['Success'][] }, unknown[], string | null>({
        enabled: options?.enabled ?? true,
        queryKey: ['audit-trail:infinite', filters.from ?? null, filters.to ?? null, filters.resources ?? null, filters.actions ?? null],
        queryFn: async ({ pageParam, signal }) => {
            const params = auditFilterParams(filters);
            if (pageParam) {
                params.append('cursor', pageParam);
            }

            const qs = params.toString();
            const res = await apiFetch(`/api/v1/audit-trail${qs ? `?${qs}` : ''}`, { method: 'GET', signal });
            const json = (await res.json()) as GetAuditTrail['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
        refetchOnWindowFocus: false
    });
}

export async function apiAuditTrailExport(filters: AuditTrailFilters): Promise<{ truncated: boolean }> {
    const qs = auditFilterParams(filters).toString();
    const res = await apiFetch(`/api/v1/audit-trail/export${qs ? `?${qs}` : ''}`, { method: 'GET' });
    if (!res.ok) {
        const json = (await res.json()) as GetAuditTrailExport['Errors'];
        throw new APIError({ res, json });
    }

    downloadBlob(await res.blob(), 'nango-audit-trail.csv');

    return { truncated: res.headers.get('x-nango-audit-export-truncated') === 'true' };
}
