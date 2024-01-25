import { isCloud, isEnterprise } from '../utils/utils';
import { ChatBubbleBottomCenterIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useSignout } from '../utils/user';

export default function NavBar() {
    const signout = useSignout();

    const logoutButtonClicked = async () => {
        signout();
    };

    return (
        <div className="w-full fixed bg-bg-black z-50">
            <div className="w-full border-b-2 border-border-gray flex justify-between">
                <div className="">
                    <img className="h-8 my-3 ml-8" src="/logo-circled.svg" alt="Nango" />
                </div>
                <div className="flex items-center pr-6">
                    <a
                        href="https://nango.dev/slack"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center h-8 rounded-md ml-4 pl-2 pr-3 text-sm border border-transparent hover:border-white hover:bg-gray-700 text-white"
                    >
                        <ChatBubbleBottomCenterIcon className="h-5 mr-2" />
                        <p>Help</p>
                    </a>
                    <a
                        href="https://docs.nango.dev/quickstart"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center h-8 rounded-md ml-4 pl-2 pr-3 text-sm hover:border border border-transparent hover:border-white hover:bg-gray-700 text-white"
                    >
                        <p>Docs</p>
                        <ArrowTopRightOnSquareIcon className="h-5 ml-2" />
                    </a>
                    {(isCloud() || isEnterprise()) && (
                        <button
                            onClick={logoutButtonClicked}
                            className="flex h-8 rounded-md ml-4 px-3 text-sm hover:bg-gray-700 text-red-600 font-semibold"
                        >
                            <p>Log Out</p>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
