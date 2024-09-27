import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ref = useRef<HTMLDivElement>(null);

    useClickAway(ref, () => {
        triggerClose();
    });

    useKeyPressEvent('Escape', () => {
        triggerClose();
    });

    return (
        <div className="absolute h-screen  w-screen overflow-hidden flex flex-col items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div ref={ref} className="overflow-hidden flex flex-col bg-white rounded-xl w-[500px] h-full min-h-[500px]">
                {children}
            </div>
        </div>
    );
};
