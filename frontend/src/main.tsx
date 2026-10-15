import { Component, StrictMode, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth, Onboarding } from './Auth';
import { Questions } from './Questions';
import { Interviews, InterviewSession } from './Interviews';
import { Resumes, ResumeVersions, Matching } from './Resumes';
import { Coding } from './Coding';
import { ProgressScreen, Reports, ReportView } from './Progress';
import { Demo } from './Demo';
import { Workspace } from './components';
import { useResource, LoadState } from './ui';
import { api } from './api';
import type { Runtime } from './api';
import { Landing } from './Landing';
import { Dashboard } from './Dashboard';
import { Brand, Notice } from './components';
import './tokens.css';
import './styles.css';
class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="boot-state"><Brand /><Notice error>Something interrupted this screen. <a href={location.pathname}>Reload this page</a></Notice></main> : this.props.children; }
}
function App() {
  const [runtime, setRuntime] = useState<Runtime | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); setError(false); api<Runtime>('/api/runtime', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setRuntime(value); }).catch(() => { if (!controller.signal.aborted) setError(true); }); return () => controller.abort(); }, [retry]);
  if (!runtime) return <main className="boot-state"><Brand /><Notice busy={!error} error={error} retry={error ? () => setRetry(n => n + 1) : undefined}>{error ? 'We could not open Prepto. Please try again.' : 'Opening your preparation space…'}</Notice></main>;
  const path = location.pathname;
  if (path === '/') return <Landing demo={runtime.demo} />;
  if (path === '/demo' && runtime.demo) return <Demo />;
  if (['/login', '/register', '/forgot-password'].includes(path)) return <Auth mode={path === '/login' ? 'login' : path === '/register' ? 'register' : 'reset'} />;
  if (path === '/dashboard') return <Dashboard demo={runtime.demo} />;
  return <ProtectedScreens demo={runtime.demo} />;
}
function ProtectedScreens({ demo }: { demo: boolean }) {
  const identity = useResource<{ admin: boolean }>('/api/session');
  if (!identity.data) return <Workspace demo={demo}><main id="main-content" className="product-main" tabIndex={-1}><LoadState resource={identity} /></main></Workspace>;
  const path = location.pathname, id = decodeURIComponent(path.split('/').at(-1)!);
  let screen;
  if (path === '/onboarding') screen = <Onboarding />;
  else if (path === '/question-bank') screen = <Questions admin={identity.data.admin} />;
  else if (path === '/interviews') screen = <Interviews />;
  else if (path.startsWith('/interviews/')) screen = <InterviewSession id={id} />;
  else if (path === '/resumes') screen = <Resumes />;
  else if (path.startsWith('/resumes/')) screen = <ResumeVersions id={id} />;
  else if (path === '/resume-matches') screen = <Matching />;
  else if (path === '/coding-practice') screen = <Coding />;
  else if (path === '/progress') screen = <ProgressScreen />;
  else if (path === '/reports') screen = <Reports />;
  else if (path.startsWith('/reports/view/')) screen = <ReportView id={id} />;
  else screen = <p>Screen not found. <a href="/dashboard">Open your workspace</a>.</p>;
  return <Workspace demo={demo}>{screen}</Workspace>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><AppBoundary><App /></AppBoundary></StrictMode>);
