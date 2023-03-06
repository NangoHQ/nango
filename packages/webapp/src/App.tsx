import { Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import Signin from './pages/Signin';
import IntegrationList from './pages/IntegrationList';
import ConnectionList from './pages/ConnectionList';
import ProjectSettings from './pages/ProjectSettings';
import PrivateRoute from './components/PrivateRoute';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const App = () => {
    return (
        <>
            <Routes>
                <Route path="/" element={<Navigate to="/integrations" replace />} />
                <Route path="/integrations" element={<PrivateRoute />}>
                    <Route path="/integrations" element={<IntegrationList />} />
                </Route>
                <Route path="/connections" element={<PrivateRoute />}>
                    <Route path="/connections" element={<ConnectionList />} />
                </Route>
                <Route path="/project-settings" element={<PrivateRoute />}>
                    <Route path="/project-settings" element={<ProjectSettings />} />
                </Route>
                <Route path="/signin" element={<Signin />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastContainer />
        </>
    );
};

export default App;
