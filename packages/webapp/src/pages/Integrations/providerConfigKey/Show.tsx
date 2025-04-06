import { useParams, Routes, Route, useLocation } from 'react-router-dom';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import DashboardLayout from '../../../layout/DashboardLayout';
import { ButtonLink, Button } from '../../../components/ui/button/Button';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { useStore } from '../../../store';
import { Pencil1Icon, PlusIcon } from '@radix-ui/react-icons';
import { apiPatchIntegration, useGetIntegration } from '../../../hooks/useIntegration';
import { Skeleton } from '../../../components/ui/Skeleton';
import PageNotFound from '../../PageNotFound';
import { useEffect, useRef, useState } from 'react';
import { EndpointsShow } from './Endpoints/Show';
import { SettingsShow } from './Settings/Show';
import { Helmet } from 'react-helmet';
import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { Input } from '../../../components/ui/input/Input';
import { useToast } from '../../../hooks/useToast';
import { mutate } from 'swr';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const location = useLocation();
    const ref = useRef<HTMLDivElement>(null);

    const env = useStore((state) => state.env);
    const { data, loading: loadingIntegration, error } = useGetIntegration(env, providerConfigKey!);
    const { toast } = useToast();

    const [tab, setTab] = useState<string>('');
    const [showEditCustomDisplayName, setShowEditCustomDisplayName] = useState(false);
    const [customDisplayName, setCustomDisplayName] = useState('');
    const [loadingSave, setLoadingSave] = useState(false);

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

    useEffect(() => {
        if (data?.integration?.custom_display_name) {
            setCustomDisplayName(data.integration.custom_display_name);
        } else if (data?.template?.display_name) {
            setCustomDisplayName(data.template.display_name);
        }
    }, [data]);

    const onSaveCustomDisplayName = async () => {
        if (!data) {
            return;
        }
        setLoadingSave(true);
        const updated = await apiPatchIntegration(env, data.integration.unique_key, { customDisplayName });
        setLoadingSave(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: "Successfully updated integration's name", variant: 'success' });
            setShowEditCustomDisplayName(false);
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`), undefined);
        }
    };

    if (loadingIntegration) {
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
                        {showEditCustomDisplayName ? (
                            <div className="flex gap-2 grow">
                                <Input
                                    value={customDisplayName}
                                    variant={'flat'}
                                    inputSize="lg"
                                    onChange={(e) => {
                                        setCustomDisplayName(e.target.value);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            void onSaveCustomDisplayName();
                                        }
                                    }}
                                />
                                <div className="flex justify-end gap-2 items-center">
                                    <Button
                                        size={'sm'}
                                        variant={'emptyFaded'}
                                        onClick={() => {
                                            setCustomDisplayName(data.integration.custom_display_name || data.template.display_name);
                                            setShowEditCustomDisplayName(false);
                                            setLoadingSave(false);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button size={'sm'} variant={'primary'} onClick={() => onSaveCustomDisplayName()} isLoading={loadingSave}>
                                        Save
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-4 items-center">
                                <h2 className="text-left text-3xl font-semibold text-white break-all">
                                    {data.integration.custom_display_name ?? data.template.display_name}
                                </h2>
                                <div className="flex items-center">
                                    <Button variant={'icon'} onClick={() => setShowEditCustomDisplayName(true)} size={'xs'}>
                                        <Pencil1Icon />
                                    </Button>
                                    {data.template.docs && (
                                        <ButtonLink to={data.template.docs} target="_blank" variant="icon" size={'xs'}>
                                            <BookOpenIcon className="h-5 w-5" />
                                        </ButtonLink>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="shrink-0">
                    <ButtonLink to={`/${env}/connections/create?integration_id=${data.integration.unique_key}`}>
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Add Test Connection
                    </ButtonLink>
                </div>
            </div>

            <nav className="flex gap-2 my-11">
                <ButtonLink to="./" variant={tab === 'home' ? 'active' : 'zombie'}>
                    Endpoints
                </ButtonLink>
                <ButtonLink to="./settings" variant={tab === 'settings' ? 'active' : 'zombie'}>
                    Settings
                    {data.integration.missing_fields.length > 0 && <span className="ml-2 bg-yellow-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                </ButtonLink>
            </nav>
            <Routes>
                <Route path="/*" element={<EndpointsShow integration={data} />} />
                <Route path="/settings" element={<SettingsShow data={data} />} />
                <Route path="*" element={<PageNotFound />} />
            </Routes>
        </DashboardLayout>
    );
};
