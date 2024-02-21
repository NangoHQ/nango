import { useNavigate } from 'react-router';
import useSWR from 'swr'
import { Loading } from '@geist-ui/core';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline'

import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { requestErrorToast } from '../../utils/api';

import { useStore } from '../../store';

interface Integration {
    uniqueKey: string;
    provider: string;
    connectionCount: number;
    scripts: number;
}

export default function IntegrationList() {
    const navigate = useNavigate();

    const env = useStore(state => state.cookieValue);

    const { data, error } = useSWR<{integrations: Integration[]}>(`/api/v1/integration?env=${env}`)

    if (error) {
        requestErrorToast();
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    if (!data) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    const { integrations } = data;

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Integrations</h2>
                {integrations.length > 0 && (
                    <Link to={`/${env}/integration/create`} className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Configure New Integration
                    </Link>
                )}
            </div>
            {integrations?.length > 0 && (
                <>
                    <div className="h-fit rounded-md text-white text-sm">
                        <table className="w-full">
                            <tbody className="">
                                <tr>
                                    <td className="flex items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md justify-between">
                                        <div className="w-[33rem]">Name</div>
                                        <div className="w-52">Connections</div>
                                        <div className="">Active Scripts</div>
                                    </td>
                                </tr>
                                {integrations?.map(({ uniqueKey, provider, connectionCount, scripts }) => (
                                    <tr key={`tr-${uniqueKey}`}>
                                        <td
                                            className={`flex ${
                                                uniqueKey !== integrations.at(-1)?.uniqueKey ? 'border-b border-border-gray' : ''
                                            } h-14 px-2 justify-between items-center hover:bg-hover-gray cursor-pointer`}
                                            onClick={() => {
                                                navigate(`/${env}/integration/${uniqueKey}`);
                                            }}
                                        >
                                            <div className="flex w-full justify-between">
                                                <div className="flex w-[31rem] items-center">
                                                    <IntegrationLogo provider={provider} height={7} width={7} classNames="mr-0.5 mt-0.5" />
                                                    <p className="mt-1.5 mr-4 ml-0.5">{uniqueKey}</p>
                                                </div>
                                                <div className="flex items-center flex w-40">
                                                    <p className="">{connectionCount}</p>
                                                </div>
                                                <div className="flex items-center pl-20 flex">
                                                    <p className="">{scripts}</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {integrations?.length === 0 && (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-2xl text-center w-full">Configure a new integration</h2>
                    <div className="my-2 text-gray-400">Before exchanging data with an external API, you need to configure it on Nango.</div>
                    <Link to={`/${env}/integration/create`} className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
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
