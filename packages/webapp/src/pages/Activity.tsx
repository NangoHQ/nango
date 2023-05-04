import { useState, useEffect } from 'react';
import { Slash, CheckInCircle, AlertCircle, Link as LinkIcon, RefreshCw } from '@geist-ui/icons'
import { Tooltip } from '@geist-ui/core';

import { useActivityAPI } from '../utils/api';
import { formatTimestamp, formatTimestampWithTZ, elapsedTime } from '../utils/utils';
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

    const renderParams = (params: Record<string, string>) => {
        return Object.entries(params).map(([key, value]) => (
            <div key={key}>
                <span>{key}: </span>
                <span>{value}</span>
            </div>
        ));
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Activity}>
            <div className="px-16 w-fit mx-auto">
                <div className="flex items-center mt-16 mb-12">
                    <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white mr-4">Activity</h2>
                    <Tooltip text="Refresh logs" type="dark">
                        <RefreshCw className="flex stroke-white cursor-pointer" size="24" onClick={() => setLoaded(false)} />
                    </Tooltip>
                </div>
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
                                {activities.filter((activity: ActivityResponse) => typeof activity.success === 'boolean').map((activity: ActivityResponse, index: number) => (
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
                                                <div className="ml-10 w-36 mr-48">
                                                    {activity.action === 'oauth' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-pink-500 bg-opacity-20">
                                                            <LinkIcon className="stroke-pink-500 mr-2" size="16" />
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
                                                                <Tooltip text={`/${activity.endpoint}`} type="dark">
                                                                    <div className="w-52 text-gray-500 overflow-hidden truncate">
                                                                        <span className="ml-3">/{activity.endpoint}</span>
                                                                    </div>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <Tooltip text={activity.connectionId} type="dark">
                                                    <div className="ml-30 w-48 mr-12 text-[#5AC2B3] font-mono overflow-hidden truncate">`{activity.connectionId}`</div>
                                                </Tooltip>
                                                <div className="w-36 mr-12">
                                                    {activity?.provider ? (
                                                        <div className="w-80 flex">
                                                            <img src={`images/template-logos/${activity.provider}.svg`} alt="" className="h-7 mt-0.5" />
                                                            <p className="mt-1.5 ml-2">{activity.providerConfigKey}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="mr-12">{activity.providerConfigKey}</div>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 w-40">{formatTimestamp(Number(activity.timestamp))}</p>
                                                {activity.messages && (
                                                    <button
                                                        className="flex h-8 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        onClick={() => setExpandedRow(index === expandedRow ? -1 : index)}
                                                    >
                                                        <p>{index === expandedRow ? 'Hide Logs' : 'Show Logs'}</p>
                                                    </button>
                                                )}
                                            </div>
                                            {index === expandedRow && (
                                                <>
                                                <div className="flex flex-col space-y-4 mt-6 font-mono">
                                                    {activity.messages.map((message, index: number) => (
                                                        <div key={index} className="flex flex-col">
                                                            <div>{formatTimestampWithTZ(Number(message.timestamp))}{' '}{message.content}</div>
                                                            {message.authMode && (
                                                                <div className="ml-4">
                                                                    authMode: {message.authMode}
                                                                </div>
                                                            )}
                                                            {message.url && (
                                                                <div className="ml-4">
                                                                    url: {message.url}
                                                                </div>
                                                            )}
                                                            {message.wsClientId && (
                                                                <div className="ml-4">
                                                                    ws_client_id: {message.wsClientId}
                                                                </div>
                                                            )}
                                                            {message.state && (
                                                                <div className="ml-4">
                                                                    state: {message.state}
                                                                </div>
                                                            )}
                                                            {message.params && (
                                                                <div className="ml-4">
                                                                    {renderParams(message.params as unknown as Record<string, string>)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                {activity.start && activity.end && (
                                                    <div className="mt-4 text-gray-500 text-sm">
                                                        Operation time: {elapsedTime(activity.start, activity.end)}
                                                    </div>
                                                )}
                                                </>
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
