import { useNavigate, Link } from 'react-router-dom';
import { Loading } from '@geist-ui/core';
import { PlusIcon } from '@heroicons/react/24/outline';

import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import IntegrationLogo from '../../components/ui/IntegrationLogo';

import { useStore } from '../../store';
import { useListIntegration } from '../../hooks/useIntegration';
import { ErrorCircle } from '../../components/ErrorCircle';
import { SimpleTooltip } from '../../components/SimpleTooltip';
import { Helmet } from 'react-helmet';
import { ErrorPageComponent } from '../../components/ErrorComponent';

export default function IntegrationList() {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);

    const { list: data, error } = useListIntegration(env);

    if (error) {
        return <ErrorPageComponent title="Integrations" error={error} page={LeftNavBarItems.Integrations} />;
    }

    if (!data) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Helmet>
                    <title>Integrations - Nango</title>
                </Helmet>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    const { integrations } = data;

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Helmet>
                <title>Integrations - Nango</title>
            </Helmet>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Integrations</h2>
                {integrations.length > 0 && (
                    <Link
                        to={`/${env}/integrations/create`}
                        className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Configure New Integration
                    </Link>
                )}
            </div>
            {integrations?.length > 0 && (
                <>
                    <div className="h-fit rounded-md text-white text-sm">
                        <div className="w-full">
                            <div className="flex gap-4 items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md justify-between">
                                <div className="w-2/3">Name</div>
                                <div className="w-1/3">Connections</div>
                                <div className="w-24">Active Scripts</div>
                            </div>
                            {integrations?.map(({ uniqueKey, provider, connection_count, scripts, missing_fields_count }) => (
                                <div
                                    key={`tr-${uniqueKey}`}
                                    className={`flex gap-4 ${
                                        uniqueKey !== integrations.at(-1)?.uniqueKey ? 'border-b border-border-gray' : ''
                                    } min-h-[4em] px-2 justify-between items-center hover:bg-hover-gray cursor-pointer`}
                                    onClick={() => {
                                        navigate(`/${env}/integrations/${uniqueKey}`);
                                    }}
                                >
                                    <div className="flex items-center w-2/3 gap-2 py-2 truncate">
                                        <div className="w-10 shrink-0">
                                            <IntegrationLogo provider={provider} height={7} width={7} />
                                        </div>
                                        <p className="truncate">{uniqueKey}</p>
                                        {missing_fields_count > 0 && (
                                            <SimpleTooltip tooltipContent="Missing configuration">
                                                <ErrorCircle icon="!" variant="warning" />
                                            </SimpleTooltip>
                                        )}
                                    </div>
                                    <div className="flex items-center w-1/3">
                                        <p className="">{connection_count}</p>
                                    </div>
                                    <div className="flex items-center w-24">
                                        <p className="">{scripts}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            {integrations?.length === 0 && (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-2xl text-center w-full">Configure a new integration</h2>
                    <div className="my-2 text-gray-400">Before exchanging data with an external API, you need to configure it on Nango.</div>
                    <Link
                        to={`/${env}/integrations/create`}
                        className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <span className="flex">
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Configure New Integration
                        </span>
                    </Link>
                </div>
            )}
        </DashboardLayout>
    );
}
