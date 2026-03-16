import { Helmet } from 'react-helmet';

import { Info } from './Info';
import DashboardLayout from '../layout/DashboardLayout';
import PageNotFound from '../pages/PageNotFound';

import type { ApiError } from '@nangohq/types';

export const ErrorPageComponent: React.FC<{ title: string; error?: ApiError<string> }> = ({ title, error }) => {
    if (error?.error.code === 'not_found') {
        return <PageNotFound />;
    }

    if (error?.error.code === 'forbidden') {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Access Denied - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-16">{title}</h2>
                <Info variant={'destructive'}>You do not have permission to access this environment. Please contact your administrator.</Info>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <Helmet>
                <title>Error - Nango</title>
            </Helmet>
            <h2 className="text-3xl font-semibold text-white mb-16">{title}</h2>
            <Info variant={'destructive'}>
                An error occurred, refresh your page or reach out to the support.{' '}
                {error?.error.code === 'generic_error_support' && (
                    <>
                        (id: <span className="select-all">{error.error.payload as string}</span>)
                    </>
                )}
            </Info>
        </DashboardLayout>
    );
};
