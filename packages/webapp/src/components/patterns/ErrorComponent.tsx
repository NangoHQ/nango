import * as Sentry from '@sentry/react';
import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';

import { Alert, AlertDescription } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import PageNotFound from '../../pages/PageNotFound';
import { APIError, apiErrorCode, isNoSessionApiError } from '../../utils/api';

import type { ApiError } from '@nangohq/types';

export const ErrorPageComponent: React.FC<{ title: string; error: Error }> = ({ title, error }) => {
    const code = apiErrorCode(error);
    const status = error instanceof APIError ? error.res.status : 'none';
    const supportId = code === 'generic_error_support' && error instanceof APIError ? String((error.json as ApiError<string>).error.payload) : undefined;
    // Every failed refetch hands this page a new error object. Report each kind of failure once.
    const reportedKey = useRef<string | null>(null);
    const errorKey = `${error.name}:${code}:${status}`;

    useEffect(() => {
        if (reportedKey.current === errorKey || code === 'not_found' || isNoSessionApiError(error)) {
            return;
        }
        reportedKey.current = errorKey;
        Sentry.captureException(error, { tags: { error_page: title, code, status, ...(supportId ? { support_id: supportId } : {}) } });
    }, [error, errorKey, title, code, status, supportId]);

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
                    {supportId && (
                        <>
                            (id: <span className="select-all">{supportId}</span>)
                        </>
                    )}
                </AlertDescription>
            </Alert>
        </DashboardLayout>
    );
};
