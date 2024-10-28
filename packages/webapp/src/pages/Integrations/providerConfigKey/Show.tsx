import { useParams, Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import DashboardLayout from '../../../layout/DashboardLayout';
import Button from '../../../components/ui/button/Button';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { useStore } from '../../../store';
import { PlusIcon } from '@radix-ui/react-icons';
import { useGetIntegration } from '../../../hooks/useIntegration';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Info } from '../../../components/Info';
import PageNotFound from '../../PageNotFound';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EndpointsShow } from './Endpoints/Show';
import { SettingsShow } from './Settings/Show';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '../../../components/ui/DropdownMenu';
import { IconChevronDown } from '@tabler/icons-react';
import { useEnvironment } from '../../../hooks/useEnvironment';
import type { ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import Nango from '@nangohq/frontend';
import { baseUrl } from '../../../utils/utils';
import { globalEnv } from '../../../utils/env';
import { apiConnectSessions } from '../../../hooks/useConnect';
import { useToast } from '../../../hooks/useToast';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const ref = useRef<HTMLDivElement>(null);

    const env = useStore((state) => state.env);

    const { environmentAndAccount } = useEnvironment(env);
    const { data, loading, error } = useGetIntegration(env, providerConfigKey!);
    const [tab, setTab] = useState<string>('');

    const connectUI = useRef<ConnectUI>();
    const hasConnected = useRef<string | undefined>();

    useEffect(() => {
        if (location.pathname.match(/\/settings/)) {
            setTab('settings');
        } else {
            setTab('home');
        }
    }, [location]);

    useEffect(() => {
        // Scroll top on path change, because list of endpoints can be long and the body is not scrollable
        // So clicking an endpoint will display the bottom of the next page without this
        if (ref.current && ref.current.scrollTop > 150) {
            ref.current.scrollTo({ top: 150 });
        }
    }, [location]);

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'close') {
                if (hasConnected.current) {
                    toast.toast({ title: `Connected to ${data?.integration.unique_key}`, variant: 'success' });
                    navigate(`/${env}/connections/${data?.integration.unique_key}/${hasConnected.current}`);
                }
            } else if (event.type === 'connect') {
                console.log('connected', event);
                hasConnected.current = event.payload.connectionId;
            }
        },
        [toast]
    );

    const onClickConnectUI = () => {
        if (!environmentAndAccount) {
            return;
        }

        const nango = new Nango({
            host: environmentAndAccount.host || baseUrl(),
            websocketsPath: environmentAndAccount.environment.websockets_path || '',
            publicKey: environmentAndAccount.environment.public_key
        });

        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            onEvent: onEvent
        });

        // We defer the token creation so the iframe can open and display a loading screen
        //   instead of blocking the main loop and no visual clue for the end user
        setTimeout(async () => {
            const res = await apiConnectSessions(env, { allowed_integrations: [data!.integration.unique_key] });
            if ('error' in res.json) {
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 10);
    };

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <div className="shrink-0">
                            <div className="w-[80px] h-[80px] p-5 border border-border-gray rounded-xl">
                                <Skeleton className="w-[40px] h-[40px]" />
                            </div>
                        </div>
                        <div className="my-3 flex flex-col gap-4">
                            <div className="text-left text-lg font-semibold text-gray-400">
                                <Skeleton className="w-[150px]" />
                            </div>
                            <div className="flex gap-4 items-center">
                                <Skeleton className="w-[250px]" />
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        if (error.error.code === 'not_found') {
            return <PageNotFound />;
        }

        return (
            <DashboardLayout selectedItem={LeftNavBarItems.TeamSettings}>
                <h2 className="text-3xl font-semibold text-white mb-16">Integration</h2>
                <Info variant={'destructive'}>
                    An error occurred, refresh your page or reach out to the support.{' '}
                    {error.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{error.error.payload}</span>)
                        </>
                    )}
                </Info>
            </DashboardLayout>
        );
    }

    if (!data) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations} ref={ref}>
            <div className="flex gap-4 justify-between">
                <div className="flex gap-6">
                    <div className="shrink-0">
                        <div className="w-[80px] h-[80px] p-4 border border-border-gray rounded-xl">
                            <IntegrationLogo provider={data.integration.provider} height={16} width={16} />
                        </div>
                    </div>
                    <div className="my-2">
                        <div className="text-left text-lg font-semibold text-gray-400">Integration</div>
                        <div className="flex gap-4 items-center">
                            <h2 className="text-left text-3xl font-semibold text-white break-all">{data.integration.unique_key}</h2>
                            {data.template.docs && (
                                <Link to={data.template.docs} target="_blank">
                                    <Button variant="icon" size={'xs'}>
                                        <BookOpenIcon className="h-5 w-5" />
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
                <div className="shrink-0">
                    <div className="flex items-center bg-white rounded-md">
                        <Button onClick={onClickConnectUI} className="rounded-r-none">
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Add Connection
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant={'icon'} size={'xs'} className="text-dark-500 hover:text-dark-800 focus:text-dark-800">
                                    <IconChevronDown stroke={1} size={18} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white border-white top-1">
                                <DropdownMenuItem asChild>
                                    <Link to={`/${env}/connections/create`}>
                                        <Button className="text-dark-500 hover:text-dark-800">Add Connection (headless)</Button>
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            <nav className="flex gap-2 my-11">
                <Link to="./">
                    <Button variant={tab === 'home' ? 'active' : 'zombie'}>Endpoints</Button>
                </Link>
                <Link to="./settings">
                    <Button variant={tab === 'settings' ? 'active' : 'zombie'}>Settings</Button>
                </Link>
            </nav>
            <Routes>
                <Route path="/*" element={<EndpointsShow integration={data} />} />
                <Route path="/settings" element={<SettingsShow data={data} />} />
                <Route path="*" element={<PageNotFound />} />
            </Routes>
        </DashboardLayout>
    );
};
