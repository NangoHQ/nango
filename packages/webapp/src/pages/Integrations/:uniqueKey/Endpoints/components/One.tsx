import { HttpLabel } from '../../../../../components/HttpLabel';
import type { NangoSyncConfigWithEndpoint } from './List';

export const EndpointOne: React.FC<{ flow: NangoSyncConfigWithEndpoint }> = ({ flow }) => {
    return (
        <div className="flex flex-col gap-10 text-white text-sm">
            <header className="bg-active-gray flex gap-2 justify-between p-5">
                <div className="flex flex-col gap-3">
                    <h2>
                        <HttpLabel {...flow.endpoint} size="xl" />{' '}
                    </h2>
                    <div>{flow.description}</div>
                </div>
            </header>

            <main className="flex gap-10">
                <div className="bg-active-gray p-5 w-1/2">
                    <h3 className="text-xl font-semibold">Query & Path Parameters</h3>
                </div>
                <div className="flex flex-col grow gap-10 w-1/2">
                    <div></div>
                    <div></div>
                </div>
            </main>
        </div>
    );
};
