import Cookies from 'js-cookie';
import { Link } from 'react-router-dom';
import { Activity, Briefcase, User } from '@geist-ui/icons';

import { useStore } from '../store';
import { isCloud } from '../utils/utils';

export enum LeftNavBarItems {
    Integrations = 0,
    Connections,
    ProjectSettings,
    Activity,
    Syncs,
    AccountSettings,
    UserSettings
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}

export default function LeftNavBar(props: LeftNavBarProps) {
    const env = useStore(state => state.cookieValue);

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
            <div className="h-[calc(100vh-1rem)] mt-14 border-r-2 border-t-2 border-border-gray flex flex-col h-full w-60 fixed bg-bg-black z-50 justify-between">
                <div className="">
                    <div className="mt-10">
                        <select
                            id="environment"
                            name="env"
                            className="ml-8 border-border-gray bg-bg-black text-text-light-gray block h-11 w-24 appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                            onChange={handleEnvChange}
                            value={env}
                        >
                            <option key="dev" value="dev">
                                Dev
                            </option>
                            <option key="prod" value="prod">
                                Prod
                            </option>
                        </select>
                    </div>
                    <div className="ml-4 mt-8 space-y-1">
                        <Link
                            to="/integrations"
                            className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white mt-3 w-44 ${
                                props.selectedItem === LeftNavBarItems.Integrations ? 'bg-gray-800' : 'hover:bg-gray-700'
                            }`}
                        >
                            <img className="h-5 mr-3" src="/images/integrations-icon.svg" alt="" />
                            <p>Integrations</p>
                        </Link>
                        <Link
                            to="/connections"
                            className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${
                                props.selectedItem === LeftNavBarItems.Connections ? 'bg-gray-800' : 'hover:bg-gray-700'
                            }`}
                        >
                            <img className="h-5 mr-3" src="/images/connections-icon.svg" alt="" />
                            <p>Connections</p>
                        </Link>
                        <Link
                            to="/syncs"
                            className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${
                                props.selectedItem === LeftNavBarItems.Syncs ? 'bg-gray-800' : 'hover:bg-gray-700'
                            }`}
                        >
                            <img className="h-5 mr-3 stroke-white fill-white" src="/images/sync-code-icon.svg" alt="" />
                            <p>Syncs</p>
                        </Link>
                        <Link
                            to="/activity"
                            className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${
                                props.selectedItem === LeftNavBarItems.Activity ? 'bg-gray-800' : 'hover:bg-gray-700'
                            }`}
                        >
                            <Activity className="h-5 mr-3" />
                            <p>Activity</p>
                        </Link>
                        <Link
                            to="/project-settings"
                            className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${
                                props.selectedItem === LeftNavBarItems.ProjectSettings ? 'bg-gray-800' : 'hover:bg-gray-700'
                            }`}
                        >
                            <img className="h-5 mr-3" src="/images/settings-icon.svg" alt="" />
                            <p>Project Settings</p>
                        </Link>
                    </div>
                </div>
                {isCloud() && (
                    <div className="w-60 border-t-2 border-border-gray">
                        <ul className="pt-8 mb-24 px-6 text-white space-y-4 text-sm">
                            <li>
                                <Link to="/account-settings" className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${props.selectedItem === LeftNavBarItems.AccountSettings ? 'bg-gray-800' : 'hover:bg-gray-700'}`}>
                                    <Briefcase className="h-5 mr-3" />
                                    Account Settings
                                </Link>
                            </li>
                            <li>
                                <Link to="/user-settings" className={`flex h-10 rounded-md ml-4 pl-2 pr-3 pt-2.5 text-sm text-white w-44 ${props.selectedItem === LeftNavBarItems.UserSettings ? 'bg-gray-800' : 'hover:bg-gray-700'}`}>
                                    <User className="h-5 mr-3" />
                                    User Settings
                                </Link>
                            </li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
