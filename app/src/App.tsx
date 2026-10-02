import { Component, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/context/useAuth";
import { Layout } from "@/components/Layout";
import Landing from "@/pages/Landing";
import Operations from "@/pages/Operations";
import Legal from "@/pages/Legal";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import ReviewQueue from "@/pages/ReviewQueue";
import AuditPage from "@/pages/AuditPage";
import Explore from "@/pages/Explore";
import ExploreDomain from "@/pages/ExploreDomain";
import Services from "@/pages/Services";
import Metrology from "@/pages/Metrology";
import Water from "@/pages/Water";
import Decisions from "@/pages/Decisions";
import Telemetry from "@/pages/Telemetry";
import Simulator from "@/pages/Simulator";
import Analytics from "@/pages/Analytics";
import Gis from "@/pages/Gis";
import Iot from "@/pages/Iot";
import Vde from "@/pages/Vde";
import OrganizationPage from "@/pages/Organization";
import "@/lib/i18n";

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
        <div role="alert" dir="ltr"
             className="m-8 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-muted-foreground">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            {["about", "privacy", "terms", "rights", "contact"].map(path => <Route key={path} path={"/" + path} element={<Legal />} />)}
            <Route path="/app/operations" element={<Protected><Operations /></Protected>} />
            <Route path="/app" element={<Protected><Home /></Protected>} />
            <Route path="/app/explore" element={<Protected><Explore /></Protected>} />
            <Route path="/app/explore/:domain" element={<Protected><ExploreDomain /></Protected>} />
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
            <Route path="/app/org" element={<Protected><OrganizationPage /></Protected>} />
            <Route path="/app/review" element={<Protected><ReviewQueue /></Protected>} />
            <Route path="/app/audit" element={<Protected><AuditPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </AuthProvider>
  );
}
