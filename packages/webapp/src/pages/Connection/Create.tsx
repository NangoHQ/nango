import { Helmet } from 'react-helmet';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import { Button, ButtonLink } from '../../components/ui/button/Button';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthResult, ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import { useEnvironment } from '../../hooks/useEnvironment';
import { clearIntegrationsCache, useListIntegration } from '../../hooks/useIntegration';
import { globalEnv } from '../../utils/env';
import Nango from '@nangohq/frontend';
import { useUnmount, useSearchParam } from 'react-use';
import { apiConnectSessions } from '../../hooks/useConnect';
import { IconBook, IconCheck, IconChevronDown, IconChevronRight, IconHelpCircle } from '@tabler/icons-react';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../components/ui/Collapsible';
import { Input } from '../../components/ui/input/Input';
import { useUser } from '../../hooks/useUser';
import { SimpleTooltip } from '../../components/SimpleTooltip';
import { Link, useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/Command';
import { cn } from '../../utils/utils';
import type { Integration } from '@nangohq/server';
import { Skeleton } from '../../components/ui/Skeleton';
import { clearConnectionsCache } from '../../hooks/useConnections';
import { useSWRConfig } from 'swr';
import { Info } from '../../components/Info';

export const ConnectionCreate: React.FC = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const paramExtended = useSearchParam('extended');
    const paramIntegrationId = useSearchParam('integration_id');
    const navigate = useNavigate();
    const { mutate, cache } = useSWRConfig();

    const connectUI = useRef<ConnectUI>();
    const hasConnected = useRef<AuthResult | undefined>();

    const { environmentAndAccount } = useEnvironment(env);
    const { user } = useUser(true);
    const { list: listIntegration, mutate: listIntegrationMutate, loading } = useListIntegration(env);

    const [open, setOpen] = useState(false);
    const [integration, setIntegration] = useState<Integration>();
    const [testUserEmail, setTestUserEmail] = useState(user!.email);
    const [testUserId, setTestUserId] = useState(`test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`);
    const [testUserName, setTestUserName] = useState(user!.name);
    const [testOrgName, setTestOrgName] = useState('');
    const [testOrgId, setTestOrgId] = useState('');

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'close') {
                void listIntegrationMutate();
                if (hasConnected.current) {
                    toast.toast({ title: `Connected to ${hasConnected.current.providerConfigKey}`, variant: 'success' });
                    navigate(`/${env}/connections/${integration?.uniqueKey}/${hasConnected.current.connectionId}`);
                }
            } else if (event.type === 'connect') {
                void listIntegrationMutate();
                clearConnectionsCache(cache, mutate);
                clearIntegrationsCache(cache, mutate);
                hasConnected.current = event.payload;
            }
        },
        [toast]
    );

    const onClickConnectUI = () => {
        if (!environmentAndAccount) {
            return;
        }

        const nango = new Nango({
            host: environmentAndAccount.host,
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
                allowed_integrations: integration ? [integration.uniqueKey] : undefined,
                end_user: { id: testUserId, email: testUserEmail, display_name: testUserName },
                organization: testOrgId ? { id: testOrgId, display_name: testOrgName } : undefined
            });
            if ('error' in res.json) {
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 10);
    };

    useEffect(() => {
        if (paramIntegrationId && listIntegration?.integrations) {
            const exists = listIntegration.integrations.find((v) => v.uniqueKey === paramIntegrationId);
            if (exists) {
                setIntegration(exists);
            }
        }
    }, [paramIntegrationId, listIntegration]);

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Helmet>
                    <title>Create Test Connection - Nango</title>
                </Helmet>
                <div className="grid grid-cols-2 text-white">
                    <div className="pr-10 flex flex-col gap-10">
                        <h1 className="text-2xl">Create test connection</h1>
                        <div className="flex flex-col gap-4">
                            <Skeleton className="w-[100%] h-10" />
                            <Skeleton className="w-[100%]" />
                            <Skeleton className="w-[100%]" />
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <Helmet>
                <title>Create Test Connection - Nango</title>
            </Helmet>
            <div className="grid grid-cols-2 text-white">
                <div className="pr-10">
                    <div className="flex flex-col gap-8">
                        <h1 className="text-2xl">Create a test connection</h1>
                        <div className="flex flex-col gap-4">
                            <label htmlFor="integration_id">Pick an integration</label>
                            <div className="flex gap-4">
                                <Popover open={open} onOpenChange={setOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            role="combobox"
                                            variant={'select'}
                                            size={'lg'}
                                            className="justify-between grow"
                                            disabled={Boolean(paramIntegrationId)}
                                        >
                                            {integration ? (
                                                <div className="flex gap-3">
                                                    <IntegrationLogo provider={integration.provider} /> {integration.uniqueKey}
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
                                                <CommandEmpty>No integrations found.</CommandEmpty>
                                                <CommandGroup className="px-0">
                                                    {listIntegration?.integrations.map((item) => {
                                                        const checked = integration && item.uniqueKey === integration.uniqueKey;
                                                        return (
                                                            <CommandItem
                                                                key={item.uniqueKey}
                                                                value={item.uniqueKey}
                                                                onSelect={(curr) => {
                                                                    setIntegration(
                                                                        integration && curr === integration.uniqueKey
                                                                            ? undefined
                                                                            : listIntegration.integrations.find((v) => v.uniqueKey === curr)!
                                                                    );
                                                                    setOpen(false);
                                                                }}
                                                                className={cn(
                                                                    'items-center pl-2 py-2.5 justify-between text-white',
                                                                    checked && 'bg-grayscale-1000'
                                                                )}
                                                            >
                                                                <div className="flex gap-3">
                                                                    <IntegrationLogo provider={item.provider} /> {item.uniqueKey}
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

                                <Button onClick={onClickConnectUI} size="lg" disabled={!integration}>
                                    Authorize
                                </Button>
                            </div>
                        </div>

                        <Info>Test user email and name use your Nango account details.</Info>

                        {paramExtended && (
                            <Collapsible>
                                <CollapsibleTrigger className="text-grayscale-400" asChild>
                                    <Button variant={'link'} size={'auto'} className="text-sm [&[data-state=open]>svg]:rotate-90">
                                        <IconChevronRight size={18} stroke={1} className="transition-transform duration-200" /> Test user info
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-8 flex flex-col gap-8">
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_email" className="flex gap-2 items-center">
                                            Test User Email
                                            <div>
                                                <span className="text-alert-400 text-s align-super">*</span>
                                            </div>
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Email. In your production this would be your user&apos;s email.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_email"
                                            placeholder="you@email.com"
                                            autoComplete="email"
                                            type="email"
                                            value={testUserEmail}
                                            onChange={(e) => setTestUserEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_id" className="flex gap-2">
                                            Test User ID
                                            <div>
                                                <span className="text-alert-400 text-s align-super">*</span>
                                            </div>
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User ID. In your production this would be your user&apos;s id.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_id"
                                            placeholder="Your user internal ID"
                                            value={testUserId}
                                            onChange={(e) => setTestUserId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_display_name" className="flex gap-2">
                                            Test User Display Name
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Display Name. In your production this would be your user&apos;s display name.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_id"
                                            placeholder="Your user internal ID"
                                            value={testUserName}
                                            onChange={(e) => setTestUserName(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_org_id" className="flex gap-2">
                                            Test User Organization ID
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Organization ID. In your production this would be your user&apos;s organization
                                                        ID.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_org_id"
                                            placeholder="Your user's organization ID"
                                            value={testOrgId}
                                            onChange={(e) => setTestOrgId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_org_name" className="flex gap-2">
                                            Test User Organization Name
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Organization Name. In your production this would be your user&apos;s organization
                                                        name.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_org_name"
                                            placeholder="Your user's organization name"
                                            value={testOrgName}
                                            onChange={(e) => setTestOrgName(e.target.value)}
                                        />
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                        <div className="flex gap-4">
                            <ButtonLink
                                to={`/${env}/connections/create-legacy?${integration ? `providerConfigKey=${integration.uniqueKey}` : ''}`}
                                onClick={onClickConnectUI}
                                size="md"
                                variant={'link'}
                            >
                                Or use deprecated flow <IconChevronRight stroke={1} size={18} />
                            </ButtonLink>
                        </div>
                    </div>
                </div>
                <div className="border-l border-l-grayscale-800 pl-10">
                    <div className="flex flex-col gap-10">
                        <h1 className="text-2xl">Embed in your app</h1>
                        <a
                            className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card focus:shadow-card focus:border-gray-600 focus:outline-0"
                            href="https://docs.nango.dev/integrate/guides/authorize-an-api"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <header className="flex justify-between">
                                <div className="flex gap-3 items-start">
                                    <h2>Authorize users from your app</h2>
                                </div>
                                <div className="rounded-full border border-grayscale-700 p-1.5 h-8 w-8">
                                    <IconBook stroke={1} size={18} />
                                </div>
                            </header>
                            <main>
                                <p className="text-sm text-grayscale-400">
                                    Learn how to embed Nango in your app to let users authorize 3rd-party APIs seamlessly.
                                </p>
                            </main>
                        </a>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};
