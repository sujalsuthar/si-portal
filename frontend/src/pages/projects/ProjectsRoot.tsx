import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import ProjectsList from '@/pages/projects/ProjectsList';

/** Students use /projects; staff are redirected to the student-projects hub. */
export default function ProjectsRoot() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <ProjectsList />;
  return <Navigate to="/projects/students" replace />;
}
