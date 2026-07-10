import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PrivacyProvider } from "@/contexts/PrivacyContext";
import { Loader2 } from "lucide-react";

// Route-based code splitting: heavy dependencies (recharts, xlsx, pdfjs,
// jszip) load with the page that needs them instead of on first paint.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Budget = lazy(() => import("./pages/Budget"));
const Estimates = lazy(() => import("./pages/Estimates").then((m) => ({ default: m.Estimates })));
const Comparison = lazy(() => import("./pages/Comparison"));
const Contractors = lazy(() => import("./pages/Contractors"));
const Documents = lazy(() => import("./pages/Documents"));
const Offers = lazy(() => import("./pages/Offers"));
const Export = lazy(() => import("./pages/Export"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));

// No automatic refetch on tab focus — combined with the AuthContext guard
// this stops pages from visibly "reloading" when switching back to the app.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Laden...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PrivacyProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/budget" element={<ProtectedRoute><Budget /></ProtectedRoute>} />
              <Route path="/estimates" element={<ProtectedRoute><Estimates /></ProtectedRoute>} />
              <Route path="/comparison" element={<ProtectedRoute><Comparison /></ProtectedRoute>} />
              <Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
              <Route path="/contractors" element={<ProtectedRoute><Contractors /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><Export /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
