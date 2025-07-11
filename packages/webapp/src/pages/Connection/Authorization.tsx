import { Prism } from '@mantine/prism';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mutate } from 'swr';

import { CopyText } from '../../components/CopyText';
import { Info } from '../../components/Info';
import SecretInput from '../../components/ui/input/SecretInput';
import TagsInput from '../../components/ui/input/TagsInput';
import PrismPlus from '../../components/ui/prism/PrismPlus';
import { apiRefreshConnection } from '../../hooks/useConnections';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { getLogsUrl } from '../../utils/logs';
import { formatDateToPreciseUSFormat } from '../../utils/utils';

import type { ActiveLog, ApiConnectionFull, ApiEndUser } from '@nangohq/types';
import type React from 'react';

const JSON_DISPLAY_LIMIT = 250_000;

interface AuthorizationProps {
    connection: ApiConnectionFull;
    errorLog: ActiveLog | null;
    endUser: ApiEndUser | null;
}

export const Authorization: React.FC<AuthorizationProps> = ({ connection, errorLog, endUser }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);

    const [loading, setLoading] = useState(false);

    const forceRefresh = async () => {
        setLoading(true);
        const res = await apiRefreshConnection({ connectionId: connection.connection_id }, { env, provider_config_key: connection.provider_config_key });
        setLoading(false);

        if (res.res.status === 200) {
            toast({ title: `Secrets refreshed`, variant: 'success' });
            await mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/connections/${connection.connection_id}`));
        } else {
            toast({ title: `Failed to refresh secrets`, variant: 'error' });
        }
    };

    const connectionConfig = useMemo(() => JSON.stringify(connection.connection_config, null, 4) || '{}', [connection.connection_config]);
    const connectionMetadata = useMemo(() => JSON.stringify(connection.metadata, null, 4) || '{}', [connection.metadata]);
    const rawTokenResponse = useMemo(
        () => ('raw' in connection.credentials ? JSON.stringify(connection.credentials.raw, null, 4) : '{}'),
        [connection.credentials]
    );

    return (
        <div className="mx-auto space-y-12 text-sm w-[976px]">
            {errorLog && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>
                        {connection.credentials.type === 'BASIC' || connection.credentials.type === 'API_KEY'
                            ? 'There was an error while testing credentials validity'
                            : 'There was an error refreshing the credentials'}
                        <Link
                            to={getLogsUrl({ env, operationId: errorLog.log_id, connections: connection.connection_id, day: errorLog.created_at })}
                            className="ml-1 cursor-pointer underline"
                        >
                            (logs).
                        </Link>
                    </Info>
                </div>
            )}
            <div className="grid grid-cols-3 gap-5">
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Connection ID</span>
                    <div className="text-s -ml-2">
                        <CopyText text={connection.connection_id} className=" text-white" />
                    </div>
                </div>

                {endUser?.id && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">User ID</span>
                        <span className="text-white">{endUser.id}</span>
                    </div>
                )}
                {endUser?.display_name && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">User Display Name</span>
                        <span className="text-white">{endUser.display_name}</span>
                    </div>
                )}
                {endUser?.email && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">User Email</span>
                        <span className="text-white">{endUser.email}</span>
                    </div>
                )}
                {endUser?.organization?.id && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Organization ID</span>
                        <span className="text-white">{endUser.organization.id}</span>
                    </div>
                )}
                {endUser?.organization?.display_name && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Organization Name</span>
                        <span className="text-white">{endUser.organization.display_name}</span>
                    </div>
                )}
                {connection.created_at && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Creation Date</span>
                        <span className="text-white">{formatDateToPreciseUSFormat(connection.created_at.toString())}</span>
                    </div>
                )}
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-2">Auth Type</span>
                    <span className="text-white">{connection.credentials.type || 'None'}</span>
                </div>
                {connection.credentials && connection.credentials.type === 'API_KEY' && 'apiKey' in connection.credentials && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">{connection.credentials.type}</span>
                        <SecretInput disabled defaultValue={connection.credentials.apiKey} copy={true} />
                    </div>
                )}
                {'expires_at' in connection.credentials && connection.credentials.expires_at && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Access Token Expiration</span>
                        <span className="text-white">{formatDateToPreciseUSFormat(connection.credentials.expires_at as unknown as string)}</span>
                    </div>
                )}
            </div>

            {connection.credentials &&
                (connection.credentials.type === 'BASIC' || connection.credentials.type === 'BILL' || connection.credentials.type === 'SIGNATURE') &&
                'password' in connection.credentials && (
                    <div className="flex">
                        {connection?.credentials.username && (
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-xs uppercase mb-2">Username</span>
                                <span className="text-white">{connection?.credentials.username}</span>
                            </div>
                        )}
                        {connection?.credentials.password && (
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-xs uppercase mb-1">Password</span>
                                <SecretInput disabled defaultValue={connection?.credentials?.password} copy={true} />
                            </div>
                        )}
                    </div>
                )}
            {connection.credentials && 'config_override' in connection.credentials && (
                <>
                    {connection.credentials.config_override?.client_id && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client ID Override</span>
                            <SecretInput disabled value={connection.credentials.config_override.client_id} copy={true} />
                        </div>
                    )}
                    {connection.credentials.config_override?.client_secret && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client Secret Override</span>
                            <SecretInput disabled value={connection.credentials.config_override.client_secret} copy={true} />
                        </div>
                    )}
                </>
            )}
            {connection?.credentials && 'client_id' in connection.credentials && 'client_secret' in connection.credentials && (
                <>
                    {connection.credentials.client_id && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client ID</span>
                            <SecretInput disabled value={connection.credentials.client_id} copy={true} />
                        </div>
                    )}
                    {connection.credentials.client_secret && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client Secret</span>
                            <SecretInput disabled value={connection.credentials.client_secret} copy={true} />
                        </div>
                    )}
                </>
            )}
            {connection?.credentials && 'client_certificate' in connection.credentials && 'client_private_key' in connection.credentials && (
                <>
                    {connection.credentials.client_certificate && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client Public Certificate</span>
                            <SecretInput disabled value={connection.credentials.client_certificate} copy={true} />
                        </div>
                    )}
                    {connection.credentials.client_private_key && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Client Private Key</span>
                            <SecretInput disabled value={connection.credentials.client_private_key} copy={true} />
                        </div>
                    )}
                </>
            )}
            {connection.connection_config?.oauth_scopes_override && (
                <div className="mt-8">
                    <span className="text-gray-400 text-xs uppercase mb-1">Scopes Override</span>
                    <TagsInput
                        id="scopes"
                        name="scopes"
                        readOnly
                        type="text"
                        defaultValue={
                            Array.isArray(connection.connection_config.oauth_scopes_override)
                                ? connection.connection_config.oauth_scopes_override.join(',')
                                : connection.connection_config.oauth_scopes_override
                        }
                        minLength={1}
                    />
                </div>
            )}
            {(connection.credentials?.type === 'TWO_STEP' || connection.credentials?.type === 'JWT') && (
                <div>
                    {Object.keys(connection.credentials).flatMap((key) => {
                        const privateKey = (connection.credentials as Record<string, any>)['privateKey'];
                        let value: string;
                        let label: string;
                        if (key === 'privateKey' && privateKey && typeof privateKey === 'object' && 'id' in privateKey && 'secret' in privateKey) {
                            value = `${privateKey.id}:${privateKey.secret}`;
                            label = 'PRIVATE KEY';
                        } else if (!['type', 'token', 'expires_at', 'raw'].includes(key)) {
                            value = (connection.credentials as Record<string, string>)[key];
                            label = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
                        } else {
                            return [];
                        }
                        return [
                            <div className="flex flex-col" key={key}>
                                <span className="text-gray-400 text-xs uppercase mb-1">{label}</span>
                                <SecretInput disabled defaultValue={value} copy={true} />
                            </div>
                        ];
                    })}
                </div>
            )}
            {connection.credentials && 'token' in connection.credentials && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Token</span>
                    <SecretInput disabled value={connection.credentials.token} copy={true} refreshing={loading} refresh={forceRefresh} />
                </div>
            )}
            {(connection.credentials.type === 'OAUTH2' || connection.credentials.type === 'APP') && connection.credentials.access_token && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Access Token</span>
                    <SecretInput
                        disabled
                        value={connection.credentials.access_token}
                        copy={true}
                        refreshing={loading}
                        refresh={connection.credentials.type === 'OAUTH2' && connection.credentials.refresh_token ? forceRefresh : undefined}
                    />
                </div>
            )}
            {connection.credentials.type === 'OAUTH1' && connection.credentials.oauth_token && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">OAuth Token</span>
                    <SecretInput disabled defaultValue={connection.credentials.oauth_token} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'OAUTH1' && connection.credentials.oauth_token_secret && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">OAuth Token Secret</span>
                    <SecretInput disabled defaultValue={connection.credentials.oauth_token_secret} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'TBA' && connection.credentials.token_id && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Token Id</span>
                    <SecretInput disabled defaultValue={connection.credentials.token_id} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'TBA' && connection.credentials.token_secret && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Token Secret</span>
                    <SecretInput disabled defaultValue={connection.credentials.token_secret} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'OAUTH2' && connection.credentials.refresh_token && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Refresh Token</span>
                    <SecretInput disabled value={connection.credentials.refresh_token} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'BILL' && connection.credentials.organization_id && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Organization Id</span>
                    <span className="text-white">{connection.credentials.organization_id}</span>
                </div>
            )}
            {connection.credentials.type === 'BILL' && connection.credentials.dev_key && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Dev Key</span>
                    <SecretInput disabled defaultValue={connection.credentials.dev_key} copy={true} />
                </div>
            )}
            {connection.credentials.type === 'BILL' && 'session_id' in connection.credentials && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Session ID</span>
                    <SecretInput disabled value={connection.credentials.session_id} copy={true} refreshing={loading} refresh={forceRefresh} />
                </div>
            )}
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Configuration</span>
                <Prism language="json" colorScheme="dark">
                    {connectionConfig.length < JSON_DISPLAY_LIMIT ? connectionConfig : 'Connection config too large to display'}
                </Prism>
            </div>
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Metadata</span>
                <Prism language="json" colorScheme="dark">
                    {connectionMetadata.length < JSON_DISPLAY_LIMIT ? connectionMetadata : 'Connection metadata too large to display'}
                </Prism>
            </div>
            {(connection.credentials.type === 'OAUTH1' ||
                connection.credentials.type === 'OAUTH2' ||
                connection.credentials.type === 'APP' ||
                connection.credentials.type === 'BILL' ||
                connection.credentials.type === 'TWO_STEP' ||
                connection.credentials.type === 'OAUTH2_CC' ||
                connection.credentials.type === 'CUSTOM') && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-2">Raw Token Response</span>
                    <PrismPlus language="json" colorScheme="dark">
                        {rawTokenResponse.length > JSON_DISPLAY_LIMIT ? 'Token response too large to display' : rawTokenResponse}
                    </PrismPlus>
                </div>
            )}
        </div>
    );
};
