import { useMount } from 'react-use';

import { HeaderButtons } from './HeaderButtons';
import { APIError } from '@/lib/api';
import { telemetry } from '@/lib/telemetry';

const ErrorMsg: React.FC<{ error?: unknown }> = ({ error }) => {
    if (error instanceof APIError) {
        if (error.details.res.status === 401) {
            return <div className="p-4 text-error text-center">Your session has expired, please refresh the modal</div>;
        }
    }
    return <div className="p-4 text-error text-center">An error occurred. Please refresh your page or contact our support.</div>;
};

export const ErrorFallback: React.FC<{ error?: unknown }> = ({ error }) => {
    useMount(() => {
        telemetry('view:unknown_error');
    });
    return (
        <div className="h-full w-full">
            <HeaderButtons />
            <div className="relative h-full flex flex-col justify-center">
                <ErrorMsg error={error} />
            </div>
        </div>
    );
};

export const ErrorFallbackGlobal: React.FC = () => {
    return (
        <div className="absolute h-screen w-screen overflow-hidden flex flex-col items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div className="relative overflow-hidden bg-background text-text-primary rounded-xl w-[500px] h-full min-h-[500px]">
                <ErrorFallback />
            </div>
        </div>
    );
};
