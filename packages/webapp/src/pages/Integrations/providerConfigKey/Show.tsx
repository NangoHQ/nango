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
import { Info } from '../../../components/Info';
import PageNotFound from '../../PageNotFound';
import { useEffect, useState } from 'react';
import { EndpointsShow } from './Endpoints/Show';
import { SettingsShow } from './Settings/Show';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const location = useLocation();
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
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
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
                    <Link to={`/${env}/connections/create/${data.integration.unique_key}`}>
                        <Button variant="primary" size="sm">
                            <PlusIcon />
                            Add Connection
                        </Button>
                    </Link>
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
                <Route path="/" element={<EndpointsShow integration={data} />} />
                <Route path="/settings" element={<SettingsShow data={data} />} />
                <Route path="*" element={<PageNotFound />} />
            </Routes>
        </DashboardLayout>
    );
};
