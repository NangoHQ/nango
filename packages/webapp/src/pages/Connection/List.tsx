import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Link } from 'react-router-dom';

import { PlusIcon } from '@heroicons/react/24/outline'
import { useGetConnectionListAPI } from '../../utils/api';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import CopyButton from '../../components/ui/button/CopyButton';

import { useStore } from '../../store';

interface Connection {
    id: number;
    connection_id: string;
    provider: string;
    provider_config_key: number;
    created: string;
}

export default function ConnectionList() {
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState(false);
    const [connections, setConnections] = useState<Connection[] | null>(null);
    const getConnectionListAPI = useGetConnectionListAPI();

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getConnections = async () => {
            const res = await getConnectionListAPI();

            if (res?.status === 200) {
                const data = await res.json();
                setConnections(data['connections']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [getConnectionListAPI, loaded, setLoaded]);

    function formatDate(creationDate: string): string {
        const inputDate = new Date(creationDate);
        const now = new Date();

        const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (inputDateOnly.getTime() === nowDateOnly.getTime()) {
            const hours = inputDate.getHours();
            const minutes = inputDate.getMinutes();
            const amPm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 || 12; // Convert to 12-hour format and handle 0 as 12

            return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${amPm}`;
        }

        const diffTime = Math.abs(now.getTime() - inputDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
            return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
        } else {
            return inputDate.toLocaleDateString();
        }
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Connections</h2>
                {connections && connections.length > 0 && (
                    <Link to={`/${env}/connections/create`} className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Add Connection
                    </Link>
                )}
            </div>
            {connections && connections.length > 0 && (
                <div className="h-fit rounded-md text-white text-sm">
                    <table className="w-full">
                        <tbody className="">
                            <tr>
                                <td className="flex items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md">
                                    <div className="w-2/3">ID</div>
                                    <div className="w-96 ml-2">Integration</div>
                                    <div className="">Created</div>
                                </td>
                            </tr>
                            {connections.map(({ id, connection_id: connectionId, provider, provider_config_key: providerConfigKey, created: creationDate }) => (
                                <tr key={`tr-${id}`}>
                                    <td
                                        className={`flex ${
                                            id !== connections.at(-1)?.id ? 'border-b border-border-gray' : ''
                                        } h-14 px-2 justify-between items-center hover:bg-hover-gray cursor-pointer`}
                                        onClick={() => {
                                            navigate(`/${env}/connections/${encodeURIComponent(providerConfigKey)}/${encodeURIComponent(connectionId)}`);
                                        }}
                                    >
                                        <div className="flex items-center w-2/3">
                                            <span>{connectionId}</span>
                                            <CopyButton dark text={connectionId} />
                                        </div>
                                        <div className="flex items-center w-1/3 mr-8">
                                            <img src={`/images/template-logos/${provider}.svg`} alt="" className="h-7 w-7 mt-0.5 mr-0.5" />
                                            <p className="ml-2">{providerConfigKey}</p>
                                        </div>
                                        <div className="flex w-20">
                                            <p className="">{formatDate(creationDate)}</p>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {connections && connections.length === 0 && (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-2xl text-center w-full">Connect to an external API</h2>
                    <div className="my-2 text-gray-400">Connections can be created in code from your app, or manually on current tab.</div>
                    <Link to={`/${env}/connections/create`} className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                        <span className="flex">
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Add Connection
                        </span>
                    </Link>
                </div>
            )}
        </DashboardLayout>
    );
}
