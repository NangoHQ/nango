export const Show: React.FC = () => {
    return (
        <div className="py-6 px-6 flex flex-col gap-12">
            <h3 className="text-xl font-semibold text-white flex gap-4 items-center">Operation Details</h3>
            <div className="flex gap-5 flex-wrap">
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Timestamp</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Integration</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Connection</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Duration</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Type</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Script</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <span className="font-semibold text-sm">Status</span>
                    <span className="text-gray-400 text-xs">Feb 20 21:15:42.52</span>
                </div>
            </div>
            <div>
                <h4 className="font-semibold text-sm">Payload</h4>
            </div>
            <div>
                <h4 className="font-semibold text-sm">Logs</h4>
            </div>
        </div>
    );
};
