import type { NangoSync } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const proxyConfig = {
        endpoint: '/v1/eeoc',
        params: {
            per_page: 500
        }
    };
    for await (const eeoc of (nango as any).paginate(proxyConfig)) {
        const data = eeoc.map((e: any) => {
            return {
                ...e,
                id: `${e.application_id}/${e.candidate_id}`
            };
        });
        await nango.batchSave(data, 'GreenhouseEeoc');
    }
}
