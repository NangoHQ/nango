import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../utils/api';

interface Integration {
    uniqueKey: string;
    provider: string;
    connectionCount: number;
    creationDate: string;
}

export default function IntegrationList() {
    const [integrations, setIntegrations] = useState<Integration[] | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const getIntegrations = async () => {
            let res = await API.getIntegrationList(navigate);

            if (res?.status === 200) {
                let data = await res.json();
                setIntegrations(data['integrations']);
            }
        };
        getIntegrations();
    }, [navigate]);

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Integrations} />
                {integrations && integrations.length > 0 && (
                    <div className="mx-auto mt-14 ">
                        <div className="mx-16">
                            <div className="flex justify-between">
                                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Integrations</h2>
                                <Link
                                    to="/integration/create"
                                    className="mt-auto mb-4 pt-2.5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                                >
                                    Add New
                                </Link>
                            </div>
                            <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                                <table className="table-auto">
                                    <tbody className="px-4">
                                        {integrations.map(({ uniqueKey, provider, connectionCount, creationDate }) => (
                                            <tr key={`tr-${uniqueKey}`}>
                                                <td
                                                    className={`mx-8 flex place-content-center ${
                                                        uniqueKey !== integrations.at(-1)?.uniqueKey ? 'border-b border-border-gray' : ''
                                                    } h-16`}
                                                >
                                                    <div className="mt-5 w-80">{uniqueKey}</div>
                                                    <div className="mt-4 w-80 flex pl-8">
                                                        {/* <img src="images/connections-icon.svg" alt="Connections" className="h-5 mt-1.5 mr-1.5" /> */}
                                                        <p className="mt-1.5 mr-4">{provider}</p>
                                                    </div>
                                                    <div className="pl-8 mt-4 flex w-40">
                                                        <img src="images/connections-icon.svg" alt="Connections" className="h-5 mt-1.5 mr-1.5" />
                                                        <p className="mt-1.5 mr-4">{connectionCount}</p>
                                                    </div>
                                                    <div className="pl-8 flex pt-4">
                                                        <p className="mt-1.5 mr-4 text-text-dark-gray">{new Date(creationDate).toLocaleDateString()}</p>
                                                        <button className="flex h-8 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700">
                                                            <p>View</p>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                {integrations && integrations.length === 0 && (
                    <div className="mx-auto mt-14 ">
                        <div className="mx-16">
                            <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Integrations</h2>
                            <div className="text-sm w-largebox h-40">
                                <Link to="/integration/create" className="py-3 px-4 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                                    Add your first integration
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
