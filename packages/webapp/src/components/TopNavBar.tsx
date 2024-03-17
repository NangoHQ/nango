import { ChatBubbleBottomCenterIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

export default function NavBar() {
    return (
        <div className="w-full fixed bg-pure-black z-50 left-[15.8rem]">
            <div className="flex justify-end border-b border-border-gray py-3 mr-[15.8rem]">
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
