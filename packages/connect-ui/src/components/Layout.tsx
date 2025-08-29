import { Outlet } from '@tanstack/react-router';
import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';
import { useGlobal } from '@/lib/store';

export const Layout: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    const { isEmbedded } = useGlobal();

    useClickAway(ref, () => {
        triggerClose('click:outside');
    });

    useKeyPressEvent('Escape', () => {
        triggerClose('click:outside');
    });

    if (isEmbedded) {
        return (
            <div className="overflow-hidden bg-background w-screen h-screen min-w-[500px] min-h-[600px] flex flex-col rounded-xl text-text-primary">
                <Outlet />
            </div>
        );
    }

    return (
        <div className="absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div
                ref={ref}
                className="overflow-hidden flex flex-col bg-background text-text-primary rounded-xl w-[500px] h-full min-h-[600px] max-h-[900px] shadow-md shadow-dark-800"
            >
                <Outlet />
            </div>
        </div>
    );
};
