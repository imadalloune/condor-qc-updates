import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Index from "./pages/Index";
import History from "./pages/History";
import AdminDashboard from "./pages/AdminDashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';
import BroadcastNotification from '@/components/BroadcastNotification';
import { UpdateModal } from '@/components/UpdateModal';
import { SystemUpdateManager } from '@/components/SystemUpdateManager';

import AnomalyReportCreator from './pages/AnomalyReportCreator';
import LicenseManagement from './pages/LicenseManagement';
import QuickLicenseTest from './pages/QuickLicenseTest';

import { CURRENT_APP_VERSION_CODE } from '@/utils/version';
// Current version of our app (Increment this when you build a NEW APK)
export const CURRENT_APP_VERSION = CURRENT_APP_VERSION_CODE; // To match Android versionCode 10 (v1.1.0)

import { LicenseGuard } from '@/components/LicenseGuard';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Listen for system messages ONLY (Updates are now handled by UpdateModal)
  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated) return;

    // Listen for "Live" messages sent while app is open
    const channel = supabase!
      .channel('app-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_updates' },
        (payload) => {
          const newUpdate = payload.new;
          // Only show non-update messages (broadcasts)
          if (newUpdate.version_code <= CURRENT_APP_VERSION) {
            toast.custom((t) => (
              <BroadcastNotification
                type="message"
                message={newUpdate.message}
                onClose={() => toast.dismiss(t)}
              />
            ), {
              duration: 15000,
              position: 'top-center'
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <LicenseGuard>{children}</LicenseGuard>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <Sonner />
          <UpdateModal />
          <SystemUpdateManager />
          <HashRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <History />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/anomaly-report"
                element={
                  <ProtectedRoute>
                    <AnomalyReportCreator />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/licenses"
                element={
                  <ProtectedRoute>
                    <LicenseManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/license-test"
                element={
                  <ProtectedRoute>
                    <QuickLicenseTest />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
