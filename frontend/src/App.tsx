import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import Login from '@/pages/Login';
import VerifyCertificate from '@/pages/public/VerifyCertificate';
import ForcePasswordChange from '@/pages/onboarding/ForcePasswordChange';
import ForceMfaSetup from '@/pages/onboarding/ForceMfaSetup';
import Dashboard from '@/pages/Dashboard';
import FeedPage from '@/pages/feed/FeedPage';
import StudentsList from '@/pages/students/StudentsList';
import StudentDetail from '@/pages/students/StudentDetail';
import ParentsList from '@/pages/students/ParentsList';
import FacultyList from '@/pages/students/FacultyList';
import CoursesList from '@/pages/students/CoursesList';
import BatchesList from '@/pages/batches/BatchesList';
import BatchDetail from '@/pages/batches/BatchDetail';
import SessionsList from '@/pages/sessions/SessionsList';
import SessionDetail from '@/pages/sessions/SessionDetail';
import ExamsList from '@/pages/exams/ExamsList';
import ExamDetail from '@/pages/exams/ExamDetail';
import TakeExam from '@/pages/exams/TakeExam';
import QuestionBank from '@/pages/exams/QuestionBank';
import MarkSheet from '@/pages/exams/MarkSheet';
import TasksList from '@/pages/tasks/TasksList';
import TaskDetail from '@/pages/tasks/TaskDetail';
import PerformanceHub from '@/pages/performance/PerformanceHub';
import CertificatesList from '@/pages/certificates/CertificatesList';
import ReportsPage from '@/pages/reports/ReportsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsHub from '@/pages/settings/SettingsHub';
import FeesPage from '@/pages/fees/FeesPage';
import ProjectsList from '@/pages/projects/ProjectsList';
import ProjectDetail from '@/pages/projects/ProjectDetail';
import InternsList from '@/pages/interns/InternsList';
import InternDetail from '@/pages/interns/InternDetail';
import ActionCentrePage from '@/pages/actionCentre/ActionCentrePage';
import BackupPage from '@/pages/backup/BackupPage';
import CalendarPage from '@/pages/calendar/CalendarPage';
import UserSearchPage from '@/pages/search/UserSearchPage';
import NotFound from '@/pages/NotFound';
import {
  ADMIN_LIKE,
  FEE_ROLES,
  REPORTS_ROLES,
  CERTIFICATE_ROLES,
  NOT_PARENT,
  SESSION_ROLES,
  EXAM_ROLES,
  INTERN_ROLES,
  PEOPLE_ROUTES_ROLES,
  STAFF,
} from '@/lib/navRoles';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify/:certificateNumber" element={<VerifyCertificate />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding/password" element={<ForcePasswordChange />} />
        <Route path="/onboarding/mfa-setup" element={<ForceMfaSetup />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/feed" element={<FeedPage />} />

          <Route element={<ProtectedRoute roles={PEOPLE_ROUTES_ROLES} />}>
            <Route path="/people/students" element={<StudentsList />} />
            <Route path="/people/students/:id" element={<StudentDetail />} />
            <Route path="/people/parents" element={<ParentsList />} />
            <Route path="/people/faculty" element={<FacultyList />} />
            <Route path="/people/courses" element={<CoursesList />} />
            <Route path="/batches" element={<BatchesList />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={SESSION_ROLES} />}>
            <Route path="/sessions" element={<SessionsList />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={EXAM_ROLES} />}>
            <Route path="/exams" element={<ExamsList />} />
            <Route path="/exams/:id" element={<ExamDetail />} />
            <Route path="/exams/:id/take" element={<TakeExam />} />
          </Route>
          <Route element={<ProtectedRoute roles={STAFF} />}>
            <Route path="/exams/questions" element={<QuestionBank />} />
          </Route>
          <Route element={<ProtectedRoute roles={NOT_PARENT.filter((r) => r !== 'STUDENT')} />}>
            <Route path="/exams/:id/marksheet" element={<MarkSheet />} />
          </Route>

          <Route path="/tasks" element={<TasksList />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />

          <Route element={<ProtectedRoute roles={NOT_PARENT} />}>
            <Route path="/performance/*" element={<PerformanceHub />} />
            <Route path="/projects" element={<ProjectsList />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={INTERN_ROLES} />}>
            <Route path="/interns" element={<InternsList />} />
            <Route path="/interns/:id" element={<InternDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={FEE_ROLES} />}>
            <Route path="/fees" element={<FeesPage />} />
          </Route>
          <Route path="/action-centre" element={<ActionCentrePage />} />
          <Route element={<ProtectedRoute roles={ADMIN_LIKE} />}>
            <Route path="/backup" element={<BackupPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={CERTIFICATE_ROLES} />}>
            <Route path="/certificates" element={<CertificatesList />} />
          </Route>
          <Route element={<ProtectedRoute roles={REPORTS_ROLES} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route element={<ProtectedRoute roles={['FACULTY']} />}>
            <Route path="/calendar" element={<CalendarPage />} />
          </Route>
          <Route path="/settings/*" element={<SettingsHub />} />

          <Route element={<ProtectedRoute roles={['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY']} />}>
            <Route path="/search" element={<UserSearchPage />} />
            <Route path="/search/:kind/:id" element={<UserSearchPage />} />
          </Route>

          <Route path="/my/:studentId" element={<StudentDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
