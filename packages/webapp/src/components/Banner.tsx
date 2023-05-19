import { ArrowUpRight, X } from '@geist-ui/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isCloud } from '../utils/utils';

export default function Banner() {
    const [flashBanner, setFlashBanner] = useState(true);

    return (
        <>
            {flashBanner && isCloud() && (
                <div className="h-10 bg-white flex items-center justify-center text-sm gap-1 relative">
                    <span>Interested in the Nango Unified API? </span>
                    {/* TODO: add redirect uri */}
                    <Link to={'/'} className="cursor-pointer font-bold underline underline-offset-2 flex items-center">
                        Join the Beta <ArrowUpRight />
                    </Link>
                    <X onClick={() => setFlashBanner(false)} className="absolute right-3 cursor-pointer hover:bg-gray-200 rounded-md" />
                </div>
            )}
        </>
    );
}
