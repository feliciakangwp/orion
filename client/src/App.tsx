import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { usePersona } from './PersonaContext';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectProfileList } from './pages/ProjectProfileList';

export default function App() {
  const { loading } = usePersona();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading ORION&hellip;</div>;
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectProfileList />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Layout>
  );
}
