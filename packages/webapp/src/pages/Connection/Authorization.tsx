import { useEffect, useState } from 'react';
import { Prism } from '@mantine/prism';
import { Loading } from '@geist-ui/core';

import PrismPlus from '../../components/ui/prism/PrismPlus';
import type { Connection } from '@nangohq/types';
import { formatDateToShortUSFormat } from '../../utils/utils';
import SecretInput from '../../components/ui/input/SecretInput';
import CopyButton from '../../components/ui/button/CopyButton';
import TagsInput from '../../components/ui/input/TagsInput';
import EditableField from '../../components/ui/input/EditableField';
import { useStore } from '../../store';
import { useEditConnectionMetadataAPI } from '../../utils/api';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

interface AuthorizationProps {
    connection: Connection;
    forceRefresh: () => Promise<void>;
    loaded: boolean;
    syncLoaded: boolean;
}

export default function Authorization(props: AuthorizationProps) {
    const { connection, forceRefresh, loaded } = props;
    const env = useStore((state) => state.env);
    const [refreshing, setRefreshing] = useState(false);

    const [displayName, setDisplayName] = useState<string>(connection.connection_config?.display_name || '');
    const [customerDomain, setCustomerDomain] = useState<string>(connection.connection_config?.customer_domain || '');
    const [customerEmail, setCustomerEmail] = useState<string>(connection.connection_config?.customer_email || '');

    const mergedConnectionConfig = {
        ...connection.connection_config,
        display_name: displayName,
        customer_domain: customerDomain,
        customer_email: customerEmail
    };

    const editConnectionMetadataAPI = useEditConnectionMetadataAPI(env);

    const { providerConfigKey } = useParams();

    useEffect(() => {
        setDisplayName(connection.connection_config?.display_name || '');
        setCustomerDomain(connection.connection_config?.customer_domain || '');
        setCustomerEmail(connection.connection_config?.customer_email || '');
    }, [connection]);

    const handleForceRefresh = async () => {
        setRefreshing(true);
        await forceRefresh();
        setRefreshing(false);
    };

    const handleSave = async () => {
        if (typeof providerConfigKey === 'string') {
            const res = await editConnectionMetadataAPI(connection.connection_id, providerConfigKey, undefined, displayName, customerEmail, customerDomain);

            if (res) {
                toast.success('Connection updated!', { position: toast.POSITION.BOTTOM_CENTER });
            }
        } else {
            console.error('providerConfigKey is not a string');
        }
    };

    if (!loaded) return <Loading spaceRatio={2.5} className="top-24" />;

    return (
        <div className="mx-auto space-y-12 text-sm w-[976px]">
            <div className="flex space-x-8">
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-1">Connection Display Name</span>
                    <EditableField value={displayName} onSave={handleSave} onChange={setDisplayName} dark />
                </div>
                {connection.created_at && (
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Creation Date</span>
                        <span className="text-white">{formatDateToShortUSFormat(connection.created_at.toString())}</span>
                    </div>
                )}
            </div>
            <div className="flex space-x-8">
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-1">Domain</span>
                    <EditableField value={customerDomain} onSave={handleSave} onChange={setCustomerDomain} dark />
                </div>
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-1">Connection ID</span>
                    <div className="flex items-center gap-2">
                        <span className="text-white break-all">{connection.connection_id}</span>
                        <CopyButton text={connection.connection_id} dark />
                    </div>
                </div>
            </div>
            <div className="flex space-x-8">
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-2">Customer Email</span>
                    <EditableField value={customerEmail} onChange={setCustomerEmail} onSave={handleSave} dark />
                </div>
                <div className="flex flex-col w-1/2">
                    <span className="text-gray-400 text-xs uppercase mb-2">Auth Type</span>
                    <span className="text-white">{connection.credentials.type || 'None'}</span>
                </div>
                {connection.credentials && connection.credentials.type === 'API_KEY' && 'apiKey' in connection.credentials && (
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">{connection.credentials.type}</span>
                        <SecretInput disabled defaultValue={connection.credentials.apiKey} copy={true} />
                    </div>
                )}
                {'expires_at' in connection.credentials && connection.credentials.expires_at && (
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Access Token Expiration</span>
                        <span className="text-white">{formatDateToShortUSFormat(connection.credentials.expires_at.toString())}</span>
                    </div>
                )}
            </div>
            {connection.credentials && connection.credentials.type === 'BASIC' && 'password' in connection.credentials && (
                <div className="flex">
                    {connection?.credentials.username && (
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-2">Username</span>
                            <span className="text-white">{connection?.credentials.username}</span>
                        </div>
                    )}
                    {connection?.credentials.password && (
                        <div className="flex flex-col w-1/2">
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
            {connection.credentials && 'token' in connection.credentials && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Token</span>
                    <SecretInput disabled value={refreshing ? 'Refreshing...' : connection.credentials.token} copy={true} refresh={handleForceRefresh} />
                </div>
            )}
            {(connection.credentials.type === 'OAUTH2' || connection.credentials.type === 'APP') && connection.credentials.access_token && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-1">Access Token</span>
                    <SecretInput disabled value={refreshing ? 'Refreshing...' : connection.credentials.access_token} copy={true} refresh={handleForceRefresh} />
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
                    <SecretInput disabled value={refreshing ? 'Refreshing...' : connection.credentials.refresh_token} copy={true} />
                </div>
            )}
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Configuration</span>
                <Prism language="json" colorScheme="dark">
                    {JSON.stringify(mergedConnectionConfig, null, 4) || '{}'}
                </Prism>
            </div>
            <div className="flex flex-col">
                <span className="text-gray-400 text-xs uppercase mb-2">Connection Metadata</span>
                <Prism language="json" colorScheme="dark">
                    {JSON.stringify(connection.metadata, null, 4) || '{}'}
                </Prism>
            </div>
            {(connection.credentials.type === 'OAUTH1' ||
                connection.credentials.type === 'OAUTH2' ||
                connection.credentials.type === 'APP' ||
                connection.credentials.type === 'CUSTOM') && (
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs uppercase mb-2">Raw Token Response</span>
                    <PrismPlus language="json" colorScheme="dark">
                        {JSON.stringify(connection.credentials.raw, null, 4) || '{}'}
                    </PrismPlus>
                </div>
            )}
        </div>
    );
}
