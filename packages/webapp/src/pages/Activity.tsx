import { useState, useEffect } from 'react';
import { CheckInCircle, AlertCircle, Link as LinkIcon } from '@geist-ui/icons'

import { useActivityAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import type { ActivityResponse } from '../types';

export default function Activity() {
    const [loaded, setLoaded] = useState(false);
    const [activities, setActivities] = useState([]);

    const getActivityAPI = useActivityAPI();

    useEffect(() => {
        const getActivity = async () => {
            const res = await getActivityAPI();

            if (res?.status === 200) {
                const data = await res.json();
                setActivities(data);
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
                <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                    <table className="table-auto">
                        <tbody className="px-4">
                            {activities.map((activity: ActivityResponse, index: number) => (
                                <tr key={index}>
                                    <td className={`mx-8 flex items-center h-16`}>
                                        {activity.success ? (
                                                <CheckInCircle className="text-2xl stroke-green-500" />
                                            ) : (
                                                <AlertCircle className="stroke-red-500" />
                                            )
                                        }
                                        <div className="ml-6 bg-pink-300">
                                            <LinkIcon className="stroke-pink-500" />
                                            {activity.action}
                                        </div>
                                        <div>{activity.message}</div>
                                        <div>{activity.providerConfigKey}</div>
                                        <div>{activity.timestamp.toString()}</div>
                                        <div className="w-largecell text-t font-mono">`{activity.connectionId}`</div>
                                        {activity?.provider && (
                                            <div className="w-80 flex pl-8">
                                                <img src={`images/template-logos/${activity.provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                                <p className="mt-1.5 mr-4 ml-0.5">Foo</p>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </DashboardLayout>
    );
}
