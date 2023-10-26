import { Book, Slack, Github } from '@geist-ui/icons';
import { isCloud } from '../utils/utils';
import { useSignout } from '../utils/user';

export default function NavBar() {
    const signout = useSignout();

    const logoutButtonClicked = async () => {
        signout();
    };

    return (
        <div className="w-full bg-bg-black h-16 border-b-2 border-border-gray flex justify-between items-center px-6">
            <div className="">
                <img className="h-8 w-8" src="/logo-circled.svg" alt="Nango" />
            </div>
            <div className="flex items-center">
                <a
                    href="https://docs.nango.dev/quickstart"
                    target="_blank"
                    rel="noreferrer"
                    className="flex rounded-md mx-2 py-2 px-3 pt-1.5 text-sm hover:bg-gray-700 text-white"
                >
                    <Book className="h-4 mr-1 mt-0.5"></Book>
                    <p>Documentation</p>
                </a>
                <a
                    href="https://nango.dev/slack"
                    target="_blank"
                    rel="noreferrer"
                    className="flex rounded-md mx-2 py-2 px-3 pt-1.5 text-sm hover:bg-gray-700 text-white"
                >
                    <Slack className="h-4 mr-1 mt-0.5"></Slack>
                    <p>Community</p>
                </a>
                <a
                    href="https://github.com/NangoHQ/nango"
                    target="_blank"
                    rel="noreferrer"
                    className="flex rounded-md mx-2 py-2 px-3  pt-1.5 text-sm hover:bg-gray-700 text-white"
                >
                    <Github className="h-4 mr-1 mt-0.5"></Github>
                    <p>Github</p>
                </a>
                {isCloud() && (
                    <button
                        onClick={logoutButtonClicked}
                        className="flex rounded-md mx-2 py-2 px-3 pt-1.5 text-sm hover:bg-gray-700 text-red-600 font-semibold"
                    >
                        <p>Log Out</p>
                    </button>
                )}
            </div>
        </div>
    );
}
