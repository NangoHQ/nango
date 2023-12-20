import { Outlet, Navigate } from 'react-router-dom';
import { isCloud, isEnterprise } from '../utils/utils';
import { isSignedIn } from '../utils/user';

const PrivateRoute = (_: any) => {
    return <>{(!isCloud() && !isEnterprise() )|| isSignedIn() ? <Outlet /> : <Navigate to="/signin" replace />}</>;
};

export default PrivateRoute;
