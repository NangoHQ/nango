import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    SquaresPlusIcon,
    LinkIcon,
    QueueListIcon,
    AdjustmentsHorizontalIcon,
    EllipsisHorizontalIcon,
    UserCircleIcon,
    UserGroupIcon,
    ArrowRightOnRectangleIcon as LogoutIcon
} from '@heroicons/react/24/outline';

import { useStore } from '../store';
import { isLocal, isCloud, isEnterprise } from '../utils/utils';
import { useMeta } from '../hooks/useMeta';
import { useSignout } from '../utils/user';
import { HomeIcon, RocketIcon } from '@radix-ui/react-icons';
import { useEnvironment } from '../hooks/useEnvironment';
import { useConnections } from '../hooks/useConnections';
import { useUser } from '../hooks/useUser';

export enum LeftNavBarItems {
    Homepage,
    Integrations,
    Connections,
    EnvironmentSettings,
    Syncs,
    TeamSettings,
    UserSettings,
    InteractiveDemo,
    Logs
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}
interface MenuItem {
    name: string;
    value: LeftNavBarItems;
    icon: React.FC<{ className?: string }>;
    link: string;
}

const navTextColor = 'text-gray-400';
const navActiveBg = 'bg-active-gray';
const navHoverBg = 'hover:bg-hover-gray';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [showUserSettings, setShowUserSettings] = useState<boolean>(false);
    const navigate = useNavigate();
    const signout = useSignout();
    const { meta } = useMeta();
    const { user: me } = useUser();
    const env = useStore((state) => state.env);
    const { errorNotifications } = useConnections(env);
    const setEnv = useStore((state) => state.setEnv);
    const { mutate } = useEnvironment(env);
    const showInteractiveDemo = useStore((state) => state.showInteractiveDemo);

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

    const items = useMemo(() => {
        const list: MenuItem[] = [{ name: 'Home', icon: HomeIcon, value: LeftNavBarItems.Homepage, link: `/${env}` }];
        if (meta && showInteractiveDemo && !meta.onboardingComplete) {
            list.push({ name: 'Interactive Demo', icon: RocketIcon, value: LeftNavBarItems.InteractiveDemo, link: `/dev/interactive-demo` });
        }

        list.push({ name: 'Integrations', icon: SquaresPlusIcon, value: LeftNavBarItems.Integrations, link: `/dev/integrations` });
        list.push({ name: 'Connections', icon: LinkIcon, value: LeftNavBarItems.Connections, link: `/dev/connections` });
        list.push({ name: 'Logs', icon: QueueListIcon, value: LeftNavBarItems.Logs, link: `/dev/logs` });
        list.push({
            name: 'Environment Settings',
            icon: AdjustmentsHorizontalIcon,
            value: LeftNavBarItems.EnvironmentSettings,
            link: `/dev/environment-settings`
        });

        return list;
    }, [env, showInteractiveDemo, meta]);

    const handleEnvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEnv = e.target.value;
        setEnv(newEnv);
        void mutate();

        const pathSegments = window.location.pathname.split('/').filter(Boolean);

        pathSegments[0] = newEnv;

        let newPath = `/${pathSegments.join('/')}`;

        // If on 'integration' or 'connections' subpages beyond the second level, redirect to their parent page
        if (pathSegments[1] === 'integration' && pathSegments.length > 2) {
            newPath = `/${newEnv}/integrations`;
        } else if (pathSegments[1] === 'connections' && pathSegments.length > 2) {
            newPath = `/${newEnv}/connections`;
        }

        navigate(newPath);
    };

    if (!meta || !me) {
        return null;
    }

    return (
        <div className="bg-pure-black h-screen w-full">
            <div className="flex-1 ml-3 pr-4 h-full border-r border-border-gray flex flex-col bg-pure-black z-20 justify-between">
                <div className="mt-4">
                    <div className="flex items-center mb-8">
                        <img className="h-6" src="/logo-dark.svg" alt="Nango" />
                        <img className="mt-1 h-5 ml-1" src="/logo-text.svg" alt="Nango" />
                        <span className="ml-3 text-xs text-black mono">{meta.version}</span>
                    </div>
                    {meta.environments.length === 0 && (
                        <div className="mb-8">
                            <select className="border-border-gray bg-active-gray text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"></select>
                        </div>
                    )}
                    {meta.environments.length > 0 && (
                        <div className="mb-6">
                            <select
                                id="environment"
                                name="env"
                                className="border-border-gray bg-active-gray text-sm text-white block w-full appearance-none rounded-md border px-3 py-1 shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                onChange={handleEnvChange}
                                value={env}
                            >
                                {meta.environments.map((env) => (
                                    <option key={env.name} value={env.name}>
                                        {env.name.slice(0, 1).toUpperCase() + env.name.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        {items.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.value}
                                    to={item.link}
                                    className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                        props.selectedItem === item.value ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                                    }`}
                                >
                                    <Icon className="w-[18px] h-[18px]" />
                                    {item.name === 'Connections' && errorNotifications > 0 && (
                                        <span className="absolute top-[9.5px] left-[23px] bg-red-base h-1.5 w-1.5 rounded-full"></span>
                                    )}
                                    <p>{item.name}</p>
                                </Link>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <div
                        className="flex mb-5 py-2 w-full user-settings px-2 justify-between relative rounded items-center hover:bg-hover-gray cursor-pointer"
                        onClick={() => setShowUserSettings(!showUserSettings)}
                    >
                        <div className="flex items-center">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                                {me.email.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="items-center w-32 text-gray-400 justify-center text-left text-sm truncate">{me.email}</span>
                        </div>
                        <EllipsisHorizontalIcon className="flex h-5 w-5 ml-3 text-gray-400 cursor-pointer" />
                        {(isCloud() || isEnterprise() || isLocal()) && showUserSettings && (
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
                                        className={`flex items-center w-full px-2 py-2.5 hover:text-white hover:bg-hover-gray rounded p-1 ${props.selectedItem === LeftNavBarItems.TeamSettings ? 'text-white bg-active-gray' : ''}`}
                                        onClick={() => navigate(`/${env}/team-settings`)}
                                    >
                                        <UserGroupIcon className="h-5 w-5 mr-2" />
                                        <span>Team</span>
                                    </li>

                                    {showInteractiveDemo && meta.onboardingComplete && (
                                        <Link
                                            to="/dev/interactive-demo"
                                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                                props.selectedItem === LeftNavBarItems.InteractiveDemo
                                                    ? `${navActiveBg} text-white`
                                                    : `text-gray-400 ${navHoverBg}`
                                            }`}
                                        >
                                            <RocketIcon />
                                            <p>Interactive Demo</p>
                                        </Link>
                                    )}
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
                </div>
            </div>
        </div>
    );
}
