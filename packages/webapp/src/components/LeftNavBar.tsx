import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { Link, useNavigate } from 'react-router-dom';
import {
    SquaresPlusIcon,
    BuildingOfficeIcon,
    QueueListIcon,
    AdjustmentsHorizontalIcon,
    EllipsisHorizontalIcon,
    UserCircleIcon,
    UserGroupIcon,
    ArrowRightOnRectangleIcon as LogoutIcon,
} from '@heroicons/react/24/outline'

import { useStore } from '../store';
import { isCloud } from '../utils/utils';
import { useSignout } from '../utils/user';

export enum LeftNavBarItems {
    Integrations = 0,
    Connections,
    ProjectSettings,
    Activity,
    Syncs,
    AccountSettings,
    UserSettings,
    GettingStarted
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}

const navTextColor = 'text-gray-400';
const navActiveBg = 'bg-active-gray';
const navHoverBg = 'hover:bg-hover-gray';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [version, setVersion] = useState<string>('');
    const [email, setEmail] = useState<string>('');
    const [showUserSettings, setShowUserSettings] = useState<boolean>(false);
    const navigate = useNavigate();

    const signout = useSignout();

    const storedEnvs = useStore(state => state.envs);
    const [envs, setEnvs] = useState<{ name: string; }[]>(storedEnvs);
    const setStoredEnvs = useStore(state => state.setEnvs);
    const setBaseUrl = useStore(state => state.setBaseUrl);

    useEffect(() => {
        fetch('/api/v1/meta')
            .then(res => {
                if(res.status === 401) {
                    return signout();
                }
                return res.json();
            })
            .then(data => {
                if(!data) return;
                if(JSON.stringify(data.environments) !== JSON.stringify(envs)) {
                    setEnvs(data.environments);
                    setStoredEnvs(data.environments);
                    setBaseUrl(data.baseUrl);
                }
                setVersion(data.version);
                setEmail(data.email);
            })
            .catch(err => {
                console.error(err);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const closeUserSettings = (e: MouseEvent) => {
            if (showUserSettings && !(e.target as HTMLElement).closest('.user-settings')) {
                setShowUserSettings(false);
            }
        };

        document.addEventListener('click', closeUserSettings);

        return () => {
            document.removeEventListener('click', closeUserSettings);
        };
    }, [showUserSettings]);

    const env = useStore(state => state.cookieValue);

    const setCookieValue = useStore(state => state.setCookieValue);

    const handleEnvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEnv = e.target.value;
        Cookies.set('env', newEnv);
        setCookieValue(newEnv);

        const pathSegments = window.location.pathname.split('/').filter(Boolean);

        pathSegments[0] = newEnv;

        let newPath = `/${pathSegments.join('/')}`;

        // If on 'integration' or 'connections' subpages beyond the second level, redirect to their parent page
        if (pathSegments[1] === 'integration' && pathSegments.length > 2) {
            newPath = `/${newEnv}/integrations`;
        } else if (pathSegments[1] === 'connections' && pathSegments.length > 2) {
            newPath = `/${newEnv}/connections`;
        }

        window.location.href = newPath;
    };

    return (
        <div className="bg-pure-black">
            <div className="flex-1 ml-3 pr-4 h-full border-r border-border-gray flex flex-col w-60 bg-pure-black z-20 justify-between">
                <div className="mt-4">
                    <div className="flex items-center mb-8">
                        <img className="h-6" src="/logo-dark.svg" alt="Nango" />
                        <img className="mt-1 h-5 ml-1" src="/logo-text.svg" alt="Nango" />
                        <span className="ml-3 text-xs text-black mono">{version}</span>
                    </div>
                    {envs.length === 0 && (
                        <div className="mb-8">
                            <select className="border-border-gray bg-active-gray text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"></select>
                        </div>
                    )}
                    {envs.length > 0 && (
                        <div className="mb-6">
                            <select
                                id="environment"
                                name="env"
                                className="border-border-gray bg-active-gray text-sm text-white block w-full appearance-none rounded-md border px-3 py-1 shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                onChange={handleEnvChange}
                                value={env}
                            >
                                {envs.map((env) => (
                                    <option key={env.name} value={env.name}>
                                        {env.name.slice(0, 1).toUpperCase() + env.name.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        {env === 'dev' && (
                            <Link
                                to="/dev/getting-started"
                                className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                    props.selectedItem === LeftNavBarItems.GettingStarted ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                                }`}
                            >
                                <img className="h-5" src="/images/rocket-icon.svg" alt="" />
                                <p>Getting Started</p>
                            </Link>
                        )}
                        <Link
                            to={`/${env}/integrations`}
                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Integrations ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <SquaresPlusIcon className={`flex h-5 w-5 ${props.selectedItem === LeftNavBarItems.Integrations ? 'text-white' : 'text-gray-400'}`} />
                            <p>Integrations</p>
                        </Link>
                        <Link
                            to={`/${env}/connections`}
                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Connections ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <BuildingOfficeIcon className={`flex h-5 w-5 ${props.selectedItem === LeftNavBarItems.Connections ? 'text-white' : 'text-gray-400'}`} />
                            <p>Connections</p>
                        </Link>
                        <Link
                            to={`/${env}/activity`}
                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Activity ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <QueueListIcon className={`flex h-5 w-5 ${props.selectedItem === LeftNavBarItems.Activity ? 'text-white' : 'text-gray-400'}`} />
                            <p>Logs</p>
                        </Link>
                        <Link
                            to={`/${env}/project-settings`}
                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.ProjectSettings ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <AdjustmentsHorizontalIcon className={`flex h-5 w-5 ${props.selectedItem === LeftNavBarItems.ProjectSettings ? 'text-white' : 'text-gray-400'}`} />
                            <p>Settings</p>
                        </Link>
                    </div>
                </div>
                <div>
                    {email && (
                        <div className="flex mb-5 py-2 w-full user-settings px-2 justify-between relative rounded items-center hover:bg-hover-gray cursor-pointer" onClick={() => setShowUserSettings(!showUserSettings)}>
                            <div className="flex items-center">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                                    {email.slice(0, 1).toUpperCase()}
                                </div>
                                <span className="items-center text-center text-gray-400 justify-center text-left text-sm truncate">
                                    {email}
                                </span>
                            </div>
                            <EllipsisHorizontalIcon className="flex h-5 w-5 ml-3 text-gray-400 cursor-pointer" />
                            {isCloud() && showUserSettings && (
                            <div className="absolute -top-[140px] text-sm left-0 group-hover:block border border-neutral-700 w-[223px] bg-pure-black z-10 rounded">
                                <ul className="text-gray-400 space-y-1 p-0.5 px-1">
                                    <li
                                        className={`flex items-center w-full px-2 py-2.5 hover:text-white hover:bg-hover-gray rounded p-1 ${props.selectedItem === LeftNavBarItems.UserSettings ? 'text-white bg-active-gray' : ''}`}
                                        onClick={() => navigate(`/${env}/user-settings`)}
                                    >
                                        <UserCircleIcon className="h-5 w-5 mr-2" />
                                        <span>Profile</span>
                                    </li>
                                    <li
                                        className={`flex items-center w-full px-2 py-2.5 hover:text-white hover:bg-hover-gray rounded p-1 ${props.selectedItem === LeftNavBarItems.AccountSettings ? 'text-white bg-active-gray' : ''}`}
                                        onClick={() => navigate(`/${env}/account-settings`)}
                                    >
                                        <UserGroupIcon className="h-5 w-5 mr-2" />
                                        <span>Team</span>
                                    </li>
                                    <li
                                        className="flex items-center w-full px-2 py-2.5 hover:text-white hover:bg-hover-gray rounded p-1"
                                        onClick={async () => await signout()}
                                    >
                                        <LogoutIcon className="h-5 w-5 mr-2" />
                                        <span>Log Out</span>
                                    </li>
                                </ul>
                            </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
