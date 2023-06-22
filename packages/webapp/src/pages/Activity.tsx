import { ReactElement, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, Clock, ArrowRight, Slash, CheckInCircle, AlertCircle, Link as LinkIcon, RefreshCw } from '@geist-ui/icons'
import { Tooltip } from '@geist-ui/core';
import queryString from 'query-string';

import { useActivityAPI } from '../utils/api';
import { formatTimestamp, formatTimestampWithTZ, elapsedTime } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import type { ActivityResponse } from '../types';

interface Props {
  data: string | number | undefined;
}

const JsonPrettyPrint: React.FC<Props> = ({ data }): ReactElement<any, any> => {
  let prettyJson = '';

  try {
      if (typeof data === 'string') {
        const jsonRegex = /({.*})/g;
        const match = data.match(jsonRegex);
        if (match) {
          const json = JSON.parse(match[0]);
          prettyJson = JSON.stringify(json, null, 2);
        } else {
          prettyJson = data;
        }
      }

      return (
          <pre className="max-w-5xl overflow-auto whitespace-pre-wrap break-all">{prettyJson}</pre>
      );
  } catch(e) {
      return <span className="whitespace-normal break-all overflow-wrap">data</span>;
  }
};

export default function Activity() {
    const [loaded, setLoaded] = useState(false);
    const [activities, setActivities] = useState([]);
    const [expandedRow, setExpandedRow] = useState(-1);
    const [limit,] = useState(30);
    const [offset, setOffset] = useState(0);

      const location = useLocation();
      const queryParams = queryString.parse(location.search);
      const activityLogId: string | (string | null)[] | null = queryParams.activity_log_id;

    const getActivityAPI = useActivityAPI();

    useEffect(() => {
        const getActivity = async () => {
            const res = await getActivityAPI(limit, offset);

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

    }, [getActivityAPI, loaded, setLoaded, limit, offset]);


    useEffect(() => {
      if (activityLogId && typeof activityLogId === 'string') {
        setExpandedRow(parseInt(activityLogId));
      }
    }, [activityLogId]);

    const incrementPage = () => {
        if (activities.length < limit) {
            return;
        }

        setOffset(offset + limit);
        setLoaded(false);
    };

    const decrementPage = () => {
        if (offset - limit >= 0) {
            setOffset(offset - limit);
            setLoaded(false);
        }
    };

    const resetOffset = () => {
        setOffset(0);
        setLoaded(false);
    };

    const renderParams = (params: Record<string, string>) => {
        return Object.entries(params).map(([key, value]) => (
            <div className="max-w-5xl whitespace-normal break-all overflow-wrap" key={key}>
                <span>{key}: </span>
                <span className="max-w-5xl whitespace-normal break-all overflow-wrap">{value.toString()}</span>
            </div>
        ));
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Activity}>
            <div className="max-w-screen-xl px-16 w-fit mx-auto">
                <div className="flex items-center mt-16 mb-6">
                    <div className="flex flex-col text-left">
                        <span className="flex items-center mb-3">
                            <h2 className="text-3xl font-semibold tracking-tight text-white mr-4">Activity</h2>
                            <Tooltip text="Refresh logs" type="dark">
                                <RefreshCw className="flex stroke-white cursor-pointer" size="24" onClick={() => setLoaded(false)} />
                            </Tooltip>
                        </span>
                        <span>
                            <p className="text-white text-left">Note that logs older than 15 days are cleared</p>
                        </span>
                    </div>
                </div>
                {activities.length === 0 && (
                    <div className="flex items-center">
                        <Slash className="stroke-red-500" />
                        <div className="text-white ml-3">No recent activity yet!</div>
                    </div>
                )}
                {activities.length > 0 && (
                    <>
                    <div className="flex justify-end mb-4 items-center">
                        {offset >= limit * 3 && (
                            <ChevronsLeft onClick={resetOffset} className="flex stroke-white cursor-pointer mr-3" size="16" />
                        )}
                        <span onClick={decrementPage} className={`flex ${offset - limit >= 0 ? 'cursor-pointer hover:bg-gray-700' : ''} h-8 mr-2 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}>
                          <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z" clip-rule="evenodd"></path></svg>
                        </span>
                        <span onClick={incrementPage} className={`flex ${activities.length < limit ? '' : 'cursor-pointer hover:bg-gray-700'} h-8 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}>
                          <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
                        </span>
                    </div>

                    <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                        <table className="table-auto">
                            <tbody className="px-4">
                                {activities.filter((activity: ActivityResponse) => typeof activity?.action === 'string').map((activity: ActivityResponse, index: number) => (
                                    <tr key={activity.id}>
                                        <td
                                            className={`mx-8 flex-col px-10 py-4 whitespace-nowrap ${
                                                index !== -1 ? 'border-b border-border-gray' : ''
                                            } h-16`}
                                        >
                                            <div className="flex items-center px-2">
                                                {activity?.success === null && (
                                                    <Link
                                                        to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <Clock className="stroke-yellow-500" size="32" />
                                                    </Link>
                                                )}
                                                {activity?.success === true && (
                                                    <Link
                                                        to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <CheckInCircle className="stroke-green-500" size="32" />
                                                    </Link>
                                                )}
                                                {activity?.success === false && (
                                                    <Link
                                                        to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <AlertCircle className="stroke-red-500" size="32" />
                                                    </Link>
                                                )}
                                                <div className="ml-10 w-36 mr-36">
                                                    {activity?.action === 'oauth' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-pink-500 bg-opacity-20">
                                                            <LinkIcon className="stroke-pink-500 mr-2" size="16" />
                                                            <p className="inline-block text-pink-500">auth</p>
                                                        </div>
                                                    )}
                                                    {activity?.action === 'token' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-[#FBBC05] bg-opacity-20">
                                                            <img className="h-4 mr-2" src="/images/token-icon.svg" alt="" />
                                                            <p className="inline-block text-[#FBBC05]">token</p>
                                                        </div>
                                                    )}
                                                    {activity?.action === 'sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-green-500 bg-opacity-20">
                                                                <img className="h-4 mr-2" src="/images/network-icon.svg" alt="" />
                                                                <p className="inline-block text-green-500">sync</p>
                                                            </div>
                                                            <Link
                                                                to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                            >
                                                                {activity.operation_name && (
                                                                    <p className="text-gray-500 ml-2 text-sm">({activity?.operation_name})</p>
                                                                )}
                                                            </Link>
                                                        </span>
                                                    )}
                                                    {activity?.action === 'proxy' && (
                                                        <div className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-3 bg-[#6BA4F8] bg-opacity-20">
                                                                <ArrowRight className="stroke-[#6BA4F8] mr-2" size="16" />
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
                                                <Tooltip text={activity?.connection_id} type="dark">
                                                    <Link
                                                        to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                        className="block ml-30 w-48 mr-12 text-[#5AC2B3] font-mono overflow-hidden truncate"
                                                    >
                                                        `{activity.connection_id}`
                                                    </Link>
                                                </Tooltip>
                                                <Link
                                                    to={`/integration/${activity.provider_config_key}`}
                                                    className="block w-36 mr-12"
                                                >
                                                    {activity?.provider ? (
                                                        <div className="w-80 flex">
                                                            <img src={`images/template-logos/${activity.provider}.svg`} alt="" className="h-7 mt-0.5" />
                                                            <p className="mt-1.5 ml-2">{activity.provider_config_key}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="mr-12">{activity.provider_config_key}</div>
                                                    )}
                                                </Link>
                                                <p className="text-gray-500 w-40">{formatTimestamp(Number(activity.timestamp))}</p>
                                                {activity.messages && activity.messages.length > 0 && activity.messages[0] !== null && (
                                                    <button
                                                        className="flex h-8 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        onClick={() => setExpandedRow(activity.id === expandedRow ? -1 : activity.id)}
                                                    >
                                                        <p>{activity.id === expandedRow ? 'Hide Logs' : 'Show Logs'}</p>
                                                    </button>
                                                )}
                                            </div>
                                            {activity.id === expandedRow && activity.messages[0] && (
                                                <>
                                                <div className="flex flex-col space-y-4 mt-6 font-mono">
                                                    {activity.messages.map((message, index: number) => (
                                                        <div key={index} className="flex flex-col max-w-7xl">
                                                            <div className="whitespace-normal break-all overflow-wrap">
                                                                <span className="text-gray-500">
                                                                    {formatTimestampWithTZ(Number(message?.timestamp))}
                                                                </span>{' '}
                                                                <span
                                                                    className={`whitespace-normal break-all overflow-wrap ${message?.level === 'error' ? 'text-red-500' : message?.level === 'warn' ? 'text-orange-500' : ''}`}
                                                                >
                                                                    <JsonPrettyPrint data={message?.content} />
                                                                </span>
                                                            </div>
                                                            {message?.auth_mode && (
                                                                <div className="ml-4">
                                                                    auth_mode: {message.auth_mode}
                                                                </div>
                                                            )}
                                                            {message?.url && (
                                                                <div className="whitespace-normal ml-4">
                                                                    url: {message.url}
                                                                </div>
                                                            )}
                                                            {message?.state && (
                                                                <div className="whitespace-normal ml-4">
                                                                    state: {message.state}
                                                                </div>
                                                            )}
                                                            {message?.params && (
                                                                <div className="ml-4">
                                                                    {renderParams(message.params as unknown as Record<string, string>)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                {activity.start && activity.end && (
                                                    <div className="mt-4 text-gray-500 text-sm">
                                                        Operation time: {elapsedTime(Number(activity.start), Number(activity.end))}
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
                </>
                )}
            </div>
        </DashboardLayout>
    );
}
