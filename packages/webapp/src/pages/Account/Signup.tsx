import { Helmet } from 'react-helmet';

import { SignupForm } from './components/SignupForm';
import DefaultLayout from '../../layout/DefaultLayout';
import { StyledLink } from '@/components/ui/StyledLink';

export const Signup: React.FC = () => {
    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Sign up - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-3 items-center">
                <h2 className="text-title-group text-text-strong">Sign up to Nango</h2>
                <span className="text-body-medium-regular text-text-muted">
                    Already have an account? <StyledLink to="/signin">Log in.</StyledLink>
                </span>
            </div>

            <SignupForm />
        </DefaultLayout>
    );
};
