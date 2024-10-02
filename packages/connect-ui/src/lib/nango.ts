import Nango from '@nangohq/frontend';
import { useMemo } from 'react';

export function useNango(sessionToken: string | null) {
    const nango = useMemo(() => {
        if (!sessionToken) {
            return;
        }

        return new Nango({
            publicKey: sessionToken,
            host: import.meta.env.VITE_LOCAL_HOSTNAME
        });
    }, [sessionToken]);

    return nango;
}
