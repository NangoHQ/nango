import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSearchParam, useUnmount } from 'react-use';
import { useSWRConfig } from 'swr';

import Nango from '@nangohq/frontend';

import { SimpleTooltip } from '../../../components/SimpleTooltip';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../components/ui/Command';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { Button } from '../../../components/ui/button/Button';
import { apiConnectSessions } from '../../../hooks/useConnect';
import { clearConnectionsCache } from '../../../hooks/useConnections';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { clearIntegrationsCache, useListIntegration } from '../../../hooks/useIntegration';
import { invalidateUsage, useApiGetUsage } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useUser } from '../../../hooks/useUser';
import { useStore } from '../../../store';
import { globalEnv } from '../../../utils/env';
import { cn } from '../../../utils/utils';

import type { AuthResult, ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import type { ApiIntegrationList } from '@nangohq/types';

export const CreateConnectionSelector: React.FC = () => {
    const paramIntegrationId = useSearchParam('integration_id');
    const toast = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);
    const { list: listIntegration, mutate: listIntegrationMutate, loading } = useListIntegration(env);

    const connectUI = useRef<ConnectUI>();
    const hasConnected = useRef<AuthResult | undefined>();
    const { mutate, cache } = useSWRConfig();

    const [open, setOpen] = useState(false);
    const [integration, setIntegration] = useState<ApiIntegrationList>();

    const { user } = useUser(true);
    const testUser = useMemo(() => {
        return {
            id: `test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`,
            email: user!.email,
            display_name: user!.name
        };
    }, [user]);

    const { data: usage, isLoading: usageLoading } = useApiGetUsage(env);
    const usageCapReached = useMemo(() => {
        if (usageLoading) {
            return false;
        }
        const connectionsUsage = usage?.data.find((v) => v.metric === 'connections');
        return connectionsUsage && connectionsUsage.limit && connectionsUsage.usage >= connectionsUsage.limit;
    }, [usage, usageLoading]);

    const integrationHasMissingFields = useMemo(() => {
        if (!integration) {
            return false;
        }
        return integration.missing_fields.length > 0;
    }, [integration]);

    useEffect(() => {
        if (paramIntegrationId && listIntegration) {
            const exists = listIntegration.find((v) => v.unique_key === paramIntegrationId);
            if (exists) {
                setIntegration(exists);
            }
        }
    }, [paramIntegrationId, listIntegration]);

    const onClickConnectUI = () => {
        if (!environmentAndAccount) {
            return;
        }

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
            const res = await apiConnectSessions(env, {
                allowed_integrations: integration ? [integration.unique_key] : undefined,
                end_user: testUser,
                organization: undefined
            });
            if ('error' in res.json) {
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 10);
    };

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'close') {
                void listIntegrationMutate();
                if (hasConnected.current) {
                    toast.toast({ title: `Connected to ${hasConnected.current.providerConfigKey}`, variant: 'success' });
                    navigate(`/${env}/connections/${integration?.unique_key || hasConnected.current.providerConfigKey}/${hasConnected.current.connectionId}`);
                }
            } else if (event.type === 'connect') {
                void listIntegrationMutate();
                clearConnectionsCache(cache, mutate);
                clearIntegrationsCache(cache, mutate);
                invalidateUsage(queryClient);
                hasConnected.current = event.payload;
            }
        },
        [toast, queryClient, env, navigate, integration, listIntegrationMutate, cache, mutate]
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
        return null;
    }, [usageCapReached, integrationHasMissingFields]);

    return (
        <div className="flex flex-col gap-4">
            <label htmlFor="integration_id">Pick an integration</label>
            <div className="flex gap-4">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button role="combobox" variant={'select'} size={'lg'} className="justify-between grow" disabled={Boolean(paramIntegrationId)}>
                            {integration ? (
                                <div className="flex gap-3">
                                    <IntegrationLogo provider={integration.provider} /> {integration.unique_key}
                                </div>
                            ) : (
                                'Choose from the list'
                            )}
                            <IconChevronDown stroke={1} size={18} />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        side="bottom"
                        align="start"
                        style={{ width: 'var(--radix-popover-trigger-width)' }}
                        className="bg-grayscale-900 w-full px-3"
                    >
                        <Command>
                            <CommandInput
                                placeholder="Search integrations..."
                                className="text-white ring-0 focus:ring-0 focus-visible:outline-none"
                            ></CommandInput>
                            <CommandList className="max-h-[400px]">
                                <CommandEmpty>{loading ? 'Loading integrations...' : 'No integrations found.'}</CommandEmpty>
                                <CommandGroup className="px-0">
                                    {listIntegration?.map((item) => {
                                        const checked = integration && item.unique_key === integration.unique_key;
                                        return (
                                            <CommandItem
                                                key={item.unique_key}
                                                value={item.unique_key}
                                                onSelect={(curr) => {
                                                    setIntegration(
                                                        integration && curr === integration.unique_key
                                                            ? undefined
                                                            : listIntegration.find((v) => v.unique_key === curr)!
                                                    );
                                                    setOpen(false);
                                                }}
                                                className={cn('items-center pl-2 py-2.5 justify-between text-white', checked && 'bg-grayscale-1000')}
                                            >
                                                <div className="flex gap-3">
                                                    <IntegrationLogo provider={item.provider} /> {item.unique_key}
                                                </div>
                                                <IconCheck className={cn('mr-2 h-4 w-4', checked ? 'opacity-100' : 'opacity-0')} />
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <SimpleTooltip tooltipContent={tooltipContent} side="bottom" delay={0}>
                    <Button onClick={onClickConnectUI} size="lg" disabled={usageCapReached || integrationHasMissingFields}>
                        Authorize
                    </Button>
                </SimpleTooltip>
            </div>
        </div>
    );
};
