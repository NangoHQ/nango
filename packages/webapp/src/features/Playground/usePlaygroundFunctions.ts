import { useEffect, useMemo } from 'react';

import { useGetIntegrationFunctions } from '@/hooks/useIntegrationFunctions';
import { isSyncOrAction } from '@/utils/scripts';

import type { ListedNangoActionFunction, ListedNangoSyncFunction } from '@nangohq/types';

const PAGE_SIZE = 100;

export type PlaygroundFunctionRow = ListedNangoSyncFunction | ListedNangoActionFunction;

export function usePlaygroundFunctions({ env, providerConfigKey }: { env: string; providerConfigKey: string }) {
    const query = useGetIntegrationFunctions({
        env,
        providerConfigKey,
        limit: PAGE_SIZE
    });
    const { hasNextPage, isFetchingNextPage, isFetchNextPageError, isPlaceholderData, isPending, isFetching, isError, fetchNextPage, refetch } = query;

    const canUseRows = Boolean(env && providerConfigKey) && !isPlaceholderData;

    useEffect(() => {
        if (!env || !providerConfigKey || isPlaceholderData || !hasNextPage || isFetchingNextPage || isFetchNextPageError) {
            return;
        }
        void fetchNextPage();
    }, [env, providerConfigKey, isPlaceholderData, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

    const rows = useMemo(() => {
        if (!canUseRows) {
            return [];
        }
        return (query.data?.pages.flatMap((page) => page.data) ?? []).filter(isSyncOrAction);
    }, [canUseRows, query.data]);

    const ready = canUseRows && !isPending && !isFetching && !hasNextPage && !isError && !isFetchNextPageError;

    const retry = () => {
        if (hasNextPage || isFetchNextPageError) {
            void fetchNextPage();
            return;
        }
        void refetch();
    };

    return {
        rows,
        ready,
        error: canUseRows && (isError || isFetchNextPageError) ? 'Could not load functions.' : null,
        retry
    };
}
