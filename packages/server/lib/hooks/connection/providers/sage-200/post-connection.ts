import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

interface Sage200Site {
    company_id: number;
    company_name: string;
    tenant_id: number;
    site_id: string;
    site_name: string;
    site_short_name: string;
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    // https://developer.sage.com/200-uk/docs/latest/api/get-started/site-company-info
    const response = await nango.proxy<Sage200Site[] | Sage200Site>({
        method: 'GET',
        endpoint: '/accounts/v1/sites',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response?.data) {
        return;
    }

    const site = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!site) {
        return;
    }

    const { company_id, site_id } = site;
    await nango.updateConnectionConfig({ company_id: String(company_id), site_id });
}
