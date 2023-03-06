import { Link } from 'react-router-dom';

export enum LeftNavBarItems {
    Integrations = 0,
    Connections,
    ProjectSettings
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}

export default function LeftNavBar(props: LeftNavBarProps) {
    return (
        <div>
            <div className="border-r-2 border-border-gray flex justify-between h-full w-60">
                <div className="ml-4 mt-12">
                    <Link
                        to="/integrations"
                        className={`flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm text-white mt-3 ${
                            props.selectedItem === LeftNavBarItems.Integrations ? 'bg-gray-800' : 'hover:bg-gray-700'
                        }`}
                    >
                        <img className="h-5 mr-3" src="/images/integrations-icon.svg" alt="" />
                        <p>Integrations</p>
                    </Link>
                    <Link
                        to="/connections"
                        className={`flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm text-white mt-3 ${
                            props.selectedItem === LeftNavBarItems.Connections ? 'bg-gray-800' : 'hover:bg-gray-700'
                        }`}
                    >
                        <img className="h-5 mr-3" src="/images/connections-icon.svg" alt="" />
                        <p>Connections</p>
                    </Link>
                    <Link
                        to="/project-settings"
                        className={`flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm text-white mt-3 ${
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
