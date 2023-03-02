import { Outlet, Navigate } from 'react-router-dom';

const PrivateRoute = (props: any) => {
    const token = localStorage.getItem('auth');
    return <>{token ? <Outlet /> : <Navigate to="/signin" replace />}</>;
};

export default PrivateRoute;
