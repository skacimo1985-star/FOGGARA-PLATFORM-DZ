import { Component, Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
const Presentation = lazy(() => import("@/pages/Presentation"));
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const DataRoom = lazy(() => import("@/pages/DataRoom"));
const NexusResources = lazy(() => import("@/pages/NexusResources"));
const Opportunities = lazy(() => import("@/pages/Opportunities"));
const DecisionStudio = lazy(() => import("@/pages/DecisionStudio"));
const Home = lazy(() => import("@/pages/Home"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const ReviewQueue = lazy(() => import("@/pages/ReviewQueue"));
const AuditPage = lazy(() => import("@/pages/AuditPage"));
const Explore = lazy(() => import("@/pages/Explore"));
const ExploreDomain = lazy(() => import("@/pages/ExploreDomain"));
const Services = lazy(() => import("@/pages/Services"));
const Metrology = lazy(() => import("@/pages/Metrology"));
const Water = lazy(() => import("@/pages/Water"));
const Decisions = lazy(() => import("@/pages/Decisions"));
const Telemetry = lazy(() => import("@/pages/Telemetry"));
const Simulator = lazy(() => import("@/pages/Simulator"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Gis = lazy(() => import("@/pages/Gis"));
const Iot = lazy(() => import("@/pages/Iot"));
const Vde = lazy(() => import("@/pages/Vde"));
const OrganizationPage = lazy(() => import("@/pages/Organization"));
import "@/lib/i18n";
import { useTranslation } from "react-i18next";

class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { message: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    console.error(err);
  }
  render() {
    if (this.state.message) {
      return (
        <RouteFailure />
      );
    }
    return this.props.children;
  }
}

function RouteFailure() {
  const { t } = useTranslation();
  return <div role="alert" className="m-8 space-y-4 rounded-xl border border-destructive/40 p-6"><p>{t('navigation.failure')}</p><button type="button" className="os-primary" onClick={()=>window.location.reload()}>{t('navigation.retry')}</button><p className="text-xs text-muted-foreground">{t('membership.sessionNotice')}</p></div>;
}
function RouteBoundary({children}:{children:ReactNode}) {
  const location=useLocation();const {t}=useTranslation();
  return <ErrorBoundary key={location.pathname}><div className="os-route-view"><Suspense fallback={<div role="status" className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>}>{children}</Suspense></div></ErrorBoundary>;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-8 text-center text-muted-foreground">…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <RouteBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/presentation" element={<Presentation />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Onboarding />} />
            <Route path="/join" element={<Onboarding />} />
            <Route path="/app" element={<Protected><Home /></Protected>} />
            <Route path="/app/explore" element={<Protected><Explore /></Protected>} />
            <Route path="/app/explore/:domain" element={<Protected><ExploreDomain /></Protected>} />
            <Route path="/app/studio" element={<Protected><DecisionStudio /></Protected>} />
            <Route path="/app/projects" element={<Protected><Projects /></Protected>} />
            <Route path="/app/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
            <Route path="/app/services" element={<Protected><Services /></Protected>} />
            <Route path="/app/metrology" element={<Protected><Metrology /></Protected>} />
            <Route path="/app/water" element={<Protected><Water /></Protected>} />
            <Route path="/app/decisions" element={<Protected><Decisions /></Protected>} />
            <Route path="/app/telemetry" element={<Protected><Telemetry /></Protected>} />
            <Route path="/app/simulator" element={<Protected><Simulator /></Protected>} />
            <Route path="/app/analytics" element={<Protected><Analytics /></Protected>} />
            <Route path="/app/gis" element={<Protected><Gis /></Protected>} />
            <Route path="/app/iot" element={<Protected><Iot /></Protected>} />
            <Route path="/app/vde" element={<Protected><Vde /></Protected>} />
            <Route path="/app/vde/:id" element={<Protected><DataRoom /></Protected>} />
            <Route path="/app/resources" element={<Protected><NexusResources /></Protected>} />
            <Route path="/app/opportunities" element={<Protected><Opportunities /></Protected>} />
            <Route path="/app/org" element={<Protected><OrganizationPage /></Protected>} />
            <Route path="/app/review" element={<Protected><ReviewQueue /></Protected>} />
            <Route path="/app/audit" element={<Protected><AuditPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteBoundary>
      </Layout>
    </AuthProvider>
  );
}
