import axios from 'axios';

import { hashEmailAddress } from '../../../../utils/pii.js';

import type { InternalNango as Nango } from '../../internal-nango.js';

interface CalendarListEntry {
    id?: string;
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<CalendarListEntry>({
        endpoint: '/calendar/v3/users/me/calendarList/primary',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response?.data?.id) {
        return;
    }

    // For a user's primary calendar, the calendar id is the user's email address.
    await nango.updateConnectionConfig({ emailAddressHash: hashEmailAddress(response.data.id) });
}
