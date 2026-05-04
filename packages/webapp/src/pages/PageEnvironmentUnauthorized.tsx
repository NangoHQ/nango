import { Link } from 'react-router-dom';

import DefaultLayout from '../layout/DefaultLayout';
import { useStore } from '../store';

export default function PageEnvironmentUnauthorized() {
    const env = useStore((state) => state.env);

    return (
        <DefaultLayout>
            <div className="mx-auto max-w-7xl px-6 py-32 text-center sm:py-40 lg:px-8">
                <p className="text-base font-semibold leading-8 text-white">403</p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">Access denied</h1>
                <p className="mt-4 text-base text-white/70 sm:mt-6">Your role does not have access to this environment.</p>
                <div className="mt-10 flex justify-center">
                    <Link to={`/${env}`} className="text-sm font-semibold leading-7 text-white">
                        <span aria-hidden="true">&larr;</span> Back to home
                    </Link>
                </div>
            </div>
        </DefaultLayout>
    );
}
