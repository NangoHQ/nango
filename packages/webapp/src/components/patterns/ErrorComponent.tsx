import * as Sentry from '@sentry/react';
import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';

import { Alert, AlertDescription } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import PageNotFound from '../../pages/PageNotFound';
import { APIError, apiErrorCode, isNoSessionApiError } from '../../utils/api';

import type { ApiError } from '@nangohq/types';

function getSupportId(error: Error): string | undefined {
    if (!(error instanceof APIError) || apiErrorCode(error) !== 'generic_error_support') {
        return undefined;
    }
    return String((error.json as ApiError<string>).error.payload);
}

function getSentryTags(title: string, error: Error) {
    const tags = {
        error_page: title,
        code: apiErrorCode(error),
        status: error instanceof APIError ? error.res.status : 'none'
    };
    const supportId = getSupportId(error);
    return supportId ? { ...tags, support_id: supportId } : tags;
}

function useReportErrorPage(title: string, error: Error) {
    // Every failed refetch hands this page a new error object. Report each kind of failure once.
    const reportedKey = useRef<string | null>(null);

    useEffect(() => {
        const tags = getSentryTags(title, error);
        const key = `${error.name}:${tags.code}:${tags.status}`;
        if (key === reportedKey.current || tags.code === 'not_found' || isNoSessionApiError(error)) {
            return;
        }

        reportedKey.current = key;
        Sentry.captureException(error, { tags });
    }, [title, error]);
}

export const ErrorPageComponent: React.FC<{ title: string; error: Error }> = ({ title, error }) => {
    useReportErrorPage(title, error);
    const supportId = getSupportId(error);

    if (apiErrorCode(error) === 'not_found') {
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
