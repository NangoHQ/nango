import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Link } from 'react-router-dom';
import { PlusIcon, EllipsisHorizontalIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'

import { useGetIntegrationListAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';

import { useStore } from '../store';

interface Integration {
    uniqueKey: string;
    provider: string;
    connectionCount: number;
}

export default function IntegrationList() {
    const navigate = useNavigate();

    const [loaded, setLoaded] = useState(false);
    const [integrations, setIntegrations] = useState<Integration[] | null>(null);
    const getIntegrationListAPI = useGetIntegrationListAPI();

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getIntegrations = async () => {
            let res = await getIntegrationListAPI();

            if (res?.status === 200) {
                let data = await res.json();
                setIntegrations(data['integrations']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getIntegrations();
        }
    }, [getIntegrationListAPI, setIntegrations, loaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            {integrations && !!integrations.length && (
                <div className="px-16 mx-auto">
                    <div className="flex mt-16 w-[976px] justify-between mb-8 items-center">
                        <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Integrations</h2>
                        <Link to="/integration/create" className="flex items-center mt-auto px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Configure New Integration
                        </Link>
                    </div>
                    <div className="h-fit rounded-md text-white text-sm">
                        <table className="w-[976px]">
                            <tbody className="">
                                <tr>
                                    <td className="flex items-center px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                                        <div className="w-96">Name</div>
                                        <div className="">Connections</div>
                                    </td>
                                </tr>
                                {integrations.map(({ uniqueKey, provider, connectionCount }) => (
                                    <tr key={`tr-${uniqueKey}`}>
                                        <td
                                            className={`flex ${
                                                uniqueKey !== integrations.at(-1)?.uniqueKey ? 'border-b border-border-gray' : ''
                                            } h-16 px-2 justify-between items-center hover:bg-neutral-800 cursor-pointer`}
                                            onClick={() => {
                                                navigate(`/integration/${uniqueKey}`);
                                            }}
                                        >
                                            <div className="flex">
                                                <div className="flex w-96 flex items-center">
                                                    <img src={`images/template-logos/${provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                                    <p className="mt-1.5 mr-4 ml-0.5">{uniqueKey}</p>
                                                </div>
                                                <div className="flex items-center pl-8 flex w-40">
                                                    <p className="">{connectionCount}</p>
                                                </div>
                                            </div>
                                            <div className="group relative">
                                                <EllipsisHorizontalIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                                                <div
                                                    className="hidden group-hover:flex p-3 hover:bg-neutral-800 text-gray-400 absolute z-10 -top-10 left-1 bg-black rounded border border-neutral-700 items-center"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/connections/create/${uniqueKey}`);
                                                    }}
                                                >
                                                    <BuildingOfficeIcon className="flex h-5 w-5 text-gray-400" />
                                                    <span className="pl-2">Connect</span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {integrations && !!!integrations.length && (
                <div className="mx-auto">
                    <div className="mx-16">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Integrations</h2>
                        <div className="text-sm w-largebox h-40">
                            <Link to="/integration/create" className="py-3 px-4 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                                Add your 1st Integration
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
