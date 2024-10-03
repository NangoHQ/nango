import Nango from '@nangohq/frontend';
import { useMemo } from 'react';

import { API_HOSTNAME } from './api';

export function useNango(sessionToken: string | null) {
    const nango = useMemo(() => {
        if (!sessionToken) {
            return;
        }

        return new Nango({
            connectSessionToken: sessionToken,
            host: API_HOSTNAME
        });
    }, [sessionToken]);

    return nango;
}
