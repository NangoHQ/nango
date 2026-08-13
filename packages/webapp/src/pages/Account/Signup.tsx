import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import DefaultLayout from '../../layout/DefaultLayout';
import { SignupForm } from './components/SignupForm';

export const Signup: React.FC = () => {
    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Sign up - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-3 items-center">
                <h2 className="text-title-group text-text-strong">Sign up to Nango</h2>
                <span className="text-body-medium-regular text-text-muted">
                    Already have an account?{' '}
                    <Button asChild variant="link">
                        <Link to="/signin">Log in.</Link>
                    </Button>
                </span>
            </div>

            <SignupForm />
        </DefaultLayout>
    );
};
