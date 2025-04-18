import type { ApiError } from '@nangohq/types';
import PageNotFound from '../pages/PageNotFound';
import DashboardLayout from '../layout/DashboardLayout';
import { Info } from './Info';
import type { LeftNavBarItems } from './LeftNavBar';
import { Helmet } from 'react-helmet';

export const ErrorPageComponent: React.FC<{ title: string; error: ApiError<string>; page: LeftNavBarItems }> = ({ title, error, page }) => {
    if (error.error.code === 'not_found') {
        return <PageNotFound />;
    }

    return (
        <DashboardLayout selectedItem={page}>
            <Helmet>
                <title>Error - Nango</title>
            </Helmet>
            <h2 className="text-3xl font-semibold text-white mb-16">{title}</h2>
            <Info variant={'destructive'}>
                An error occurred, refresh your page or reach out to the support.{' '}
                {error.error.code === 'generic_error_support' && (
                    <>
                        (id: <span className="select-all">{error.error.payload as string}</span>)
                    </>
                )}
            </Info>
        </DashboardLayout>
    );
};
