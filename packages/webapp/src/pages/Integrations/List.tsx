import { Loading } from '@geist-ui/core';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorCircle } from '../../components/ErrorCircle';
import { ErrorPageComponent } from '../../components/ErrorComponent';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { SimpleTooltip } from '../../components/SimpleTooltip';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { useListIntegration } from '../../hooks/useIntegration';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';

export default function IntegrationList() {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);

    const { list, error } = useListIntegration(env);

    if (error) {
        return <ErrorPageComponent title="Integrations" error={error.json} page={LeftNavBarItems.Integrations} />;
    }

    if (!list) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Helmet>
                    <title>Integrations - Nango</title>
                </Helmet>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Helmet>
                <title>Integrations - Nango</title>
            </Helmet>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Integrations</h2>
                {list.length > 0 && (
                    <Link
                        to={`/${env}/integrations/create`}
                        className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Configure New Integration
                    </Link>
                )}
            </div>
            {list.length > 0 && (
                <>
                    <div className="h-fit rounded-md text-white text-sm">
                        <div className="w-full">
                            <div className="flex gap-4 items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md justify-between">
                                <div className="w-2/6">ID</div>
                                <div className="w-2/6">Name</div>
                                <div className="w-1/6">Connections</div>
                                <div className="w-24">Active Scripts</div>
                            </div>
                            {list.map((integration) => (
                                <div
                                    key={`tr-${integration.unique_key}`}
                                    className={`flex gap-4 ${
                                        integration.unique_key !== list.at(-1)?.unique_key ? 'border-b border-border-gray' : ''
                                    } min-h-[4em] px-2 justify-between items-center hover:bg-hover-gray cursor-pointer`}
                                    onClick={() => {
                                        navigate(`/${env}/integrations/${integration.unique_key}`);
                                    }}
                                >
                                    <div className="flex items-center w-2/6 gap-2 py-2 truncate">
                                        <div className="w-10 shrink-0">
                                            <IntegrationLogo provider={integration.provider} height={7} width={7} />
                                        </div>
                                        <p className="truncate">{integration.unique_key}</p>
                                        {integration.meta.missingFieldsCount > 0 && (
                                            <SimpleTooltip tooltipContent="Missing configuration">
                                                <ErrorCircle icon="!" variant="warning" />
                                            </SimpleTooltip>
                                        )}
                                    </div>
                                    <div className="flex items-center w-2/6">
                                        <p className="truncate">{integration.custom_display_name || integration.meta.displayName}</p>
                                    </div>
                                    <div className="flex items-center w-1/6">
                                        <p className="">{integration.meta.connectionCount}</p>
                                    </div>
                                    <div className="flex items-center w-24">
                                        <p className="">{integration.meta.scriptsCount}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            {list.length === 0 && (
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
