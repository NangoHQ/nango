import { ReactElement, useState, useEffect, useRef, createRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    ChevronsLeft,
    Clock,
    ArrowRight,
    Slash,
    CheckInCircle,
    AlertCircle,
    Link as LinkIcon,
    Pause,
    Play,
    User,
    FastForward
} from '@geist-ui/icons'
import { Tooltip } from '@geist-ui/core';
import queryString from 'query-string';

import { ReactComponent as SyncIcon } from '../icons/sync-code-icon.svg';
import CopyButton from '../components/ui/button/CopyButton';
import { useActivityAPI } from '../utils/api';
import { formatTimestamp, formatTimestampWithTZ, elapsedTime } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import type { ActivityResponse } from '../types';

import { useStore } from '../store';

interface Props {
  data: string | number | undefined;
}

const JsonPrettyPrint: React.FC<Props> = ({ data }): ReactElement<any, any> => {
  let prettyJson = '';
  let message = '';
  let isJson = true;

  const isHtml = (string: string | number | undefined) => {
    const htmlRegex = /<\/?[a-z][\s\S]*>/i;
    return htmlRegex.test(string as string);
  };

  try {
    const jsonRegex = /({.*})|(\[.*\])/s;
    const match = (data as string)?.match(jsonRegex);

    if (match) {
      const json = JSON.parse(match[0]);
      prettyJson = JSON.stringify(json, null, 2);
      message = (data as string)?.replace(jsonRegex, '').trim();
    } else {
      try {
        prettyJson = JSON.stringify(JSON.parse(data as string), null, 2);
      } catch {
        isJson = false;
        prettyJson = data as string;
        if (isHtml(data)) {
          return <div className="whitespace-normal break-all overflow-wrap" dangerouslySetInnerHTML={{ __html: String(data) }}></div>;
        }
      }
    }

    return (
      <>
        {message && <p>{message}</p>}
        {isJson ? <pre className="max-w-5xl overflow-auto whitespace-pre-wrap break-all">{prettyJson}</pre> : <>{prettyJson}</>}
      </>
    );
  } catch (e) {
      return <span className="whitespace-normal break-all overflow-wrap">{data?.toString()}</span>;
  }
};

export default function Activity() {
    const navigate = useNavigate();

    const [loaded, setLoaded] = useState(false);
    const [activities, setActivities] = useState<ActivityResponse[]>([]);
    const [expandedRow, setExpandedRow] = useState(-1);
    const [limit,] = useState(20);
    const [offset, setOffset] = useState(0);
    const [logIds, setLogIds] = useState<number[]>([]);

    const location = useLocation();
    const queryParams = queryString.parse(location.search);
    const activityLogId: string | (string | null)[] | null = queryParams.activity_log_id;
    const initialOffset: string | (string | null)[] | null = queryParams.offset;
    const initialEnv: string | (string | null)[] | null = queryParams.env;

    const getActivityAPI = useActivityAPI();

    const env = useStore(state => state.cookieValue);
    const setCookieValue = useStore(state => state.setCookieValue);

    if (initialEnv) {
        setCookieValue(initialEnv as string);
    }

    const isInitialMount = useRef(true);
    const [activityRefs, setActivityRefs] = useState<{ [key: number]: React.RefObject<HTMLTableRowElement> }>({});

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getActivity = async () => {
            if (initialOffset && typeof initialOffset === 'string') {
                setOffset(parseInt(initialOffset));
            }

            const res = await getActivityAPI(limit, offset);

            if (res?.status === 200) {
                try {
                    const data = await res.json();
                    setActivities(data);
                    setLogIds(data.map((activity: ActivityResponse) => activity.id));

                    setActivityRefs(data.reduce((acc: Record<number, React.RefObject<HTMLTableRowElement>>, activity: ActivityResponse) => {
                        acc[activity.id] = createRef<HTMLTableRowElement>();
                        return acc;
                    }, {}));
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
    }, [getActivityAPI, loaded, setLoaded, limit, offset, initialOffset]);

    useEffect(() => {
        const getActivityLogs = async () => {
            if (logIds.length > 0) {
                const res = await fetch(`/api/v1/activity-messages?logIds=${logIds.join(',')}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    }
                });

                if (res?.status === 200) {
                    try {
                        const allMessages = await res.json();
                        const logsWithMessages = activities.map((activity: ActivityResponse) => {
                            const logMessages = allMessages[activity.id];
                            if (logMessages) {
                                activity.messages = logMessages;
                            }
                            return activity;
                        });
                        setActivities(logsWithMessages as ActivityResponse[]);
                    } catch (e) {
                        console.log(e)
                    }
                }
            }
        };

        getActivityLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logIds]);


    useEffect(() => {
        const scrollToLog = async () => {
            if (isInitialMount.current && activityLogId && typeof activityLogId === 'string' && Object.keys(activityRefs).length > 0) {
                const id = parseInt(activityLogId);
                setExpandedRow(id);

                // remove query param env from the url without updating the push state
                navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, env: null }), { replace: true });

                // wait 1 second before scrolling
                await new Promise(resolve => setTimeout(resolve, 500));

                if (activityRefs[id] && activityRefs[id]?.current && activityRefs[id]?.current !== null) {
                    setTimeout(() => {
                        activityRefs[id]?.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                        });
                    }, 100);

                    isInitialMount.current = false;
                }
            }
        }

        scrollToLog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activityLogId, activityRefs]);

    const incrementPage = () => {
        if (activities.length < limit) {
            return;
        }

        const newOffset = offset + limit;
        setOffset(newOffset);
        setLoaded(false);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: newOffset }));
    };

    const decrementPage = () => {
        if (offset - limit >= 0) {
            const newOffset = offset - limit;
            setOffset(newOffset);
            setLoaded(false);

            navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: newOffset }));
        }
    };

    const resetOffset = () => {
        setOffset(0);
        setLoaded(false);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: 0 }));
    };

    const renderParams = (params: Record<string, string>, level: string) => {
        return Object.entries(params).map(([key, value]) => (
            <div className={`max-w-5xl whitespace-normal break-all overflow-wrap ${level === 'error' ? 'text-red-500' : level === 'warn' ? 'text-orange-500' : ''}`} key={key}>
                <span>{key}: </span>
                {value === null ? '' : <JsonPrettyPrint data={value} />}
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

                    <div className="h-fit border border-border-gray rounded-md text-white text-sm overflow-hidden">
                        <table className="table-auto">
                            <tbody className="px-4">
                                {activities.filter((activity: ActivityResponse) => typeof activity?.action === 'string').map((activity: ActivityResponse, index: number) => (
                                    <tr key={activity.id} ref={activityRefs[activity.id]}>
                                        <td
                                            className={`mx-8 flex-col px-3 py-4 whitespace-nowrap ${
                                                index !== -1 ? 'border-b border-border-gray' : ''
                                            } h-16`}
                                        >
                                            <div className="flex items-center px-2">
                                                {activity?.success === null && (
                                                    <Link
                                                        to={activity?.action === 'sync deploy' ? '/syncs' : `/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <Clock className="stroke-yellow-500" size="32" />
                                                    </Link>
                                                )}
                                                {activity?.success === true && (
                                                    <Link
                                                        to={activity?.action === 'sync deploy' ? '/syncs' : `/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <CheckInCircle className="stroke-green-500" size="32" />
                                                    </Link>
                                                )}
                                                {activity?.success === false && (
                                                    <Link
                                                        to={activity?.action === 'sync deploy' ? '/syncs' : `/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                    >
                                                        <AlertCircle className="stroke-red-500" size="32" />
                                                    </Link>
                                                )}
                                                <div className="ml-10 w-60 mr-4 truncate overflow-hidden">
                                                    {(activity?.action === 'account') && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-yellow-500 bg-opacity-20">
                                                            <User className="stroke-yellow-500 mr-2" size="16" />
                                                            <p className="inline-block text-yellow-500">account</p>
                                                        </div>
                                                    )}
                                                    {(activity?.action === 'oauth' || activity?.action === 'auth') && (
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
                                                    {activity?.action === 'action' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20">
                                                                <SyncIcon className="h-4 -ml-3 -mr-1 stroke-red-500" />
                                                                <p className="inline-block text-red-500">action</p>
                                                            </div>
                                                            {activity.operation_name && (
                                                                <Tooltip text={activity.operation_name} type="dark">
                                                                    <p className="text-gray-500 ml-2 text-sm overflow-hidden truncate">({activity?.operation_name})</p>
                                                                </Tooltip>
                                                            )}
                                                        </span>
                                                    )}
                                                    {activity?.action === 'webhook' && (
                                                        <div className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20">
                                                                <ArrowRight className="stroke-red-500 mr-2" size="16" />
                                                                <p className="inline-block text-red-500">webhook</p>
                                                            </div>
                                                            {activity.endpoint && (
                                                                <Tooltip text={`${activity.endpoint}`} type="dark">
                                                                    <div className="w-52 text-gray-500 overflow-hidden truncate">
                                                                        <span className="ml-3">{activity.endpoint}</span>
                                                                    </div>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    )}
                                                    {activity?.action === 'sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-green-500 bg-opacity-20">
                                                                <SyncIcon className="h-4 -ml-3 -mr-1 stroke-green-500" />
                                                                <p className="inline-block text-green-500">sync</p>
                                                            </div>
                                                            <Link
                                                                to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                                className="flex items-center"
                                                            >
                                                                {activity.operation_name && (
                                                                    <Tooltip text={activity.operation_name} type="dark">
                                                                        <p className="text-gray-500 ml-2 text-sm overflow-hidden truncate">({activity?.operation_name})</p>
                                                                    </Tooltip>
                                                                )}
                                                            </Link>
                                                        </span>
                                                    )}
                                                    {activity?.action === 'sync deploy' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-[#8247FF] bg-opacity-20">
                                                                <img className="h-4 mr-2" src="/images/sync-deploy-icon.svg" alt="" />
                                                                <p className="inline-block text-[#8247FF]">sync deploy</p>
                                                            </div>
                                                            <Link
                                                                to="/syncs"
                                                            >
                                                            </Link>
                                                        </span>
                                                    )}
                                                    {activity?.action === 'pause sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-gray-500 bg-opacity-20">
                                                                <Pause className="stroke-gray-500 mr-2" size="16" />
                                                                <p className="inline-block text-gray-500">pause sync</p>
                                                            </div>
                                                            <Link
                                                                to="/syncs"
                                                            >
                                                                {activity.operation_name && (
                                                                    <p className="text-gray-500 ml-2 text-sm">({activity?.operation_name})</p>
                                                                )}
                                                            </Link>
                                                        </span>
                                                    )}
                                                    {activity?.action === 'restart sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-gray-500 bg-opacity-20">
                                                                <Play className="stroke-gray-500 mr-2" size="16" />
                                                                <p className="inline-block text-gray-500">restart sync</p>
                                                            </div>
                                                            <Link
                                                                to="/syncs"
                                                            >
                                                                {activity.operation_name && (
                                                                    <p className="text-gray-500 ml-2 text-sm">({activity?.operation_name})</p>
                                                                )}
                                                            </Link>
                                                        </span>
                                                    )}
                                                    {activity?.action === 'trigger sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-gray-500 bg-opacity-20">
                                                                <FastForward className="stroke-gray-500 mr-2" size="16" />
                                                                <p className="inline-block text-gray-500">trigger sync</p>
                                                            </div>
                                                            <Link
                                                                to="/syncs"
                                                            >
                                                                {activity.operation_name && (
                                                                    <Tooltip text={activity.operation_name} type="dark">
                                                                        <p className="text-gray-500 ml-2 text-sm overflow-hidden truncate">({activity?.operation_name})</p>
                                                                    </Tooltip>
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
                                                                <Tooltip text={`${activity.endpoint}`} type="dark">
                                                                    <div className="w-52 text-gray-500 overflow-hidden truncate">
                                                                        <span className="ml-3">{activity.endpoint}</span>
                                                                    </div>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <Tooltip text={activity?.connection_id} type="dark">
                                                    <Link
                                                        to={`/connections/${activity.provider_config_key}/${activity.connection_id}${activity?.action === 'sync' ? '#sync' : ''}`}
                                                        className={`block ml-30 w-48 mr-12 text-[#5AC2B3] font-mono overflow-hidden truncate ${activity.connection_id === null ? 'cursor-default' : ''}`}
                                                        onClick={(e) => {
                                                            if (activity.connection_id === null) {
                                                                e.preventDefault();
                                                            }
                                                        }}
                                                    >
                                                        `{activity.connection_id === null ? 'n/a': activity.connection_id }`
                                                    </Link>
                                                </Tooltip>
                                                <Link
                                                    to={activity.provider === null ? '/syncs' : `/integration/${activity.provider_config_key}`}
                                                    className={`block w-48 mr-12 ${activity.provider === null && activity.action !== 'sync deploy' ? 'cursor-default' : ''}`}
                                                    onClick={(e) => {
                                                        if (activity.provider === null && activity.action !== 'sync deploy') {
                                                            e.preventDefault();
                                                        }
                                                    }}
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
                                                {activity.messages && activity.messages.length > 0 && activity.messages && activity.messages[0] !== null && (
                                                    <button
                                                        className="flex h-8 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        onClick={() => setExpandedRow(activity.id === expandedRow ? -1 : activity.id)}
                                                    >
                                                        <p>{activity.id === expandedRow ? 'Hide Logs' : 'Show Logs'}</p>
                                                    </button>
                                                )}
                                                {activity.messages && activity.messages.length > 0 && activity.messages[0] && <CopyButton icontype="link" dark text={`${window.location.host}/activity?env=${env}&activity_log_id=${activity.id}${offset === 0 ? '': `&offset=${offset}`}`} />}
                                            </div>
                                            {activity.id === expandedRow && activity.messages && activity.messages[0] && (
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
                                                                <div className="whitespace-normal break-all overflow-wrap ml-4">
                                                                    url: {message.url}
                                                                </div>
                                                            )}
                                                            {message?.state && (
                                                                <div className="whitespace-normal break-all overflow-wrap ml-4">
                                                                    state: {message.state}
                                                                </div>
                                                            )}
                                                            {message?.params && (
                                                                <div className="ml-4">
                                                                    {renderParams(message.params as unknown as Record<string, string>, message.level as string)}
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
