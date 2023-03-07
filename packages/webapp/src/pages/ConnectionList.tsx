import TopNavBar from '../components/TopNavBar';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';

interface Connection {
    id: number;
    connectionId: string;
    provider: string;
    providerConfigKey: number;
    creationDate: string;
}

export default function ConnectionList() {
    const [connections, setConnections] = useState<Connection[] | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const getConnections = async () => {
            let res = await fetch('/api/v1/connection');

            if (res.status === 200) {
                let data = await res.json();
                setConnections(data['connections']);
            } else if (res.status === 401) {
                navigate('/signin', { replace: true });
            } else {
                toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
            }
        };
        getConnections();
    }, [navigate]);

    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={LeftNavBarItems.Connections} />
                {connections && connections.length > 0 && (
                    <div className="mx-auto mt-14 ">
                        <div className="mx-16">
                            <div className="flex justify-between">
                                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Connections</h2>
                            </div>
                            <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                                <table className="table-auto">
                                    <tbody className="px-4">
                                        {connections.map(({ id, connectionId, provider, providerConfigKey, creationDate }) => (
                                            <tr key={`tr-${id}`}>
                                                <td
                                                    className={`mx-8 flex place-content-center ${
                                                        id !== connections.at(-1)?.id ? 'border-b border-border-gray' : ''
                                                    } h-16`}
                                                >
                                                    <div className="mt-5 w-largecell text-t font-mono">`{connectionId}`</div>
                                                    <div className="mt-4 w-80 flex pl-8">
                                                        {/* <img src="images/connections-icon.svg" alt="Connections" className="h-5 mt-1.5 mr-1.5" /> */}
                                                        <p className="mt-1.5 mr-4">{providerConfigKey}</p>
                                                    </div>
                                                    <div className="pl-8 flex pt-4">
                                                        <p className="mt-1.5 mr-4 text-text-dark-gray">{new Date(creationDate).toLocaleDateString()}</p>
                                                        <Link
                                                            to={`/connection/${providerConfigKey}/${connectionId}`}
                                                            className="flex h-8 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        >
                                                            <p>View</p>
                                                        </Link>
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
                {connections && connections.length === 0 && (
                    <div className="mx-auto mt-14 ">
                        <div className="mx-16">
                            <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Connections</h2>
                            <div className="text-sm w-largebox h-40">
                                <p className="text-white text-sm">
                                    No Connection yet. Start by creating & testing an{' '}
                                    <Link to="integration" className="text-text-blue">
                                        Integration
                                    </Link>
                                    . Follow the{' '}
                                    <a href="https://docs.nango.dev/quickstart" className="text-text-blue" target="_blank" rel="noreferrer">
                                        Quickstart
                                    </a>{' '}
                                    for more instructions.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
