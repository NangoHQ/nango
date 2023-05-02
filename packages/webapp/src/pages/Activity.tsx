import { useState, useEffect } from 'react';
import { Slash, CheckInCircle, AlertCircle, Link as LinkIcon } from '@geist-ui/icons'

import { useActivityAPI } from '../utils/api';
import { formatTimestamp } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import type { ActivityResponse } from '../types';

export default function Activity() {
    const [loaded, setLoaded] = useState(false);
    const [activities, setActivities] = useState([]);
    const [expandedRow, setExpandedRow] = useState(-1);

    const getActivityAPI = useActivityAPI();

    useEffect(() => {
        const getActivity = async () => {
            const res = await getActivityAPI();

            if (res?.status === 200) {
                try {
                    const data = await res.json();
                    setActivities(data);
                } catch (e) {
                    console.log(e)
                }
                setLoaded(true);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getActivity();
        }

    }, [getActivityAPI, loaded, setLoaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Activity}>
            <div className="px-16 w-fit mx-auto">
                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Activity</h2>
                {activities.length === 0 && (
                    <div className="flex items-center">
                        <Slash className="stroke-red-500" />
                        <div className="text-white ml-3 ">No recent activity yet!</div>
                    </div>
                )}
                {activities.length > 0 && (
                    <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                        <table className="table-auto">
                            <tbody className="px-4">
                                {activities.map((activity: ActivityResponse, index: number) => (
                                    <tr key={index}>
                                        <td
                                            className={`mx-8 flex-col px-10 py-4 whitespace-nowrap ${
                                                index !== -1 ? 'border-b border-border-gray' : ''
                                            } h-16`}
                                        >
                                            <div className="flex items-center px-2">
                                                {activity.success ? (
                                                        <CheckInCircle className="stroke-green-500" size="32" />
                                                    ) : (
                                                        <AlertCircle className="stroke-red-500" size="32" />
                                                    )
                                                }
                                                <div className="ml-24 w-12">
                                                    {activity.action === 'oauth' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-6 bg-pink-500 bg-opacity-20">
                                                            <LinkIcon className="stroke-pink-500" />
                                                            <p className="inline-block text-pink-500">auth</p>
                                                        </div>
                                                    )}
                                                    {activity.action === 'token' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-[#FBBC05] bg-opacity-20">
                                                            <img className="h-4 mr-2" src="/images/token-icon.svg" alt="" />
                                                            <p className="inline-block text-[#FBBC05]">token</p>
                                                        </div>
                                                    )}
                                                    {activity.action === 'proxy' && (
                                                        <div className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-6 bg-[#6BA4F8] bg-opacity-20">
                                                                <img className="h-4 mr-2" src="/images/network-icon.svg" alt="" />
                                                                <p className="inline-block text-[#6BA4F8]">proxy</p>
                                                            </div>
                                                            {activity.endpoint && (
                                                                <span className="text-gray-500 ml-3">/{activity.endpoint}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-40 w-24 text-[#5AC2B3] font-mono">`{activity.connectionId}`</div>
                                                <div className="w-36 mr-12">
                                                    {activity?.provider ? (
                                                        <div className="w-80 flex">
                                                            <img src={`images/template-logos/${activity.provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                                            <p className="mt-1.5 ml-2">{activity.provider}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="mr-12">{activity.providerConfigKey}</div>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 w-48 mr-4">{formatTimestamp(Number(activity.timestamp))}</p>
                                                {activity.messages && (
                                                    <button
                                                        className="flex h-8 ml-4 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        onClick={() => setExpandedRow(index === expandedRow ? -1 : index)}
                                                    >
                                                        <p>{index === expandedRow ? 'Hide Logs' : 'Show Logs'}</p>
                                                    </button>
                                                )}
                                            </div>
                                            {index === expandedRow && (
                                                <div className="mt-6 font-mono">
                                                    {activity.messages.map((message, index: number) => (
                                                        <div key={index} className="space-y-2">
                                                            {message}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
