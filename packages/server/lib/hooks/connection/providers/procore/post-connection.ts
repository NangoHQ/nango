import { isAxiosError } from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

interface ProcoreCompany {
    id: number;
    is_active: boolean;
    logo_url?: string;
    my_company: boolean;
    name: string;
    pcn_business_experience: boolean;
    company_home_url?: string;
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    if (connection.connection_config['companyId']) {
        return;
    }

    const response = await nango.proxy<ProcoreCompany[]>({
        endpoint: '/rest/v1.0/companies',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response) || !response || !response.data || response.data.length === 0) {
        return;
    }

    const firstCompany = response.data[0];

    if (!firstCompany?.id) {
        return;
    }

    await nango.updateConnectionConfig({
        companyId: firstCompany.id.toString()
    });
}
