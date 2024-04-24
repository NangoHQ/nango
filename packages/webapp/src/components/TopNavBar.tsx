import { ChatBubbleBottomCenterIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useStore } from '../store';
import { useMemo } from 'react';
import { useSignout } from '../utils/user';
import Info from './ui/Info';

export default function NavBar() {
    const signout = useSignout();
    const email = useStore((state) => state.email);
    const isHNDemo = useMemo(() => {
        return Boolean(email.match(/demo-[a-z0-9]+@example.com/));
    }, [email]);

    const onCreateAccount = () => {
        signout();
    };

    return (
        <div className="w-full fixed bg-pure-black z-50 left-[15.8rem]">
            <div className="flex justify-between border-b border-border-gray py-3 mr-[15.8rem]">
                <div className="text-white px-6 text-sm">
                    {isHNDemo && (
                        <Info padding={'px-3 py-1.5'} size={15}>
                            This is a test account. Click{' '}
                            <button className="font-bold" onClick={onCreateAccount}>
                                here
                            </button>{' '}
                            to create a real account.
                        </Info>
                    )}
                </div>
                <div className="flex items-center pr-6">
                    <a
                        href="https://nango.dev/slack"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center h-8 rounded-md ml-4 pl-2 bg-active-gray pr-3 text-sm border border-neutral-700 hover:border-white hover:bg-hover-gray hover:text-white text-gray-400"
                    >
                        <ChatBubbleBottomCenterIcon className="h-5 mr-2" />
                        <p>Help</p>
                    </a>
                    <a
                        href="https://docs.nango.dev"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center h-8 rounded-md ml-4 pl-2 pr-3 text-sm hover:text-white text-gray-400"
                    >
                        <p>Docs</p>
                        <ArrowTopRightOnSquareIcon className="h-5 ml-2" />
                    </a>
                </div>
            </div>
        </div>
    );
}
