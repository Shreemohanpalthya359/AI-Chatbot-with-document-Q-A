import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ChatWorkspace from './pages/ChatWorkspace';
import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import UserProfile from './pages/UserProfile';

const ProtectedRoute = ({ children, token }) => {
  if (!token) {
    return <Navigate to="/auth" replace />;
  }
  return children;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const navigate = useNavigate();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) setToken(storedToken);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    navigate('/auth');
  };

  return (
    <Routes>
      <Route path="/auth" element={<Auth setToken={setToken} />} />
      <Route path="/" element={<LandingPage />} />
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute token={token}>
            <ChatWorkspace onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute token={token}>
            <Dashboard onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute token={token}>
            <UserProfile onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default App;
