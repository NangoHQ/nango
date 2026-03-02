import { useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSearchParam, useUnmount } from 'react-use';
import { useSWRConfig } from 'swr';

import Nango from '@nangohq/frontend';

import { IntegrationDropdown } from './IntegrationDropdown';
import { Button } from '../../../components-v2/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components-v2/ui/tooltip';
import { apiConnectSessions } from '../../../hooks/useConnect';
import { clearConnectionsCache } from '../../../hooks/useConnections';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useListIntegrations } from '../../../hooks/useIntegration';
import { GetUsageQueryKey, useApiGetUsage } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { useAnalyticsTrack } from '../../../utils/analytics';
import { globalEnv } from '../../../utils/env';
import { formatDateToPreciseUSFormat } from '../../../utils/utils';
import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components-v2/ui/card';

import type { AuthResult, ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import type { ApiIntegrationList } from '@nangohq/types';

interface CreateConnectionSelectorProps {
    integration: ApiIntegrationList | undefined;
    setIntegration: (integration: ApiIntegrationList | undefined) => void;
    testUserId: string;
    testUserEmail: string;
    testUserName: string;
    testUserTags: Record<string, string>;
    overrideAuthParams: Record<string, string>;
    overrideOauthScopes: string | undefined;
    overrideClientId: string | undefined;
    overrideClientSecret: string | undefined;
    overrideDocUrl: string | undefined;
    defaultDocUrl?: string;
    isFormValid?: boolean;
}

export const CreateConnectionSelector: React.FC<CreateConnectionSelectorProps> = ({
    integration,
    setIntegration,
    testUserId,
    testUserEmail,
    testUserName,
    testUserTags,
    overrideAuthParams,
    overrideOauthScopes,
    overrideClientId,
    overrideClientSecret,
    overrideDocUrl,
    defaultDocUrl,
    isFormValid = true
}) => {
    const paramIntegrationId = useSearchParam('integration_id');
    const toast = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);
    const { data: listIntegrationData, isLoading: listIntegrationPending } = useListIntegrations(env);

    const connectUI = useRef<ConnectUI>();
    const hasConnected = useRef<AuthResult | undefined>();
    const { mutate, cache } = useSWRConfig();
    const [isShareLinkLoading, setIsShareLinkLoading] = useState(false);

    const testUser = useMemo(() => {
        return {
            id: testUserId,
            email: testUserEmail,
            display_name: testUserName,
            tags: testUserTags
        };
    }, [testUserId, testUserEmail, testUserName, testUserTags]);

    const { data: usage, isLoading: usageLoading } = useApiGetUsage(env);
    const usageCapReached = useMemo(() => {
        if (usageLoading) {
            return false;
        }
        const connectionsUsage = usage?.data.connections;
        return connectionsUsage && connectionsUsage.limit && connectionsUsage.usage >= connectionsUsage.limit;
    }, [usage, usageLoading]);

    const integrationHasMissingFields = useMemo(() => {
        if (!integration) {
            return false;
        }

        const missingFields = integration.missing_fields.filter((field) => {
            if (field === 'oauth_client_id' && overrideClientId !== undefined) {
                return false;
            }
            if (field === 'oauth_client_secret' && overrideClientSecret !== undefined) {
                return false;
            }
            return true;
        });

        return missingFields.length > 0;
    }, [integration, overrideClientId, overrideClientSecret]);

    const createConnectSession = useCallback(async () => {
        const isOauth2 = integration && ['OAUTH2', 'OAUTH2_CC', 'MCP_OAUTH2', 'MCP_OAUTH2_GENERIC'].includes(integration.meta.authMode);

        const oauthScopesOverride = overrideOauthScopes !== undefined && overrideOauthScopes !== integration?.oauth_scopes ? overrideOauthScopes : undefined;
        const hasConnectionConfigOverrides = overrideClientId !== undefined || overrideClientSecret !== undefined || oauthScopesOverride !== undefined;
        const shouldSendDocsConnect = overrideDocUrl && overrideDocUrl !== defaultDocUrl;

        return await apiConnectSessions(env, {
            allowed_integrations: integration ? [integration.unique_key] : undefined,
            end_user: testUser,
            integrations_config_defaults: integration
                ? {
                      [integration.unique_key]: {
                          authorization_params: isOauth2 && overrideAuthParams && Object.keys(overrideAuthParams).length > 0 ? overrideAuthParams : undefined,
                          connection_config:
                              isOauth2 && hasConnectionConfigOverrides
                                  ? {
                                        oauth_client_id_override: overrideClientId,
                                        oauth_client_secret_override: overrideClientSecret,
                                        oauth_scopes_override: oauthScopesOverride
                                    }
                                  : undefined
                      }
                  }
                : undefined,
            overrides: integration
                ? {
                      [integration.unique_key]: {
                          docs_connect: shouldSendDocsConnect ? overrideDocUrl : undefined
                      }
                  }
                : undefined
        });
    }, [integration, overrideOauthScopes, overrideClientId, overrideClientSecret, overrideDocUrl, defaultDocUrl, env, testUser, overrideAuthParams]);

    const onClickConnectUI = () => {
        if (!environmentAndAccount) {
            return;
        }

        analyticsTrack('web:create_connection_button:clicked', {
            provider: integration?.provider || 'unknown'
        });

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentAndAccount.environment.websockets_path || ''
        });

        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            onEvent
        });

        // We defer the token creation so the iframe can open and display a loading screen
        //   instead of blocking the main loop and no visual clue for the end user
        setTimeout(async () => {
            const res = await createConnectSession();
            if ('error' in res.json) {
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 0);
    };

    const onClickShareConnectionLink = async () => {
        if (!environmentAndAccount) {
            return;
        }

        analyticsTrack('web:share_connection_link_button:clicked', {
            provider: integration?.provider || 'unknown'
        });

        setIsShareLinkLoading(true);
        try {
            const res = await createConnectSession();
            if (!res.res.ok || 'error' in res.json) {
                toast.toast({ title: 'Failed to create shareable link', variant: 'error' });
                return;
            }

            const { connect_link: connectLink, expires_at: expiresAt } = res.json.data;
            const shareUrl = new URL(connectLink);
            shareUrl.searchParams.set('apiURL', globalEnv.apiUrl);

            try {
                await navigator.clipboard.writeText(shareUrl.toString());
                toast.toast({
                    title: 'Shareable link copied',
                    description: `Session expires at ${formatDateToPreciseUSFormat(expiresAt)}`,
                    variant: 'success'
                });
            } catch (_) {
                toast.toast({ title: 'Failed to copy link', variant: 'error' });
            }
        } finally {
            setIsShareLinkLoading(false);
        }
    };

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'close') {
                if (hasConnected.current) {
                    toast.toast({ title: `Connected to ${hasConnected.current.providerConfigKey}`, variant: 'success' });
                    navigate(`/${env}/connections/${integration?.unique_key || hasConnected.current.providerConfigKey}/${hasConnected.current.connectionId}`);
                }
            } else if (event.type === 'connect') {
                // TODO: remove after migrating all connection operations to tanstack query
                clearConnectionsCache(cache, mutate);
                queryClient.invalidateQueries({ queryKey: ['integrations', env] });
                queryClient.invalidateQueries({ queryKey: GetUsageQueryKey });
                hasConnected.current = event.payload;
                analyticsTrack('web:connection_created', { provider: integration?.provider || 'unknown' });
            } else if (event.type === 'error') {
                analyticsTrack('web:connection_failed', {
                    provider: integration?.provider || 'unknown',
                    errorType: event.payload.errorType,
                    errorMessage: event.payload.errorMessage
                });
            }
        },
        [toast, queryClient, env, navigate, integration, cache, mutate, analyticsTrack]
    );

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    const tooltipContent = useMemo(() => {
        if (usageCapReached) {
            return (
                <p>
                    Connection limit reached.{' '}
                    <Link to={`/${env}/team/billing`} className="underline">
                        Upgrade your plan
                    </Link>{' '}
                    to get rid of connection limits.
                </p>
            );
        }
        if (integrationHasMissingFields) {
            return (
                <p>
                    This integration is not fully configured. Fill in the missing fields in the{' '}
                    <Link to={`/${env}/integrations/${integration?.unique_key}/settings`} className="underline">
                        integration settings
                    </Link>
                    .
                </p>
            );
        }
        if (!isFormValid) {
            return <p>Please fix the errors in the advanced configuration.</p>;
        }
        return null;
    }, [usageCapReached, integrationHasMissingFields, env, integration, isFormValid]);

    return (
        <Card className="bg-bg-elevated rounded border-none gap-2.5">
            <CardHeader className={'gap-4'}>
                <CardTitle>Test connection</CardTitle>
                <CardDescription>Pick an integration to test from the list below</CardDescription>
            </CardHeader>
            <CardContent className={'flex flex-col rounded gap-2.5'}>
                <div className="flex flex-col w-full">
                    <IntegrationDropdown
                        integrations={listIntegrationData?.data ?? []}
                        selectedIntegration={integration}
                        onSelect={setIntegration}
                        loading={listIntegrationPending}
                        disabled={Boolean(paramIntegrationId)}
                    />
                </div>
                <div className="flex flex-row items-start gap-3">
                    <div className="flex flex-col items-start">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-block" tabIndex={0}>
                                    <Button onClick={onClickConnectUI} size="lg" disabled={usageCapReached || integrationHasMissingFields || !isFormValid}>
                                        Authorize
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            {tooltipContent && <TooltipContent side="bottom">{tooltipContent}</TooltipContent>}
                        </Tooltip>
                    </div>
                    <div className="flex flex-row items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-block" tabIndex={0}>
                                    <Button
                                        onClick={onClickShareConnectionLink}
                                        size="lg"
                                        variant="secondary"
                                        loading={isShareLinkLoading}
                                        disabled={usageCapReached || integrationHasMissingFields || !isFormValid}
                                    >
                                        <Link2 />
                                        Share connect link
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            {tooltipContent && <TooltipContent side="bottom">{tooltipContent}</TooltipContent>}
                        </Tooltip>
                        <InfoTooltip side="top">
                            Anyone with this link can open Connect UI and finish authenticating. The link expires in 30 minutes.
                        </InfoTooltip>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
