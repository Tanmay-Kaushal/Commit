import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';

// Lazy-loaded so the initial bundle is just the login screen.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PactPage = lazy(() => import('./pages/PactPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AcceptFriendInvite = lazy(() => import('./pages/AcceptFriendInvite'));
const AcceptPactInvite = lazy(() => import('./pages/AcceptPactInvite'));

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

function PageFallback() {
  return <div className="min-h-screen bg-stone-50 dark:bg-stone-950" />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/i/:code"
        element={
          <Suspense fallback={<PageFallback />}>
            <AcceptFriendInvite />
          </Suspense>
        }
      />
      <Route
        path="/p/:code"
        element={
          <Suspense fallback={<PageFallback />}>
            <AcceptPactInvite />
          </Suspense>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pacts/:id"
        element={
          <ProtectedRoute>
            <PactPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pacts/:id/timeline"
        element={
          <ProtectedRoute>
            <TimelinePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
