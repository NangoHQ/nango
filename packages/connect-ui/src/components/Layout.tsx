import { Outlet } from '@tanstack/react-router';
import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';
import { useGlobal } from '@/lib/store';

export const Layout: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    const { isEmbedded } = useGlobal();

    useClickAway(ref, () => {
        if (!isEmbedded) {
            triggerClose('click:outside');
        }
    });

    useKeyPressEvent('Escape', () => {
        if (!isEmbedded) {
            triggerClose('click:outside');
        }
    });

    if (isEmbedded) {
        // Embedded mode - no background overlay, just the content
        return (
            <div className="absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center">
                <div ref={ref} className="overflow-hidden flex flex-col bg-background rounded-xl w-[500px] h-full min-h-[600px] max-h-[900px]">
                    <Outlet />
                </div>
            </div>
        );
    }

    // Fullscreen mode - with background overlay
    return (
        <div className="absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div
                ref={ref}
                className="overflow-hidden flex flex-col bg-background rounded-xl w-[500px] h-full min-h-[600px] max-h-[900px] shadow-md shadow-dark-800"
            >
                <Outlet />
            </div>
        </div>
    );
};
