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
import { useMeta } from '../hooks/useMeta';
import { useSignout } from '../utils/user';
import { HomeIcon, RocketIcon } from '@radix-ui/react-icons';
import { useConnectionsCount } from '../hooks/useConnections';
import { useUser } from '../hooks/useUser';
import { globalEnv } from '../utils/env';
import { IconX } from '@tabler/icons-react';
import type { MaybePromise } from '@nangohq/types';
import { apiPatchOnboarding } from '../hooks/useOnboarding';
import { EnvironmentPicker } from './EnvironmentPicker';

export enum LeftNavBarItems {
    Homepage,
    Integrations,
    Connections,
    EnvironmentSettings,
    Syncs,
    TeamSettings,
    UserSettings,
    GettingStarted,
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
    onClose?: () => MaybePromise<void>;
}

const navTextColor = 'text-gray-400';
const navActiveBg = 'bg-active-gray';
const navHoverBg = 'hover:bg-hover-gray';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [showUserSettings, setShowUserSettings] = useState<boolean>(false);
    const navigate = useNavigate();
    const signout = useSignout();
    const { meta, mutate: mutateMeta } = useMeta();
    const { user: me } = useUser();
    const env = useStore((state) => state.env);
    const { data } = useConnectionsCount(env);
    const showGettingStarted = useStore((state) => state.showGettingStarted);

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
        const list: MenuItem[] = [];
        if (meta && showGettingStarted && !meta.onboardingComplete) {
            list.push({
                name: 'Getting Started',
                icon: RocketIcon,
                value: LeftNavBarItems.GettingStarted,
                link: `/${env}/getting-started`,
                onClose: async () => {
                    await apiPatchOnboarding(env);
                    void mutateMeta();
                }
            });
        }

        list.push({ name: 'Home', icon: HomeIcon, value: LeftNavBarItems.Homepage, link: `/${env}` });
        list.push({ name: 'Integrations', icon: SquaresPlusIcon, value: LeftNavBarItems.Integrations, link: `/${env}/integrations` });
        list.push({ name: 'Connections', icon: LinkIcon, value: LeftNavBarItems.Connections, link: `/${env}/connections` });
        list.push({ name: 'Logs', icon: QueueListIcon, value: LeftNavBarItems.Logs, link: `/${env}/logs` });
        list.push({
            name: 'Environment Settings',
            icon: AdjustmentsHorizontalIcon,
            value: LeftNavBarItems.EnvironmentSettings,
            link: `/${env}/environment-settings`
        });

        return list;
    }, [env, showGettingStarted, meta]);

    if (!meta || !me) {
        return null;
    }

    return (
        <div className="bg-pure-black h-screen w-full">
            <div className="flex-1 h-full border-r border-border-gray flex flex-col bg-pure-black z-20 justify-between">
                <div className="mt-4">
                    <div className="flex items-center mx-4">
                        <img className="h-6" src="/logo-dark.svg" alt="Nango" />
                        <img className="mt-1 h-5 ml-1" src="/logo-text.svg" alt="Nango" />
                        <span className="ml-3 text-xs text-black mono">{meta.version}</span>
                    </div>

                    <div className="pt-8 pb-8 border-b border-b-grayscale-700 mx-4">
                        <EnvironmentPicker />
                    </div>

                    <div className="flex flex-col gap-1 mt-8 mx-4">
                        {items.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.value}
                                    to={item.link}
                                    className={`relative flex h-9 p-2 gap-x-3 items-center justify-between rounded-md text-sm ${navTextColor} ${
                                        props.selectedItem === item.value ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className="w-[18px] h-[18px]" />
                                        {item.name === 'Connections' && data?.data.withError !== undefined && data.data.withError > 0 && (
                                            <span className="absolute top-[9.5px] left-[23px] bg-red-base h-1.5 w-1.5 rounded-full"></span>
                                        )}
                                        <p>{item.name}</p>
                                    </div>
                                    {item.onClose && (
                                        <button className="p-2 hover:text-white" onClick={item.onClose}>
                                            <IconX size={10} />
                                        </button>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </div>
                <div className="mx-4">
                    <div
                        className="flex mb-5 py-2 w-full user-settings px-2 justify-between relative rounded items-center hover:bg-hover-gray cursor-pointer"
                        onClick={() => setShowUserSettings(!showUserSettings)}
                    >
                        <div className="flex items-center">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                                {me?.email.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="items-center w-32 text-gray-400 justify-center text-left text-sm truncate">{me?.email}</span>
                        </div>
                        {globalEnv.features.auth && <EllipsisHorizontalIcon className="flex h-5 w-5 ml-3 text-gray-400 cursor-pointer" />}
                        {globalEnv.features.auth && showUserSettings && (
                            <div className="absolute bottom-[45px] text-sm left-0 group-hover:block border border-neutral-700 w-[223px] bg-pure-black z-10 rounded">
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
                                    {showGettingStarted && meta.onboardingComplete && (
                                        <Link
                                            to="/dev/getting-started"
                                            className={`flex h-9 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                                props.selectedItem === LeftNavBarItems.GettingStarted
                                                    ? `${navActiveBg} text-white`
                                                    : `text-gray-400 ${navHoverBg}`
                                            }`}
                                        >
                                            <RocketIcon />
                                            <p>Getting Started</p>
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
