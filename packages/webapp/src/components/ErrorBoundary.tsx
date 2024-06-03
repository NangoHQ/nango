import type React from 'react';

export const ErrorBoundary: React.FC = () => {
    return (
        <div className="flex h-screen text-white justify-center items-center">
            <div className="mx-auto">
                <img className="h-8" src="./logo-circled.svg" alt="Nango" />
                <h2 className="text-emphasis mt-6 text-2xl font-medium">It&apos;s not you, it&apos;s us.</h2>
                <p className="text-default mt-4 mb-6 max-w-2xl text-sm">
                    Something went wrong on our end. Get in touch with our support team, and we’ll get it fixed right away for you.
                </p>

                <button onClick={() => window.location.reload()} className="mt-auto mb-4 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                    Try again?
                </button>
            </div>
        </div>
    );
};
