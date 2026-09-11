import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

// Long enough that a fast connect session paints the dialog with no spinner in between.
const SPINNER_DELAY_MS = 250;

/** Stands in for the dialog while it is mounted but unpainted. */
export const ThemePendingSpinner: React.FC = () => {
    const [showSpinner, setShowSpinner] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
        return () => clearTimeout(timeout);
    }, []);

    if (!showSpinner) {
        return null;
    }

    return (
        // The dialog's own loading view announces the load; a status role here would announce it twice.
        <div aria-hidden="true" className="absolute h-screen w-screen flex items-center justify-center">
            <LoaderCircle className="size-8 animate-spin text-gray-500" />
        </div>
    );
};
