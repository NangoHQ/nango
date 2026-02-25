import { useRefreshConnection } from './useConnections';
import { useToast } from './useToast';
import { useStore } from '@/store';

import type { ApiConnectionFull } from '@nangohq/types';

export function useRefreshConnectionWithToast(connection: ApiConnectionFull, providerConfigKey: string) {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: refreshConnection, isPending: isRefreshing } = useRefreshConnection();

    const forceRefresh = async () => {
        try {
            await refreshConnection({
                params: { connectionId: connection.connection_id },
                query: { env, provider_config_key: providerConfigKey }
            });
            toast({ title: `Secrets refreshed`, variant: 'success' });
        } catch (err) {
            if (err instanceof Error && 'json' in err) {
                const apiError = err as { json: { error?: { message?: string } } };
                toast({ title: apiError.json.error?.message || `Failed to refresh secrets`, variant: 'error' });
            } else {
                toast({ title: `Failed to refresh secrets`, variant: 'error' });
            }
        }
    };

    return {
        forceRefresh,
        isRefreshing
    };
}
