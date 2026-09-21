import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';

// Lazy-loaded so the initial bundle is just the auth screens.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PactPage = lazy(() => import('./pages/PactPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AcceptFriendInvite = lazy(() => import('./pages/AcceptFriendInvite'));
const AcceptPactInvite = lazy(() => import('./pages/AcceptPactInvite'));

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
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
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
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
