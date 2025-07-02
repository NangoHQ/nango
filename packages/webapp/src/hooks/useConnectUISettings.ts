import useSWR from 'swr';
import { apiFetch, swrFetcher } from '../utils/api';
import type { GetConnectUISettings, PostConnectUISettings } from '@nangohq/types/lib/connect-ui-settings/api';
import type { CreateConnectUISettingsInput } from '@nangohq/types/lib/connect-ui-settings/dto';

export function useConnectUISettings(env: string) {
    const { data, error, mutate } = useSWR<GetConnectUISettings['Success'], GetConnectUISettings['Errors']>(
        `/api/v1/connect-ui-settings?env=${env}`,
        swrFetcher
    );
    return { data, error, mutate };
}

export async function updateConnectUISettings(env: string, settings: CreateConnectUISettingsInput): Promise<PostConnectUISettings['Reply']> {
    const res = await apiFetch(`/api/v1/connect-ui-settings?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(settings)
    });
    return res.json();
}
