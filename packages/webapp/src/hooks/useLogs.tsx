import type { SearchLogs } from '@nangohq/types';
import { useEffect, useState } from 'react';

export function useSearchLogs(env: string, body: SearchLogs['Body']) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchLogs['Success']>();
    const [error, setError] = useState<SearchLogs['Errors']>();

    async function fetchData() {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/logs/search?env=${env}`, { method: 'POST', body: JSON.stringify(body) });
            if (res.status !== 200) {
                setData(undefined);
                setError((await res.json()) as SearchLogs['Errors']);
                return;
            }

            setError(undefined);
            setData((await res.json()) as SearchLogs['Success']);
        } catch (err) {
            console.log(err);
            setData(undefined);
            setError(err as any);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!loading) {
            void fetchData();
        }

        console.log('what changed', body, env);
    }, [env, body.limit]);

    return { data, error, loading };
}
