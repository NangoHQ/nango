import { useParams, Link, Routes, Route, useLocation } from 'react-router-dom';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import DashboardLayout from '../../../layout/DashboardLayout';
import Button from '../../../components/ui/button/Button';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { useStore } from '../../../store';
import { PlusIcon } from '@radix-ui/react-icons';
import { useGetIntegration } from '../../../hooks/useIntegration';
import { Skeleton } from '../../../components/ui/Skeleton';
import PageNotFound from '../../PageNotFound';
import { useEffect, useRef, useState } from 'react';
import { EndpointsShow } from './Endpoints/Show';
import { SettingsShow } from './Settings/Show';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '../../../components/ui/DropdownMenu';
import { IconChevronDown } from '@tabler/icons-react';
import { Helmet } from 'react-helmet';
import { ErrorPageComponent } from '../../../components/ErrorComponent';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const location = useLocation();
    const ref = useRef<HTMLDivElement>(null);

    const env = useStore((state) => state.env);

    const { data, loading, error } = useGetIntegration(env, providerConfigKey!);
    const [tab, setTab] = useState<string>('');

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

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Helmet>
                    <title>Integration - Nango</title>
                </Helmet>
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
        return <ErrorPageComponent title="Integration" error={error} page={LeftNavBarItems.Integrations} />;
    }

    if (!data) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations} ref={ref}>
            <Helmet>
                <title>{data.integration.unique_key} - Integration - Nango</title>
            </Helmet>
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
                        <Link to={`/${env}/connections/create?integration_id=${data.integration.unique_key}`}>
                            <Button className="rounded-r-none">
                                <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                                Add Connection
                            </Button>
                        </Link>
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
                    <Button variant={tab === 'settings' ? 'active' : 'zombie'}>
                        Settings
                        {data.integration.missing_fields.length > 0 && <span className="ml-2 bg-yellow-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </Button>
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
