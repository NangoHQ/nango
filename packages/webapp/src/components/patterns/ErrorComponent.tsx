import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';

import { Alert, AlertDescription } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import PageNotFound from '../../pages/PageNotFound';

import type { ApiError } from '@nangohq/types';

export const ErrorPageComponent: React.FC<{ title: string; error?: ApiError<string> }> = ({ title, error }) => {
    const code = error?.error.code;

    useEffect(() => {
        if (code === 'not_found') {
            return;
        }
        Sentry.captureMessage('Error page shown', { tags: { error_page: title, code: code ?? 'unknown' } });
    }, [title, code]);

    if (code === 'not_found') {
        return <PageNotFound />;
    }

    return (
        <DashboardLayout fullWidth title={title}>
            <Helmet>
                <title>Error - Nango</title>
            </Helmet>
            <Alert variant="danger">
                <AlertDescription>
                    An error occurred, refresh your page or reach out to the support.{' '}
                    {error?.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{error.error.payload as string}</span>)
                        </>
                    )}
                </AlertDescription>
            </Alert>
        </DashboardLayout>
    );
};
