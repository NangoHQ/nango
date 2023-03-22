import { Outlet, Navigate } from 'react-router-dom';
import { isCloud } from '../utils/utils';
import { isSignedIn } from '../utils/user';

const PrivateRoute = (_: any) => {
    return <>{!isCloud() || isSignedIn() ? <Outlet /> : <Navigate to="/signin" replace />}</>;
};

export default PrivateRoute;
