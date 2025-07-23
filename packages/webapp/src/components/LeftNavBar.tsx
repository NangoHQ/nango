import {
    IconAdjustmentsHorizontal,
    IconApps,
    IconChartBar,
    IconChevronDown,
    IconChevronUp,
    IconCirclesRelation,
    IconCreditCard,
    IconLogout,
    IconLogs,
    IconRocket,
    IconUserCircle,
    IconUsersGroup,
    IconX
} from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClickAway } from 'react-use';

import { EnvironmentPicker } from './EnvironmentPicker';
import { useConnectionsCount } from '../hooks/useConnections';
import { useMeta } from '../hooks/useMeta';
import { apiPatchOnboarding } from '../hooks/useOnboarding';
import { useUser } from '../hooks/useUser';
import { useStore } from '../store';
import { globalEnv } from '../utils/env';
import { useSignout } from '../utils/user';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';

import type { MaybePromise } from '@nangohq/types';

export enum LeftNavBarItems {
    Homepage,
    Integrations,
    Connections,
    EnvironmentSettings,
    Syncs,
    TeamSettings,
    TeamBilling,
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
    icon: typeof IconLogs;
    link: string;
    onClose?: () => MaybePromise<void>;
}

const navTextColor = 'text-gray-400';
const navActiveBg = 'bg-active-gray';
const navHoverBg = 'hover:bg-hover-gray';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [showUserSettings, setShowUserSettings] = useState<boolean>(false);
    const signout = useSignout();
    const { meta, mutate: mutateMeta } = useMeta();
    const { user: me } = useUser();
    const env = useStore((state) => state.env);
    const { data } = useConnectionsCount(env);
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const refMenu = useRef<HTMLDivElement | null>(null);

    useClickAway(refMenu, () => {
        setShowUserSettings(false);
    });

    const items = useMemo(() => {
        const list: MenuItem[] = [];
        if (meta && showGettingStarted && !meta.onboardingComplete) {
            list.push({
                name: 'Getting Started',
                icon: IconRocket,
                value: LeftNavBarItems.GettingStarted,
                link: `/${env}/getting-started`,
                onClose: async () => {
                    await apiPatchOnboarding(env);
                    void mutateMeta();
                }
            });
        }

        list.push({ name: 'Metrics', icon: IconChartBar, value: LeftNavBarItems.Homepage, link: `/${env}` });
        list.push({ name: 'Integrations', icon: IconApps, value: LeftNavBarItems.Integrations, link: `/${env}/integrations` });
        list.push({ name: 'Connections', icon: IconCirclesRelation, value: LeftNavBarItems.Connections, link: `/${env}/connections` });
        list.push({ name: 'Logs', icon: IconLogs, value: LeftNavBarItems.Logs, link: `/${env}/logs` });
        list.push({
            name: 'Environment Settings',
            icon: IconAdjustmentsHorizontal,
            value: LeftNavBarItems.EnvironmentSettings,
            link: `/${env}/environment-settings`
        });

        return list;
    }, [env, showGettingStarted, meta]);

    const userMenu = useMemo<MenuItem[]>(() => {
        if (!globalEnv.features.auth || !meta) {
            return [];
        }

        const list: MenuItem[] = [
            { link: `/${env}/user-settings`, name: 'Profile', icon: IconUserCircle, value: LeftNavBarItems.UserSettings },
            { link: `/${env}/team-settings`, name: 'Team', icon: IconUsersGroup, value: LeftNavBarItems.TeamSettings }
        ];

        if (showGettingStarted && meta.onboardingComplete) {
            list.push({ link: `/dev/getting-started`, name: 'Getting Started', icon: IconRocket, value: LeftNavBarItems.GettingStarted });
        }

        if (globalEnv.features.plan) {
            list.push({ link: `/${env}/team/billing`, name: 'Usage & Billing', icon: IconCreditCard, value: LeftNavBarItems.TeamBilling });
        }

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
                        <span className="ml-3 text-xs text-black mono">
                            {meta.version} {globalEnv.gitHash && `(${globalEnv.gitHash})`}
                        </span>
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
                    <Button variant={'emptyFaded'} className="mb-4 w-full border-none bg-grayscale-2" onClick={() => setShowUserSettings(!showUserSettings)}>
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                            {me?.email.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="items-center w-32 text-gray-400 justify-center text-left text-sm truncate">{me?.email}</div>
                        {userMenu.length > 0 && showUserSettings ? (
                            <IconChevronDown stroke={1} size={18} />
                        ) : userMenu.length > 0 ? (
                            <IconChevronUp stroke={1} size={18} />
                        ) : null}
                    </Button>
                    {userMenu.length > 0 && showUserSettings && (
                        <div
                            className="absolute bottom-[45px] text-sm left-4 group-hover:block border border-neutral-700 w-[223px] bg-pure-black z-10 rounded"
                            ref={refMenu}
                        >
                            <ul className="text-gray-400 space-y-1 p-0.5 px-1">
                                {userMenu.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.name}
                                            className={cn(
                                                'flex gap-2 items-center w-full px-2 py-2.5 hover:text-white hover:bg-grayscale-2 rounded text-gray-400',
                                                props.selectedItem === item.value && `bg-grayscale-2 text-white`
                                            )}
                                            to={item.link}
                                        >
                                            <Icon stroke={1} size={18} />
                                            <span>{item.name}</span>
                                        </Link>
                                    );
                                })}

                                <li
                                    className={cn('flex gap-2 items-center w-full px-2 py-2.5 hover:text-white hover:bg-hover-gray rounded text-gray-400')}
                                    onClick={async () => await signout()}
                                >
                                    <IconLogout stroke={1} size={18} />
                                    <span>Log Out</span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
