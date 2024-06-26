import { useNavigate, Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useState, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import Nango, { AuthError } from '@nangohq/frontend';
import { Prism } from '@mantine/prism';
import { HelpCircle } from '@geist-ui/icons';
import { Tooltip } from '@geist-ui/core';
import type { Integration } from '@nangohq/server';

import useSet from '../../hooks/useSet';
import { isHosted, isStaging, baseUrl } from '../../utils/utils';
import { useGetIntegrationListAPI, useGetHmacAPI } from '../../utils/api';
import { useAnalyticsTrack } from '../../utils/analytics';
import DashboardLayout from '../../layout/DashboardLayout';
import TagsInput from '../../components/ui/input/TagsInput';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import SecretInput from '../../components/ui/input/SecretInput';
import SecretTextArea from '../../components/ui/input/SecretTextArea';
import { useStore } from '../../store';
import type { AuthModeType } from '@nangohq/types';
import { useEnvironment } from '../../hooks/useEnvironment';

export default function IntegrationCreate() {
    const { mutate } = useSWRConfig();
    const env = useStore((state) => state.env);

    const [loaded, setLoaded] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [integrations, setIntegrations] = useState<Integration[] | null>(null);
    const navigate = useNavigate();
    const [integration, setIntegration] = useState<Integration | null>(null);
    const [connectionId, setConnectionId] = useState<string>('test-connection-id');
    const [authMode, setAuthMode] = useState<AuthModeType>('OAUTH2');
    const [connectionConfigParams, setConnectionConfigParams] = useState<Record<string, string> | null>(null);
    const [authorizationParams, setAuthorizationParams] = useState<Record<string, string> | null>(null);
    const [authorizationParamsError, setAuthorizationParamsError] = useState<boolean>(false);
    const [selectedScopes, addToScopesSet, removeFromSelectedSet] = useSet<string>();
    const [oauthSelectedScopes, oauthAddToScopesSet, oauthRemoveFromSelectedSet] = useSet<string>();
    const [oauthccSelectedScopes, oauthccAddToScopesSet, oauthccRemoveFromSelectedSet] = useSet<string>();
    const [publicKey, setPublicKey] = useState('');
    const [hostUrl, setHostUrl] = useState('');
    const [websocketsPath, setWebsocketsPath] = useState<string>('');
    const [isHmacEnabled, setIsHmacEnabled] = useState(false);
    const [hmacDigest, setHmacDigest] = useState('');
    const getIntegrationListAPI = useGetIntegrationListAPI(env);
    const [apiKey, setApiKey] = useState('');
    const [apiAuthUsername, setApiAuthUsername] = useState('');
    const [apiAuthPassword, setApiAuthPassword] = useState('');
    const [oAuthClientId, setOAuthClientId] = useState('');
    const [tokenId, setTokenId] = useState('');
    const [tokenSecret, setTokenSecret] = useState('');
    const [oAuthClientSecret, setOAuthClientSecret] = useState('');
    const [privateKeyId, setPrivateKeyId] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [issuerId, setIssuerId] = useState('');
    const analyticsTrack = useAnalyticsTrack();
    const getHmacAPI = useGetHmacAPI(env);
    const { providerConfigKey } = useParams();
    const { environmentAndAccount } = useEnvironment(env);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getHmac = async () => {
            const res = await getHmacAPI(integration?.uniqueKey as string, connectionId);

            if (res?.status === 200) {
                const hmacDigest = (await res.json())['hmac_digest'];
                setHmacDigest(hmacDigest);
            }
        };
        if (isHmacEnabled && integration?.uniqueKey && connectionId) {
            void getHmac();
        }
    }, [isHmacEnabled, integration?.uniqueKey, connectionId]);

    useEffect(() => {
        const getIntegrations = async () => {
            const res = await getIntegrationListAPI();

            if (res?.status === 200) {
                const data = await res.json();
                setIntegrations(data['integrations']);

                if (data['integrations'] && data['integrations'].length > 0) {
                    const defaultIntegration = providerConfigKey
                        ? data['integrations'].find((i: Integration) => i.uniqueKey === providerConfigKey)
                        : data['integrations'][0];

                    setIntegration(defaultIntegration);
                    setUpConnectionConfigParams(defaultIntegration);
                    setAuthMode(defaultIntegration.authMode);
                }
            }
        };

        if (environmentAndAccount) {
            const { environment, host } = environmentAndAccount;
            setPublicKey(environment.public_key);
            setHostUrl(host || baseUrl());
            setWebsocketsPath(environment.websockets_path || '');
            setIsHmacEnabled(Boolean(environment.hmac_key));
        }

        if (!loaded) {
            setLoaded(true);
            void getIntegrations();
        }
    }, [loaded, setLoaded, setIntegrations, setIntegration, getIntegrationListAPI, environmentAndAccount, setPublicKey, providerConfigKey]);

    const handleCreate = (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            integration_unique_key: { value: string };
            connection_id: { value: string };
            connection_config_params: { value: string };
            user_scopes: { value: string };
            authorization_params: { value: string | undefined };
        };

        const nango = new Nango({ host: hostUrl, websocketsPath, publicKey });

        let credentials = {};
        let params = connectionConfigParams || {};

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        Object.keys(params).forEach((key) => params[key] === '' && delete params[key]);

        if (authMode === 'BASIC') {
            credentials = {
                username: apiAuthUsername,
                password: apiAuthPassword
            };
        }

        if (authMode === 'API_KEY') {
            credentials = {
                apiKey
            };
        }

        if (authMode === 'APP_STORE') {
            credentials = {
                privateKeyId,
                issuerId,
                privateKey
            };
        }

        if (authMode === 'OAUTH2' || authMode === 'TBA') {
            credentials = {
                oauth_client_id_override: oAuthClientId,
                oauth_client_secret_override: oAuthClientSecret
            };

            if (oauthSelectedScopes.length > 0) {
                params = {
                    ...params,
                    oauth_scopes_override: oauthSelectedScopes.join(',')
                };
            }
        }

        if (authMode === 'OAUTH2_CC') {
            credentials = {
                client_id: oAuthClientId,
                client_secret: oAuthClientSecret
            };

            if (oauthccSelectedScopes.length > 0) {
                params = {
                    ...params,
                    oauth_scopes: oauthccSelectedScopes.join(',')
                };
            }
        }

        if (authMode === 'TBA') {
            credentials = {
                ...credentials,
                token_id: tokenId,
                token_secret: tokenSecret
            };
        }

        nango[authMode === 'NONE' ? 'create' : 'auth'](target.integration_unique_key.value, target.connection_id.value, {
            user_scope: selectedScopes || [],
            params,
            authorization_params: authorizationParams || {},
            hmac: hmacDigest || '',
            credentials
        })
            .then(() => {
                toast.success('Connection created!', { position: toast.POSITION.BOTTOM_CENTER });
                analyticsTrack('web:connection_created', { provider: integration?.provider || 'unknown' });
                void mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/connection'), undefined);
                navigate(`/${env}/connections`, { replace: true });
            })
            .catch((err: unknown) => {
                setServerErrorMessage(err instanceof AuthError ? `${err.type} error: ${err.message}` : 'unknown error');
            });
    };

    const setUpConnectionConfigParams = (integration: Integration) => {
        if (integration == null) {
            return;
        }

        if (integration.connectionConfigParams == null || integration.connectionConfigParams.length === 0) {
            setConnectionConfigParams(null);
            return;
        }

        const params: Record<string, string> = {};
        for (const key of Object.keys(integration.connectionConfigParams)) {
            params[key] = '';
        }
        setConnectionConfigParams(params);
    };

    const handleIntegrationUniqueKeyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const integration: Integration | undefined = integrations?.find((i) => i.uniqueKey === e.target.value);

        if (integration != null) {
            setIntegration(integration);
            setUpConnectionConfigParams(integration);
            setAuthMode(integration.authMode);
        }
    };

    const handleConnectionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setConnectionId(e.target.value);
    };

    const handleConnectionConfigParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const params = connectionConfigParams ? Object.assign({}, connectionConfigParams) : {}; // Copy object to update UI.
        params[e.target.name.replace('connection-config-', '')] = e.target.value;
        setConnectionConfigParams(params);
    };

    const handleAuthorizationParamsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setAuthorizationParams(JSON.parse(e.target.value));
            setAuthorizationParamsError(false);
        } catch {
            setAuthorizationParams(null);
            setAuthorizationParamsError(true);
        }
    };

    const snippet = () => {
        const args = [];

        if (isStaging() || isHosted()) {
            args.push(`host: '${hostUrl}'`);
            if (websocketsPath && websocketsPath !== '/') {
                args.push(`websocketsPath: '${websocketsPath}'`);
            }
        }

        if (publicKey) {
            args.push(`publicKey: '${publicKey}'`);
        }

        const argsStr = args.length > 0 ? `{ ${args.join(', ')} }` : '';

        let connectionConfigParamsStr = '';

        // Iterate of connection config params and create a string.
        if (connectionConfigParams != null && Object.keys(connectionConfigParams).length >= 0) {
            connectionConfigParamsStr = 'params: { ';
            let hasAnyValue = false;
            for (const [key, value] of Object.entries(connectionConfigParams)) {
                if (value !== '') {
                    connectionConfigParamsStr += `${key}: '${value}', `;
                    hasAnyValue = true;
                }
            }
            connectionConfigParamsStr = connectionConfigParamsStr.slice(0, -2);
            connectionConfigParamsStr += ' }';
            if (!hasAnyValue) {
                connectionConfigParamsStr = '';
            }
        }

        if (authMode === 'OAUTH2' && oauthSelectedScopes.length > 0) {
            if (connectionConfigParamsStr) {
                connectionConfigParamsStr += ', ';
            } else {
                connectionConfigParamsStr = 'params: { ';
            }
            connectionConfigParamsStr += `oauth_scopes_override: '${oauthSelectedScopes.join(',')}', `;
            connectionConfigParamsStr = connectionConfigParamsStr.slice(0, -2);
            connectionConfigParamsStr += ' }';
        }

        let authorizationParamsStr = '';

        // Iterate of authorization params and create a string.
        if (authorizationParams != null && Object.keys(authorizationParams).length >= 0 && Object.keys(authorizationParams)[0]) {
            authorizationParamsStr = 'authorization_params: { ';
            for (const [key, value] of Object.entries(authorizationParams)) {
                authorizationParamsStr += `${key}: '${value}', `;
            }
            authorizationParamsStr = authorizationParamsStr.slice(0, -2);
            authorizationParamsStr += ' }';
        }

        let hmacKeyStr = '';

        if (hmacDigest) {
            hmacKeyStr = `hmac: '${hmacDigest}'`;
        }

        let userScopesStr = '';

        if (selectedScopes != null && selectedScopes.length > 0) {
            userScopesStr = 'user_scope: [ ';
            for (const scope of selectedScopes) {
                userScopesStr += `'${scope}', `;
            }
            userScopesStr = userScopesStr.slice(0, -2);
            userScopesStr += ' ]';
        }

        let apiAuthString = '';
        if (integration?.authMode === 'API_KEY') {
            apiAuthString = `
    credentials: {
      apiKey: '${apiKey}'
    }
  `;
        }

        if (integration?.authMode === 'BASIC') {
            apiAuthString = `
    credentials: {
      username: '${apiAuthUsername}',
      password: '${apiAuthPassword}'
    }
  `;
        }

        let appStoreAuthString = '';

        if (integration?.authMode === 'APP_STORE') {
            appStoreAuthString = `
    credentials: {
        privateKeyId: '${privateKeyId}',
        issuerId: '${issuerId}',
        privateKey: '${privateKey}'
    }
  `;
        }

        let oauthCredentialsString = '';

        if (integration?.authMode === 'OAUTH2' && oAuthClientId && oAuthClientSecret) {
            oauthCredentialsString = `
    credentials: {
        oauth_client_id_override: '${oAuthClientId}',
        oauth_client_secret_override: '${oAuthClientSecret}'
    }
  `;
        }
        let tbaCredentialsString = '';
        if (integration?.authMode === 'TBA') {
            if (oAuthClientId && oAuthClientSecret) {
                tbaCredentialsString = `
    credentials: {
        token_id: '${tokenId}',
        token_secret: '${tokenSecret}',
        oauth_client_id_override: '${oAuthClientId}',
        oauth_client_secret_override: '${oAuthClientSecret}'
    }
  `;
            } else {
                tbaCredentialsString = `
    credentials: {
        token_id: '${tokenId}',
        token_secret: '${tokenSecret}'
    }
  `;
            }
        }

        let oauth2ClientCredentialsString = '';

        if (integration?.authMode === 'OAUTH2_CC') {
            if (oAuthClientId && oAuthClientSecret) {
                oauth2ClientCredentialsString = `
    credentials: {
        client_id: '${oAuthClientId}',
        client_secret: '${oAuthClientSecret}'
    }
  `;
            }

            if (oAuthClientId && !oAuthClientSecret) {
                oauth2ClientCredentialsString = `
    credentials: {
        client_id: '${oAuthClientId}'
    }
  `;
            }

            if (!oAuthClientId && oAuthClientSecret) {
                oauth2ClientCredentialsString = `
    credentials: {
        client_secret: '${oAuthClientSecret}'
    }
  `;
            }

            if (authMode === 'OAUTH2_CC' && oauthccSelectedScopes.length > 0) {
                connectionConfigParamsStr = connectionConfigParamsStr ? `${connectionConfigParamsStr.slice(0, -2)}, ` : 'params: { ';
                connectionConfigParamsStr += `oauth_scopes: '${oauthccSelectedScopes.join(',')}' }`;
            }
        }

        const connectionConfigStr =
            !connectionConfigParamsStr &&
            !authorizationParamsStr &&
            !userScopesStr &&
            !hmacKeyStr &&
            !apiAuthString &&
            !appStoreAuthString &&
            !oauthCredentialsString &&
            !oauth2ClientCredentialsString &&
            !tbaCredentialsString
                ? ''
                : ', { ' +
                  [
                      connectionConfigParamsStr,
                      authorizationParamsStr,
                      hmacKeyStr,
                      userScopesStr,
                      apiAuthString,
                      appStoreAuthString,
                      oauthCredentialsString,
                      oauth2ClientCredentialsString,
                      tbaCredentialsString
                  ]
                      .filter(Boolean)
                      .join(', ') +
                  '}';

        return `import Nango from '@nangohq/frontend';

const nango = new Nango(${argsStr});

nango.${integration?.authMode === 'NONE' ? 'create' : 'auth'}('${integration?.uniqueKey}', '${connectionId}'${connectionConfigStr})
  .then((result: { providerConfigKey: string; connectionId: string }) => {
    // do something
  }).catch((err: { message: string; type: string }) => {
    // handle error
  });`;
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            {integrations && !!integrations.length && publicKey && hostUrl && (
                <div className="pb-40">
                    <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Connection</h2>
                    <div className="h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                        <form className="space-y-6" onSubmit={handleCreate}>
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="integration_unique_key" className="text-text-light-gray block text-sm font-semibold">
                                            Integration Unique Key
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <select
                                            id="integration_unique_key"
                                            name="integration_unique_key"
                                            className="border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                                            onChange={handleIntegrationUniqueKeyChange}
                                            defaultValue={integration?.uniqueKey}
                                        >
                                            {integrations.map((integration) => (
                                                <option key={integration.uniqueKey}>{integration.uniqueKey}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="connection_id" className="text-text-light-gray block text-sm font-semibold">
                                            Connection ID
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`The ID you will use to retrieve the connection (most often the user ID).`}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id="connection_id"
                                            name="connection_id"
                                            type="text"
                                            defaultValue={connectionId}
                                            autoComplete="new-password"
                                            required
                                            className="border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                                            onChange={handleConnectionIdChange}
                                        />
                                    </div>
                                </div>
                            </div>
                            {integration?.provider === 'slack' && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="user_scopes" className="text-text-light-gray block text-sm font-semibold">
                                            User Scopes (Slack Only)
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <TagsInput
                                            id="scopes"
                                            name="user_scopes"
                                            type="text"
                                            defaultValue={''}
                                            onChange={() => null}
                                            selectedScopes={selectedScopes}
                                            addToScopesSet={addToScopesSet}
                                            removeFromSelectedSet={removeFromSelectedSet}
                                            minLength={1}
                                        />
                                    </div>
                                </div>
                            )}

                            {authMode === 'OAUTH2_CC' && (
                                <>
                                    <div className="flex flex-col">
                                        <div className="flex items-center mb-1">
                                            <span className="text-gray-400 text-xs">Client ID</span>
                                        </div>
                                        <div className="flex text-white mt-1 items-center">
                                            <div className="w-full relative">
                                                <SecretInput
                                                    copy={true}
                                                    id="oauth_client_id"
                                                    name="oauth_client_id"
                                                    placeholder="Find the Client ID on the developer portal of the external API provider."
                                                    optionalvalue={oAuthClientId}
                                                    setoptionalvalue={setOAuthClientId}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center mb-1">
                                            <span className="text-gray-400 text-xs">Client Secret</span>
                                        </div>
                                        <div className="mt-1">
                                            <SecretInput
                                                copy={true}
                                                id="client_secret"
                                                name="client_secret"
                                                autoComplete="one-time-code"
                                                placeholder="Find the Client Secret on the developer portal of the external API provider."
                                                required
                                                optionalvalue={oAuthClientSecret}
                                                setoptionalvalue={setOAuthClientSecret}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center mb-1">
                                            <span className="text-gray-400 text-xs">Scopes</span>
                                        </div>
                                        <div className="mt-1">
                                            <TagsInput
                                                id="oauth_scopes"
                                                name="oauth_scopes"
                                                type="text"
                                                defaultValue={''}
                                                selectedScopes={oauthccSelectedScopes}
                                                addToScopesSet={oauthccAddToScopesSet}
                                                removeFromSelectedSet={oauthccRemoveFromSelectedSet}
                                                minLength={1}
                                                onChange={() => null}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {integration?.provider.includes('netsuite') && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="user_scopes" className="text-text-light-gray block text-sm font-semibold">
                                            OAuth Credentials Override
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <SecretInput
                                            copy={true}
                                            id="oauth_client_id"
                                            name="oauth_client_id"
                                            placeholder="OAuth Client ID Override"
                                            optionalvalue={oAuthClientId}
                                            setoptionalvalue={setOAuthClientId}
                                        />
                                    </div>
                                    <div className="mt-8">
                                        <SecretInput
                                            copy={true}
                                            id="oauth_client_secret"
                                            name="oauth_client_secret"
                                            placeholder="OAuth Client Secret Override"
                                            optionalvalue={oAuthClientSecret}
                                            setoptionalvalue={setOAuthClientSecret}
                                        />
                                    </div>
                                    {integration?.provider !== 'netsuite-tba' && (
                                        <>
                                            <div className="flex mt-6">
                                                <label htmlFor="oauth_scopes" className="text-text-light-gray block text-sm font-semibold">
                                                    OAuth Scope Override
                                                </label>
                                            </div>
                                            <div className="mt-1">
                                                <TagsInput
                                                    id="scopes"
                                                    name="oauth_scopes"
                                                    type="text"
                                                    defaultValue={''}
                                                    onChange={() => null}
                                                    selectedScopes={oauthSelectedScopes}
                                                    addToScopesSet={oauthAddToScopesSet}
                                                    removeFromSelectedSet={oauthRemoveFromSelectedSet}
                                                    minLength={1}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {integration?.authMode === 'TBA' && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="user_scopes" className="text-text-light-gray block text-sm font-semibold">
                                            Token ID
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <SecretInput
                                            copy={true}
                                            id="token_id"
                                            name="token_id"
                                            placeholder="Token ID"
                                            optionalvalue={tokenId}
                                            setoptionalvalue={setTokenId}
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label htmlFor="token_secret" className="text-text-light-gray block text-sm font-semibold">
                                            Token Secret
                                        </label>
                                        <SecretInput
                                            copy={true}
                                            id="token_secret"
                                            name="token_secret"
                                            placeholder="Token secret"
                                            optionalvalue={tokenSecret}
                                            setoptionalvalue={setTokenSecret}
                                        />
                                    </div>
                                </div>
                            )}

                            {integration?.connectionConfigParams?.map((paramName: string) => (
                                <div key={paramName}>
                                    <div className="flex mt-6">
                                        <label htmlFor="extra_configuration" className="text-text-light-gray block text-sm font-semibold">
                                            Extra Configuration: {paramName}
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p className="ml-1">{`Some integrations require extra configuration (cf.`}</p>
                                                        <a
                                                            href="https://docs.nango.dev/integrate/guides/authorize-an-api#apis-requiring-connection-specific-configuration-for-authorization"
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-text-blue hover:text-text-light-blue ml-1"
                                                        >
                                                            docs
                                                        </a>
                                                        <p>{`).`}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id={`connection-config-${paramName}`}
                                            name={`connection-config-${paramName}`}
                                            type="text"
                                            required
                                            autoComplete="new-password"
                                            className="border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                                            onChange={handleConnectionConfigParamsChange}
                                        />
                                    </div>
                                </div>
                            ))}

                            {(authMode === 'API_KEY' || authMode === 'BASIC') && (
                                <div>
                                    <div>
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Auth Type
                                        </label>
                                        <p className="mt-3 mb-5">{authMode}</p>
                                    </div>

                                    {authMode === 'BASIC' && (
                                        <div>
                                            <div className="flex mt-6">
                                                <label htmlFor="username" className="text-text-light-gray block text-sm font-semibold">
                                                    Username
                                                </label>
                                            </div>

                                            <div className="mt-1">
                                                <SecretInput
                                                    copy={true}
                                                    id="username"
                                                    name="username"
                                                    optionalvalue={apiAuthUsername}
                                                    setoptionalvalue={setApiAuthUsername}
                                                />
                                            </div>

                                            <div className="flex mt-6">
                                                <label htmlFor="password" className="text-text-light-gray block text-sm font-semibold">
                                                    Password
                                                </label>
                                            </div>

                                            <div className="mt-1">
                                                <SecretInput
                                                    copy={true}
                                                    id="password"
                                                    name="password"
                                                    optionalvalue={apiAuthPassword}
                                                    setoptionalvalue={setApiAuthPassword}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {authMode === 'API_KEY' && (
                                        <div>
                                            <div className="flex mt-6">
                                                <label htmlFor="connection_id" className="text-text-light-gray block text-sm font-semibold">
                                                    API Key
                                                </label>
                                                <Tooltip
                                                    text={
                                                        <>
                                                            <div className="flex text-black text-sm">
                                                                <p>{`The API key to authenticate requests`}</p>
                                                            </div>
                                                        </>
                                                    }
                                                >
                                                    <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                                </Tooltip>
                                            </div>

                                            <div className="mt-1">
                                                <SecretInput
                                                    copy={true}
                                                    id="api_key"
                                                    name="api_key"
                                                    optionalvalue={apiKey}
                                                    setoptionalvalue={setApiKey}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {authMode === 'APP' && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="optional_authorization_params" className="text-text-light-gray block text-sm font-semibold">
                                            Optional: Additional Authorization Params
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`Add query parameters in the authorization URL, on a per-connection basis. Most integrations don't require this. This should be formatted as a JSON object, e.g. { "key" : "value" }. `}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id="authorization_params"
                                            name="authorization_params"
                                            type="text"
                                            autoComplete="new-password"
                                            defaultValue="{ }"
                                            className={`${authorizationParamsError ? 'border-red-700' : 'border-border-gray'}  ${
                                                authorizationParamsError ? 'text-red-700' : 'text-text-light-gray'
                                            } focus:ring-white bg-active-gray block focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none`}
                                            onChange={handleAuthorizationParamsChange}
                                        />
                                    </div>
                                </div>
                            )}

                            {authMode === 'APP_STORE' && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="connection_id" className="text-text-light-gray block text-sm font-semibold">
                                            Private Key ID
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`Obtained after creating an API Key.`}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id="private_key_id"
                                            name="private_key_id"
                                            type="text"
                                            autoComplete="new-password"
                                            required
                                            className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            value={privateKeyId}
                                            onChange={(e) => setPrivateKeyId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex mt-6">
                                        <label htmlFor="issuer_id" className="text-text-light-gray block text-sm font-semibold">
                                            Issuer ID
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`is accessible in App Store Connect, under Users and Access, then Copy next to the ID`}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id="issuer_id"
                                            name="issuer_id"
                                            type="text"
                                            autoComplete="new-password"
                                            required
                                            className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                            value={issuerId}
                                            onChange={(e) => setIssuerId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex mt-6">
                                        <label htmlFor="connection_id" className="text-text-light-gray block text-sm font-semibold">
                                            Private Key
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`Obtained after creating an API Key. This value should be base64 encoded when passing to the auth call`}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>

                                    <div className="mt-1">
                                        <SecretTextArea
                                            copy={true}
                                            id="private_key"
                                            name="private_key"
                                            optionalvalue={privateKey}
                                            setoptionalvalue={(value) => setPrivateKey(value)}
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {(authMode === 'OAUTH1' || authMode === 'OAUTH2') && (
                                <div>
                                    <div className="flex mt-6">
                                        <label htmlFor="optional_authorization_params" className="text-text-light-gray block text-sm font-semibold">
                                            Optional: Additional Authorization Params
                                        </label>
                                        <Tooltip
                                            type="dark"
                                            text={
                                                <>
                                                    <div className="flex text-white text-sm">
                                                        <p>{`Add query parameters in the authorization URL, on a per-connection basis. Most integrations don't require this. This should be formatted as a JSON object, e.g. { "key" : "value" }. `}</p>
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-1">
                                        <input
                                            id="authorization_params"
                                            name="authorization_params"
                                            type="text"
                                            autoComplete="new-password"
                                            defaultValue="{ }"
                                            className={`${authorizationParamsError ? 'border-red-700' : 'border-border-gray'}  ${
                                                authorizationParamsError ? 'text-red-700' : 'text-text-light-gray'
                                            } focus:ring-white bg-active-gray block focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none`}
                                            onChange={handleAuthorizationParamsChange}
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                {serverErrorMessage && <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>}
                                <div className="flex">
                                    <button type="submit" className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                                        {authMode === 'OAUTH1' || authMode === 'OAUTH2' ? <>Start OAuth Flow</> : <>Create Connection</>}
                                    </button>
                                    <label htmlFor="email" className="text-text-light-gray block text-sm pt-5 ml-4">
                                        or from your frontend:
                                    </label>
                                </div>
                                <div>
                                    <div className="mt-6">
                                        <Prism className="transparent-code" language="typescript" colorScheme="dark">
                                            {snippet()}
                                        </Prism>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {integrations && !integrations.length && (
                <div className="mx-auto">
                    <div className="mx-16">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Connection</h2>
                        <div className="text-sm w-largebox h-40">
                            <p className="text-white text-sm">
                                You have not created any Integrations yet. Please create an{' '}
                                <Link to={`/${env}/integrations`} className="text-text-blue">
                                    Integration
                                </Link>{' '}
                                first to create a Connection. Follow the{' '}
                                <a href="https://docs.nango.dev/integrate/guides/authorize-an-api" className="text-text-blue" target="_blank" rel="noreferrer">
                                    Authorize an API guide
                                </a>{' '}
                                for more instructions.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
