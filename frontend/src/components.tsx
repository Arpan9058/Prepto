import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
export type IconName = 'arrow' | 'grid' | 'questions' | 'interview' | 'code' | 'resume' | 'trend' | 'match' | 'report' | 'menu' | 'close' | 'check';
const paths: Record<IconName, string> = {
  arrow: 'M5 12h14M13 6l6 6-6 6', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  questions: 'M4 4h16v12H8l-4 4zM9 8h6M9 12h4', interview: 'M8 4h8v10H8zM5 11v2a7 7 0 0014 0v-2M12 20v3',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18', resume: 'M5 2h10l4 4v16H5zM14 2v5h5M8 12h8M8 16h8',
  trend: 'M3 3v18h18M6 15l5-5 4 3 6-8', match: 'M9 4H3v16h6M15 4h6v16h-6M8 12h8M13 9l3 3-3 3',
  report: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h4', menu: 'M3 6h18M3 12h18M3 18h18', close: 'M5 5l14 14M19 5L5 19', check: 'M4 12l5 5L20 6'
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Brand({ inverse = false }: { inverse?: boolean }) { return <a className={`brand ${inverse ? 'brand-inverse' : ''}`} href="/" aria-label="Prepto home"><span className="brand-mark" aria-hidden="true">p<span /></span>Prepto<span className="brand-period">.</span></a>; }
export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) { return <a className={`button ${secondary ? 'button-secondary' : ''}`} href={href}>{children}<Icon name="arrow" /></a>; }
export function Notice({ children, error = false, busy = false, retry }: { children: ReactNode; error?: boolean; busy?: boolean; retry?: () => void }) { return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite" aria-busy={busy}>{children}{retry && <button className="text-button" onClick={retry}>Try again <Icon name="arrow" /></button>}</div>; }
export function DemoBanner() { return <aside className="demo-notice"><span className="status-dot" />OFFLINE DEMO <span> Synthetic data. Fixed simulated feedback. No Firebase or Gemini calls. Code execution disabled.</span><a href="/demo">Demo guide & exit</a></aside>; }
const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'Overview', icon: 'grid' }, { href: '/question-bank', label: 'Question bank', icon: 'questions' },
  { href: '/interviews', label: 'Interviews', icon: 'interview' }, { href: '/coding-practice', label: 'Coding practice', icon: 'code' },
  { href: '/resumes', label: 'Resume versions', icon: 'resume' }, { href: '/resume-matches', label: 'Job matches', icon: 'match' },
  { href: '/progress', label: 'Progress & goals', icon: 'trend' }, { href: '/reports', label: 'Saved reports', icon: 'report' }
];
export function Workspace({ children, demo }: { children: ReactNode; demo: boolean }) {
  const [open, setOpen] = useState(false), toggle = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => { const wide = matchMedia('(min-width: 801px)'); const close = () => { if (wide.matches) setOpen(false); }; wide.addEventListener('change', close); return () => wide.removeEventListener('change', close); }, []);
  useEffect(() => {
    if (!open) return;
    Array.from(panel.current?.querySelectorAll<HTMLElement>('a,button') || []).find(item => item.offsetParent !== null)?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
      if (event.key === 'Tab') {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('a,button') || []).filter(item => item.offsetParent !== null);
        if (document.activeElement === toggle.current) { event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0])?.focus(); }
        else if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); toggle.current?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); toggle.current?.focus(); }
      }
    }
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [open]);
  return <div className="workspace"><a className="skip-link" href="#main-content">Skip to main content</a><header className="mobile-header"><Brand /><button ref={toggle} className="icon-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="workspace-nav" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button></header>
    <aside ref={panel} className={`sidebar ${open ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand inverse /><span className="sidebar-caption">YOUR PREPARATION SPACE</span></div><nav id="workspace-nav" aria-label="Workspace navigation"><span className="nav-caption">WORKSPACE</span>{navigation.map(item => <a key={item.href} className="nav-item" href={item.href} aria-current={location.pathname === item.href || location.pathname.startsWith(item.href + '/') ? 'page' : undefined}><Icon name={item.icon} />{item.label}{location.pathname === item.href && <span className="nav-active-dot" />}</a>)}<div className="nav-divider" /><span className="nav-caption">YOUR WAY FORWARD</span><a className="nav-item" href={demo ? '/demo' : '/mock-interviews'}><Icon name="interview" />{demo ? 'Demo walkthrough' : 'Legacy guided rounds'}</a></nav><div className="sidebar-foot"><span className="sidebar-monogram" aria-hidden="true">P</span><div><strong>{demo ? 'Synthetic workspace' : 'Your workspace'}</strong><a href={demo ? '/demo' : '/logout'}>{demo ? 'Exit or reset demo' : 'Sign out'}</a></div></div></aside>
    {open && <button className="nav-overlay" tabIndex={-1} aria-label="Close navigation" onClick={() => { setOpen(false); toggle.current?.focus(); }} />}
    <div className="workspace-body" inert={open || undefined}>{demo && <DemoBanner />}<header className="workspace-bar"><span>Workspace <span aria-hidden="true">/</span> <strong>{navigation.find(item => location.pathname === item.href || location.pathname.startsWith(item.href + '/'))?.label || 'Your workspace'}</strong></span><a href="/interviews">Start a session <Icon name="arrow" /></a></header>{children}<footer className="workspace-footer"><span>Prepto · Preparation with intention.</span><span>AI feedback is guidance. Code execution is disabled.</span></footer></div></div>;
}
