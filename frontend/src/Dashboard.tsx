import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Identity, Interview, Overview, Resume } from './api';
import { ButtonLink, Icon, Notice, Workspace } from './components';
import type { IconName } from './components';
interface Data {
  identity: Identity;
  overview: Overview;
  interviews: Interview[];
  resumes: Resume[];
}
export function Dashboard({ demo }: { demo: boolean }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<ApiError | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setData(null);
    Promise.all([
      api<Identity>('/api/session', { signal: controller.signal }),
      api<Overview>('/api/progress/overview', { signal: controller.signal }),
      api<{ items: Interview[] }>('/api/interviews?pageSize=3', { signal: controller.signal }),
      api<{ items: Resume[] }>('/api/resumes?pageSize=1', { signal: controller.signal }),
    ])
      .then(([identity, overview, sessions, resumes]) => {
        if (!controller.signal.aborted)
          setData({ identity, overview, interviews: sessions.items, resumes: resumes.items });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof ApiError
              ? e
              : new ApiError('We could not load your workspace. Please try again.', 0),
          );
      });
    return () => controller.abort();
  }, [retry]);
  const activities: { href: string; icon: IconName; title: string; copy: string; meta: string }[] =
    [
      {
        href: '/question-bank',
        icon: 'questions',
        title: 'A question to think through',
        copy: 'Find a useful challenge. Bookmark it or take it into an interview.',
        meta: 'QUESTION BANK',
      },
      {
        href: '/coding-practice',
        icon: 'code',
        title: 'Room to work it out',
        copy: 'Save a draft. Explore an approach. Review AI guidance at your own pace.',
        meta: '18 CODING PROBLEMS · NO EXECUTION',
      },
      {
        href: data?.resumes[0] ? `/resumes/${data.resumes[0].id}` : '/resumes',
        icon: 'resume',
        title: 'Your experience, considered',
        copy: data?.resumes[0]
          ? `${data.resumes[0].title} · ${data.resumes[0].versionCount} saved versions`
          : 'Start with your resume. Keep the original while you improve the next version.',
        meta: 'RESUME WORKSPACE',
      },
    ];
  return (
    <Workspace demo={demo}>
      <main className="dashboard-main" id="main-content" tabIndex={-1} aria-busy={!data && !error}>
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">YOUR PREPARATION, IN FOCUS</p>
            <h1>
              Make your next
              <br />
              <em>session count.</em>
            </h1>
          </div>
          <p>
            You don’t need to do everything today.
            <br />
            Just choose a useful place to begin.
          </p>
        </div>
        {error ? (
          <Notice error retry={error.status === 401 ? undefined : () => setRetry((n) => n + 1)}>
            {error.message}
            {error.status === 401 && (
              <a href={demo ? '/demo' : '/login'}>{demo ? 'Start a new demo' : 'Sign in'}</a>
            )}
          </Notice>
        ) : !data ? (
          <Notice busy>Loading your saved work…</Notice>
        ) : (
          <>
            <section className="session-feature" aria-labelledby="session-title">
              <div>
                <p className="eyebrow">ONE FOCUSED CONVERSATION</p>
                <h2 id="session-title">
                  Good answers start
                  <br />
                  with <em>clear thinking.</em>
                </h2>
                <p>
                  Choose a question. Explain your approach.
                  <br />
                  Come back to feedback you can work with.
                </p>
                <ButtonLink href="/interviews">Start an interview</ButtonLink>
              </div>
              <div className="session-feature-note">
                <Icon name="interview" />
                <span className="small-label">MAKE IT YOUR SESSION</span>
                <ul>
                  <li>
                    <Icon name="check" />
                    Choose your questions
                  </li>
                  <li>
                    <Icon name="check" />
                    Pause and pick it up later
                  </li>
                  <li>
                    <Icon name="check" />
                    Keep your answer review
                  </li>
                </ul>
              </div>
            </section>
            <section aria-labelledby="work-heading">
              <div className="row-heading">
                <h2 id="work-heading">Choose your next step</h2>
                <span className="small-label">PRACTICE WITH PURPOSE</span>
              </div>
              <div className="activity-grid">
                {activities.map((a) => (
                  <a className="activity" key={a.href} href={a.href}>
                    <div className="activity-icon">
                      <Icon name={a.icon} />
                      <Icon name="arrow" />
                    </div>
                    <span className="small-label">{a.meta}</span>
                    <h3>{a.title}</h3>
                    <p>{a.copy}</p>
                  </a>
                ))}
              </div>
            </section>
            <div className="dashboard-bottom">
              <section aria-labelledby="recent-heading">
                <div className="row-heading">
                  <h2 id="recent-heading">Pick up the thread</h2>
                  <a className="quiet-link" href="/interviews">
                    All interviews <Icon name="arrow" />
                  </a>
                </div>
                {data.interviews.length ? (
                  <div className="saved-list">
                    {data.interviews.map((s) => (
                      <a key={s.id} href={`/interviews/${s.id}`}>
                        <span className="saved-icon">
                          <Icon name="interview" />
                        </span>
                        <div>
                          <strong>{s.title}</strong>
                          <span>
                            {s.answeredCount}/{s.questionCount} answered ·{' '}
                            {s.status === 'completed' ? 'Saved review' : s.status}
                          </span>
                        </div>
                        <Icon name="arrow" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="interview" />
                    <h3>Your first session belongs here.</h3>
                    <p>Start an interview and your saved work will be waiting when you return.</p>
                    <a href="/interviews">
                      Choose a question <Icon name="arrow" />
                    </a>
                  </div>
                )}
              </section>
              <section className="progress-note" aria-labelledby="progress-heading">
                <p className="eyebrow">A LITTLE PERSPECTIVE</p>
                <h2 id="progress-heading">
                  See what’s
                  <br />
                  <em>taking shape.</em>
                </h2>
                <div className="progress-facts">
                  <strong>{data.overview.summary.attempts}</strong>
                  <span>
                    saved {data.overview.summary.attempts === 1 ? 'attempt' : 'attempts'} in your
                    <br />
                    recent analytics window
                  </span>
                </div>
                <p>{data.overview.window.description}</p>
                <a className="quiet-link" href="/progress">
                  Review progress & goals <Icon name="arrow" />
                </a>
              </section>
            </div>
            <details className="legacy-tools">
              <summary>Looking for your other preparation tools?</summary>
              <p>Your guided rounds and application tools, in the same workspace.</p>
              {!demo && (
                <div>
                  <a href="/mock-interviews">Legacy guided interviews</a>
                  <a href="/coding-test">Legacy coding round</a>
                  <a href="/resume-builder">Resume builder</a>
                  <a href="/analyze">One-off ATS analysis</a>
                  <a href="/resume-interview">Resume questions</a>
                  <a href="/careerguidance">Career guidance</a>
                  <a href="/progress/legacy">Original progress screen</a>
                </div>
              )}
              {demo && <p>Legacy remote tools are intentionally outside this offline demo.</p>}
            </details>
          </>
        )}
      </main>
    </Workspace>
  );
}
