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
const navActiveBg = 'bg-zinc-900';
const navHoverBg = 'hover:bg-neutral-800';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [envs, setEnvs] = useState<{ name: string; }[]>([]);
    const [version, setVersion] = useState<string>('');
    const [email, setEmail] = useState<string>('');
    const [showUserSettings, setShowUserSettings] = useState<boolean>(false);
    const navigate = useNavigate();

    const signout = useSignout();

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
                setEnvs(data.environments);
                setVersion(data.version);
                setEmail(data.email);
            })
            .catch(err => {
                console.error(err);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const env = useStore(state => state.cookieValue);
    console.log(version)

    const setCookieValue = useStore(state => state.setCookieValue);

    const handleEnvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEnv = e.target.value;
        Cookies.set('env', newEnv);
        setCookieValue(newEnv);
        // if on certain subpages redirect to the parent page since the entity
        // is environment specific
        if (window.location.pathname.includes('integration') && window.location.pathname.split('/').length > 2) {
            window.location.href = '/integrations';
        }

        if (window.location.pathname.includes('connections') && window.location.pathname.split('/').length > 2) {
            window.location.href = '/connections';
        }
    }

    return (
        <div>
            <div className="h-full pt-14 border-r-2 border-t-2 border-border-gray flex flex-col w-60 fixed bg-bg-black z-20 justify-between">
                <div className="mt-8 px-6">
                    {envs.length === 0 && (
                        <div className="mb-8">
                            <select className="border-border-gray bg-bg-black text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"></select>
                        </div>
                    )}
                    {envs.length > 0 && (
                        <div className="mb-8">
                            <select
                                id="environment"
                                name="env"
                                className="border-border-gray bg-bg-black text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
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
                                to="/getting-started"
                                className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                    props.selectedItem === LeftNavBarItems.GettingStarted ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                                }`}
                            >
                                <img className="h-5" src="/images/rocket-icon.svg" alt="" />
                                <p>Getting Started</p>
                            </Link>
                        )}
                        <Link
                            to="/integrations"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Integrations ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <SquaresPlusIcon className="flex h-5 w-5 text-white" />
                            <p>Integrations</p>
                        </Link>
                        <Link
                            to="/connections"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Connections ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <BuildingOfficeIcon className="flex h-5 w-5 text-white" />
                            <p>Connections</p>
                        </Link>
                        <Link
                            to="/activity"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Activity ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <QueueListIcon className="flex h-5 w-5 text-white" />
                            <p>Activity</p>
                        </Link>
                        <Link
                            to="/project-settings"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.ProjectSettings ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <AdjustmentsHorizontalIcon className="flex h-5 w-5 text-white" />
                            <p>Settings</p>
                        </Link>
                    </div>
                </div>
                <div className='px-6'>
                    {email && (
                        <div className="flex mb-8 py-2 px-2 relative rounded items-center hover:bg-neutral-800 cursor-pointer" onClick={() => setShowUserSettings(!showUserSettings)}>
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                                {email.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="items-center text-center text-gray-400 justify-center text-sm truncate">
                                {email}
                            </span>
                            <EllipsisHorizontalIcon className="flex h-5 w-5 ml-3 text-gray-400 cursor-pointer" />
                            {showUserSettings &&  isCloud() && (
                            <div className="absolute -top-[130px] left-0 group-hover:block border border-neutral-700 h-32 w-[190px] bg-black opacity-50 z-10 rounded">
                                <ul className="text-gray-400 p-3 space-y-2">
                                    <li
                                        className={`flex items-center w-full hover:text-white hover:bg-neutral-800 rounded p-1 ${props.selectedItem === LeftNavBarItems.UserSettings ? 'text-white' : ''}`}
                                        onClick={() => navigate('/user-settings')}
                                    >
                                        <UserCircleIcon className="h-5 w-5 mr-2" />
                                        <span>Profile</span>
                                    </li>
                                    <li
                                        className={`flex items-center w-full hover:text-white hover:bg-neutral-800 rounded p-1 ${props.selectedItem === LeftNavBarItems.AccountSettings ? 'text-white' : ''}`}
                                        onClick={() => navigate('/account-settings')}
                                    >
                                        <UserGroupIcon className="h-5 w-5 mr-2" />
                                        <span>Team</span>
                                    </li>
                                    <li
                                        className="flex items-center w-full hover:text-white hover:bg-neutral-800 rounded p-1"
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
