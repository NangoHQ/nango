import { BookOpenIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@radix-ui/react-icons';
import { IconBolt, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { Skeleton } from '../../../components/ui/Skeleton';
import PageNotFound from '../../PageNotFound';
import { EndpointsShow } from './Endpoints/Show';
import { SettingsShow } from './Settings/Show';
import { ErrorCircle } from '../../../components/ErrorCircle';
import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { Button, ButtonLink } from '../../../components/ui/button/Button';
import { Tag } from '../../../components/ui/label/Tag';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useGetIntegration } from '../../../hooks/useIntegration';
import { apiPostPlanExtendTrial, useTrial } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';

export const ShowIntegration: React.FC = () => {
    const { toast } = useToast();
    const { providerConfigKey } = useParams();
    const location = useLocation();
    const ref = useRef<HTMLDivElement>(null);

    const env = useStore((state) => state.env);

    const { plan, mutate } = useEnvironment(env);
    const { data, loading, error } = useGetIntegration(env, providerConfigKey!);
    const [tab, setTab] = useState<string>('');
    const [trialLoading, setTrialLoading] = useState(false);

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

    const { isTrial, isTrialOver, daysRemaining } = useTrial(plan);

    const onClickTrialExtend = async () => {
        setTrialLoading(true);
        const res = await apiPostPlanExtendTrial(env);
        setTrialLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue extending your trial', variant: 'error' });
            return;
        }

        void mutate();

        toast({ title: 'Your trial was extended successfully!', variant: 'success' });
    };

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
                                <ButtonLink to={data.template.docs} target="_blank" variant="icon" size={'xs'}>
                                    <BookOpenIcon className="h-5 w-5" />
                                </ButtonLink>
                            )}
                        </div>
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
            {isTrial && (
                <div className="mb-7 rounded-md bg-grayscale-900 border border-grayscale-600 p-4 flex gap-2 justify-between items-center">
                    <div className="flex gap-2 items-center">
                        <div className="flex gap-3 items-center">
                            <ErrorCircle icon="clock" variant="warning" />
                            <Tag variant={'warning'}>{isTrialOver ? 'Trial expired' : 'Trial'}</Tag>
                            {!isTrialOver && <span className="text-white font-semibold">{daysRemaining} days left!</span>}
                        </div>
                        <div className="text-grayscale-400 text-sm">Actions & syncs are subject to a 2-week trial</div>
                    </div>
                    <div className="flex gap-2">
                        <Button size={'sm'} variant={'tertiary'} onClick={onClickTrialExtend} isLoading={trialLoading}>
                            <IconRefresh stroke={1} size={18} />
                            {isTrialOver ? 'Restart trial' : 'Extend trial'}
                        </Button>
                        <Link to={`mailto:upgrade@nango.dev?subject=Upgrade%20my%20plan%20`}>
                            <Button size={'sm'} variant={'secondary'}>
                                <IconBolt stroke={1} size={18} />
                                Upgrade plan
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
            <Routes>
                <Route path="/*" element={<EndpointsShow integration={data} />} />
                <Route path="/settings" element={<SettingsShow data={data} />} />
                <Route path="*" element={<PageNotFound />} />
            </Routes>
        </DashboardLayout>
    );
};
