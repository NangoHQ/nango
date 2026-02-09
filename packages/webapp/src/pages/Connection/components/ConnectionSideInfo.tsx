import { useMemo } from 'react';

import { CopyButton } from '@/components-v2/CopyButton';
import { SideInfo, SideInfoRow } from '@/components-v2/SideInfo';
import { getDisplayName } from '@/pages/Integrations/utils';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';
import { formatDateToPreciseUSFormat } from '@/utils/utils';

import type { GetConnection } from '@nangohq/types';

export const ConnectionSideInfo: React.FC<{ connectionData: GetConnection['Success']['data'] }> = ({ connectionData }) => {
    const { connection, endUser } = connectionData;

    const userName = getConnectionDisplayName({ endUser, connectionId: connection.connection_id });
    const userEmail = getEndUserEmail(endUser, connection.tags);
    const authType = connection.credentials.type ? getDisplayName(connection.credentials.type) : 'None';
    const createdAt = formatDateToPreciseUSFormat(connection.created_at);
    const accessTokenExpiresAt = useMemo(() => {
        if ('expires_at' in connection.credentials) {
            return formatDateToPreciseUSFormat(connection.credentials.expires_at);
        }
        return null;
    }, [connection.credentials]);

    return (
        <SideInfo>
            <SideInfoRow label="Connection ID">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{connection.connection_id}</span>
                    <CopyButton text={connection.connection_id} />
                </div>
            </SideInfoRow>

            {endUser && <SideInfoRow label="End user ID">{endUser.id}</SideInfoRow>}

            <SideInfoRow label="User name">{userName}</SideInfoRow>

            {userEmail && <SideInfoRow label="User email">{userEmail}</SideInfoRow>}

            <SideInfoRow label="Auth type">{authType}</SideInfoRow>

            <SideInfoRow label="Created">{createdAt}</SideInfoRow>
            {accessTokenExpiresAt && <SideInfoRow label="Access token expires at">{accessTokenExpiresAt}</SideInfoRow>}
        </SideInfo>
    );
};
