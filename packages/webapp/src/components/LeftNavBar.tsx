import { useState } from 'react';
import Cookies from 'js-cookie';
import { Link } from 'react-router-dom';
import Activity from '@geist-ui/icons/activity';

export enum LeftNavBarItems {
    Integrations = 0,
    Connections,
    ProjectSettings,
    Activity,
    Syncs
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}

export default function LeftNavBar(props: LeftNavBarProps) {
    const [env, setEnv] = useState(Cookies.get('env') || 'prod');

    const handleEnvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEnv = e.target.value;
        setEnv(newEnv);
        Cookies.set('env', newEnv);
    }

    return (
        <div>
            <div className="mt-14 border-r-2 border-t-2 border-border-gray flex flex-col h-full w-60 fixed bg-bg-black z-50">
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
        </div>
    );
}
