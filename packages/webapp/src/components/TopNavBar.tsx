import { Book, Slack, Github } from '@geist-ui/icons';
import { isCloud, isEnterprise } from '../utils/utils';
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
                <div className="flex pr-6">
                    <a
                        href="https://docs.nango.dev/quickstart"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 text-white  mt-3"
                    >
                        <Book className="h-4 mr-1 mt-0.5"></Book>
                        <p>Documentation</p>
                    </a>
                    <a
                        href="https://nango.dev/slack"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 text-white mt-3"
                    >
                        <Slack className="h-4 mr-1 mt-0.5"></Slack>
                        <p>Community</p>
                    </a>
                    <a
                        href="https://github.com/NangoHQ/nango"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 rounded-md ml-4 pl-2 pr-3 pt-1.5 text-sm hover:bg-gray-700 text-white mt-3"
                    >
                        <Github className="h-4 mr-1 mt-0.5"></Github>
                        <p>Github</p>
                    </a>
                    {(isCloud() || isEnterprise()) && (
                        <button
                            onClick={logoutButtonClicked}
                            className="flex h-8 rounded-md ml-4 px-3 pt-1.5 text-sm hover:bg-gray-700 text-red-600 font-semibold mt-3"
                        >
                            <p>Log Out</p>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
