import { ReactElement, useState, useEffect, useRef, createRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
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
    FastForward,
    XSquare
} from '@geist-ui/icons'
import { XCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@geist-ui/core';
import queryString from 'query-string';

import { ReactComponent as SyncIcon } from '../icons/sync-code-icon.svg';
import CopyButton from '../components/ui/button/CopyButton';
import { useActivityAPI } from '../utils/api';
import { formatTimestamp, formatTimestampWithTZ, elapsedTime } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import type { ActivityMessageResponse, ActivityResponse } from '../types';

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
    const [status, setStatus] = useState<string>('');
    const [selectedScript, setSelectedScript] = useState<string>('');
    const [selectedIntegration, setSelectedIntegration] = useState<string>('');
    const [selectedConnection, setSelectedConnection] = useState<string>('');
    const [selectedDate, setDate] = useState<string>('');

    const [filtersFetched, setFiltersFetched] = useState(false);
    const [scripts, setScripts] = useState<string[]>([]);
    const [integrations, setIntegrations] = useState<string[]>([]);
    const [connections, setConnections] = useState<string[]>([]);

    const location = useLocation();
    const queryParams = queryString.parse(location.search);
    const activityLogId: string | (string | null)[] | null = queryParams.activity_log_id;
    const initialOffset: string | (string | null)[] | null = queryParams.offset;
    const initialEnv: string | (string | null)[] | null = queryParams.env;
    const initialStatus: string | (string | null)[] | null = queryParams.status;
    const initialScript: string | (string | null)[] | null = queryParams.script;
    const initialIntegration: string | (string | null)[] | null = queryParams.integration;
    const initialConnection: string | (string | null)[] | null = queryParams.connection;
    const initialDate: string | (string | null)[] | null = queryParams.date;

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

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
            let queryOffset = offset;
            if (initialOffset && typeof initialOffset === 'string') {
                setOffset(parseInt(initialOffset));
                queryOffset = parseInt(initialOffset);
            }

            let queryStatus = status;
            if (initialStatus && typeof initialStatus === 'string') {
                setStatus(initialStatus);
                queryStatus = initialStatus;
            }

            let queryScript = selectedScript;
            if (initialScript && typeof initialScript === 'string') {
                setSelectedScript(initialScript);
                queryScript = initialScript;
            }

            let queryIntegration = selectedIntegration;
            if (initialIntegration && typeof initialIntegration === 'string') {
                setSelectedIntegration(initialIntegration);
                queryIntegration = initialIntegration;
            }

            let queryConnection = selectedConnection;
            if (initialConnection && typeof initialConnection === 'string') {
                setSelectedConnection(initialConnection);
                queryConnection = initialConnection;
            }

            let queryDate = selectedDate;
            if (initialDate && typeof initialDate === 'string') {
                setDate(initialDate);
                queryDate = initialDate;
            }

            const res = await getActivityAPI(limit, queryOffset, queryStatus, queryScript, queryIntegration, queryConnection, queryDate);

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
            getActivity();
        }
    }, [
        getActivityAPI,
        loaded,
        setLoaded,
        limit,
        offset,
        status,
        selectedScript,
        selectedIntegration,
        selectedConnection,
        selectedDate,
        initialConnection,
        initialIntegration,
        initialScript,
        initialOffset,
        initialStatus,
        initialDate
    ]);

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
                        const allMessages: ActivityMessageResponse = await res.json();
                        const logsWithMessages = activities.map((activity: ActivityResponse) => {
                            const logMessages = allMessages[activity.id];
                            if (logMessages) {
                                activity.messages = logMessages.reverse();
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
        const getFilters = async () => {
            if (activities.length > 0) {
                const res = await fetch(`/api/v1/activity-filters/`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    }
                });

                if (res?.status === 200) {
                    try {
                        const filters = await res.json();

                        if (filters) {
                            if (filters.scripts.length > 0) {
                                filters.scripts.sort((a: string, b: string) => a.localeCompare(b));
                                setScripts(filters.scripts);
                            }

                            if (filters.integrations.length > 0) {
                                filters.integrations.sort((a: string, b: string) => a.localeCompare(b));
                                setIntegrations(filters.integrations);
                            }

                            if (filters.connections.length > 0) {
                                filters.connections.sort((a: string, b: string) => a.localeCompare(b));
                                setConnections(filters.connections);
                            }
                        }
                        setFiltersFetched(true);
                    } catch (e) {
                        console.log(e)
                    }
                }
            }
        };

        if (!filtersFetched) {
            getFilters();
        }
    }, [activities, filtersFetched, setFiltersFetched]);


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
            <div className={`max-w-5xl whitespace-normal break-all overflow-wrap ${getLogColor(level)}`} key={key}>
                <span>{key}: </span>
                {value === null ? '' : <JsonPrettyPrint data={value} />}
            </div>
        ));
    };

    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setStatus(value);
        setLoaded(false);
        setOffset(0);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, status: value, offset: 0 }));
    }

    const handleScriptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedScript(value);
        setLoaded(false);
        setOffset(0);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, script: value, offset: 0 }));
    }

    const handleIntegrationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedIntegration(value);
        setLoaded(false);
        setOffset(0);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, integration: value, offset: 0 }));
    }

    const handleConnectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedConnection(value);
        setLoaded(false);
        setOffset(0);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, connection: value, offset: 0 }));
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDate(value);
        setLoaded(false);
        setOffset(0);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, date: value, offset: 0 }));
    }

    const onRemoveFilter = (action: (val: string) => void, prop: string) => {
        action('');
        setLoaded(false);
        const url = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete(prop);

        const updatedUrl = url + '?' + searchParams.toString();
        navigate(updatedUrl);
    }

    const copyActivityLogUrl = (activity: ActivityResponse): string => {
        const baseUrl = `${window.location.protocol}//${window.location.host}/activity`;
        const url = new URL(baseUrl);
        const params = new URLSearchParams({ env, activity_log_id: activity.id.toString() });

        if (activity.connection_id) {
            params.append('connection', activity.connection_id);
        }

        if (activity.provider_config_key) {
            params.append('integration', activity.provider_config_key);
        }

        if (activity.operation_name) {
            params.append('script', activity.operation_name);
        }

        if (activity.success !== null) {
            const status = activity.success ? 'success' : 'failure';
            params.append('status', status);
        } else {
            params.append('status', 'in_progress');
        }

        if (activity.timestamp) {
            const date = new Date(Number(activity.timestamp));
            const dateString = date.toISOString().split('T')[0];
            params.append('date', dateString);
        }

        url.search = params.toString();

        return url.toString();
    };

    const getLogColor = (level: string) => {
        switch(level) {
            case 'error':
                return 'text-red-500';
            case 'warn':
                return 'text-yellow-500';
            case 'debug':
                return 'text-gray-500';
            case 'http':
                return 'text-green-500';
            case 'silly':
                return 'text-green-300';
            default:
                return '';
        }
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Activity}>
            <div className="max-w-screen-xl px-16 w-fit mx-auto">
                <div className="flex items-center mt-16 mb-6">
                    <div className="flex flex-col text-left">
                        <span className="flex items-center mb-3">
                            <h2 className="text-3xl font-semibold tracking-tight text-white mr-4">Activity</h2>
                            {!loaded && <Spinner size={1.5} />}
                        </span>
                        <span>
                            <p className="text-white text-left">Note that logs older than 15 days are cleared</p>
                        </span>
                    </div>
                </div>
                {loaded && activities.length === 0 && (!status && !selectedIntegration && !selectedScript && !selectedConnection && !selectedDate) ? null : (
                    <div className="flex justify-between p-3 mb-6 items-center border border-border-gray rounded-md min-w-[1150px]">
                        <div className="flex space-x-10 justify-between px-2 w-full">
                            <div className="flex w-full items-center">
                                <select
                                    id="status"
                                    name="status"
                                    className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm"
                                    onChange={handleStatusChange}
                                    value={status}
                                >
                                    <option key="" value="" disabled>Status</option>
                                    <option key="success" value="success">Success</option>
                                    <option key="progress" value="in_progress">In Progress</option>
                                    <option key="failure" value="failure">Failure</option>
                                </select>
                                {status && (
                                    <XCircleIcon onClick={() => onRemoveFilter(setStatus, 'status')} className="flex h-7 h-7 cursor-pointer text-blue-400" />
                                )}
                            </div>
                            {scripts.length > 0 && (
                                <div className="flex w-full items-center">
                                    <select
                                        id="script"
                                        name="script"
                                        className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm"
                                        onChange={handleScriptChange}
                                        value={selectedScript}
                                    >
                                        <option key="" value="" disabled>Script</option>
                                        {scripts.map((script: string) => (
                                            <option key={script} value={script}>{script}</option>
                                        ))}
                                    </select>
                                    {selectedScript && (
                                        <XCircleIcon onClick={() => onRemoveFilter(setSelectedScript, 'script')} className="flex h-7 h-7 cursor-pointer text-blue-400" />
                                    )}
                                </div>
                            )}
                            {connections.length > 0 && (
                                <div className="flex w-full items-center">
                                    <select
                                        id="connection"
                                        name="connection"
                                        className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm"
                                        onChange={handleConnectionChange}
                                        value={selectedConnection}
                                    >
                                        <option key="" value="" disabled>Connection</option>
                                        {connections.map((connection: string) => (
                                            <option key={connection} value={connection}>{connection}</option>
                                        ))}
                                    </select>
                                    {selectedConnection && (
                                        <XCircleIcon onClick={() => onRemoveFilter(setSelectedConnection, 'connection')} className="flex h-7 h-7 cursor-pointer text-blue-400" />
                                    )}
                                </div>
                            )}
                            {integrations.length > 0 && (
                                <div className="flex w-full items-center">
                                    <select
                                        id="integration"
                                        name="integration"
                                        className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm"
                                        onChange={handleIntegrationChange}
                                        value={selectedIntegration}
                                    >
                                        <option key="" value="" disabled>Integration</option>
                                        {integrations.map((integration: string) => (
                                            <option key={integration} value={integration}>{integration}</option>
                                        ))}
                                    </select>
                                    {selectedIntegration && (
                                        <XCircleIcon onClick={() => onRemoveFilter(setSelectedIntegration, 'integration')} className="flex h-7 h-7 cursor-pointer text-blue-400" />
                                    )}
                                </div>
                            )}
                            <div className="flex w-full items-center">
                                  <input
                                    type="date"
                                    id="date-filter"
                                    name="date-filter"
                                    className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm hide-calendar-icon"
                                    style={{ WebkitAppearance: 'none' }}
                                    onChange={handleDateChange}
                                    value={selectedDate}
                                    max={new Date().toISOString().split('T')[0]}
                                    min={fifteenDaysAgo.toISOString().split('T')[0]}
                                  />
                                  {selectedDate && (
                                      <XCircleIcon onClick={() => onRemoveFilter(setDate, 'date')} className="flex h-7 h-7 cursor-pointer text-blue-400" />
                                  )}
                            </div>
                        </div>
                        <div className="flex">
                            {offset >= limit * 3 && (
                                <ChevronsLeft onClick={resetOffset} className="flex stroke-white cursor-pointer mr-3" size="16" />
                            )}
                            <span onClick={decrementPage} className={`flex ${offset - limit >= 0 ? 'cursor-pointer hover:bg-gray-700' : ''} h-8 mr-2 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}>
                              <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd"></path></svg>
                            </span>
                            <span onClick={incrementPage} className={`flex ${activities.length < limit ? '' : 'cursor-pointer hover:bg-gray-700'} h-8 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}>
                              <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                            </span>
                        </div>
                    </div>
                )}

                {loaded && activities.length === 0 && (
                    <div className="flex items-center">
                        <Slash className="stroke-red-500" />
                        <div className="text-white ml-3">No activity found</div>
                    </div>
                )}
                {activities.length > 0 && (
                    <>
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
                                                    {activity?.action === 'cancel sync' && (
                                                        <span className="flex items-center">
                                                            <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-gray-500 bg-opacity-20">
                                                                <XSquare className="stroke-red-500 mr-2" size="16" />
                                                                <p className="inline-block text-gray-500">cancel sync</p>
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
                                                    {activity.messages && activity.messages.length > 0 && activity.messages[0] && <CopyButton icontype="link" dark text={copyActivityLogUrl(activity)} />}
                                            </div>
                                            {activity.id === expandedRow && activity.messages && activity.messages[0] && (
                                                <>
                                                <div className="flex flex-col space-y-4 mt-6 font-mono">
                                                    {activity.messages.length >= 1000 && (
                                                        <div className='text-center text-gray-500'>[only showing the last 1000 logs]</div>
                                                    )}
                                                    {activity.messages.map((message, index: number) => (
                                                        <div key={index} className="flex flex-col max-w-7xl">
                                                            <div className="whitespace-normal break-all overflow-wrap">
                                                                <span className="text-gray-500">
                                                                    {formatTimestampWithTZ(Number(message?.timestamp))}
                                                                </span>{' '}
                                                                <span
                                                                    className={`whitespace-normal break-all overflow-wrap ${getLogColor(message?.level as string)}`}
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
            <Helmet>
                <style>
                    {'::-webkit-calendar-picker-indicator { filter: invert(1); }'}
                </style>
          </Helmet>
        </DashboardLayout>
    );
}
