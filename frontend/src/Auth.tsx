import { api } from './api';
import { Brand, Notice } from './components';
import { AsyncForm, LoadState, Screen, json, useResource, value } from './ui';
interface AuthConfig {
  demo: boolean;
  firebase: Record<string, string> | null;
}
let authentication: Promise<import('firebase/auth').Auth> | undefined;
function browserAuth(config: Record<string, string>) {
  authentication ||= Promise.all([import('firebase/app'), import('firebase/auth')])
    .then(([app, sdk]) =>
      sdk.initializeAuth(app.getApps()[0] || app.initializeApp(config), {
        persistence: sdk.inMemoryPersistence,
      }),
    )
    .catch((error) => {
      authentication = undefined;
      throw new Error('Unable to open sign-in. Please try again.', { cause: error });
    });
  return authentication;
}

export function Auth({ mode }: { mode: 'login' | 'register' | 'reset' }) {
  const config = useResource<AuthConfig>('/api/runtime');
  const title =
    mode === 'login'
      ? 'Welcome back.'
      : mode === 'register'
        ? 'Make room for your next chapter.'
        : 'A fresh way back in.';
  return (
    <div className="auth-layout">
      <aside className="auth-editorial">
        <Brand inverse />
        <div>
          <p className="eyebrow">PREPARE WITH INTENTION</p>
          <h1>
            Clear thinking.
            <br />
            <em>Better conversations.</em>
          </h1>
          <p>A workspace for the practice, reflection and small steps that come next.</p>
        </div>
        <a href="/">Back to Prepto</a>
      </aside>
      <main id="main-content" className="auth-panel" tabIndex={-1}>
        <h1>{title}</h1>
        <p>
          {mode === 'reset'
            ? 'Request a password reset email. For privacy, the response does not confirm whether an account exists.'
            : 'Your work stays private. Tokens are held in secure server-set cookies, not local storage.'}
        </p>
        <LoadState resource={config} />
        {config.data?.demo ? (
          <Notice>
            This is an isolated demo. <a href="/demo">Use a synthetic workspace</a>.
          </Notice>
        ) : config.data && !config.data.firebase ? (
          <Notice error>
            Browser sign-in is not configured. Contact the operator; do not paste credentials here.
          </Notice>
        ) : (
          config.data?.firebase && (
            <AsyncForm
              label={
                mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create your workspace'
                    : 'Send reset email'
              }
              success={
                mode === 'reset'
                  ? 'If an account can receive a reset email, instructions will arrive shortly.'
                  : 'Signed in.'
              }
              save={async (form) => {
                if (mode === 'register' && value(form, 'password') !== value(form, 'confirm'))
                  throw new Error('Passwords do not match.');
                const auth = await browserAuth(config.data!.firebase!);
                const sdk = await import('firebase/auth');
                if (mode === 'reset') {
                  try {
                    await sdk.sendPasswordResetEmail(auth, value(form, 'email'));
                  } catch (e) {
                    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
                    if (!['auth/user-not-found', 'auth/invalid-email'].includes(code))
                      throw new Error('Unable to request a reset right now. Please try again.', {
                        cause: e,
                      });
                  }
                  return;
                }
                let identity;
                try {
                  identity =
                    mode === 'login'
                      ? await sdk.signInWithEmailAndPassword(
                          auth,
                          value(form, 'email'),
                          value(form, 'password'),
                        )
                      : await sdk.createUserWithEmailAndPassword(
                          auth,
                          value(form, 'email'),
                          value(form, 'password'),
                        );
                } catch {
                  throw new Error(
                    'Unable to sign in or create this account. Check your details and try again.',
                  );
                }
                await api('/api/set-token', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${await identity.user.getIdToken()}` },
                });
                if (mode === 'register') {
                  await api(
                    '/api/profile',
                    json(
                      { fullName: value(form, 'fullName'), mobile: value(form, 'mobile') },
                      'PUT',
                    ),
                  );
                  location.assign('/onboarding');
                } else location.assign('/dashboard');
              }}
            >
              {mode === 'register' && (
                <>
                  <label>
                    Full name
                    <input name="fullName" autoComplete="name" maxLength={200} required />
                  </label>
                  <label>
                    Phone (optional)
                    <input name="mobile" type="tel" autoComplete="tel" maxLength={40} />
                  </label>
                </>
              )}
              <label>
                Email
                <input type="email" name="email" autoComplete="email" required />
              </label>
              {mode !== 'reset' && (
                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={6}
                    required
                  />
                </label>
              )}
              {mode === 'register' && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    name="confirm"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
              )}
            </AsyncForm>
          )
        )}
        <div className="auth-links">
          <a href={mode === 'login' ? '/register' : '/login'}>
            {mode === 'login' ? 'Create an account' : 'Back to sign in'}
          </a>
          <a href="/forgot-password">Forgot password?</a>
        </div>
      </main>
    </div>
  );
}
export function Onboarding() {
  const profile = useResource<{ fullName: string; mobile: string }>('/api/profile');
  return (
    <Screen
      title="A workspace that starts with you."
      intro="Save your profile, then choose your first focused activity."
    >
      <LoadState resource={profile} />
      {profile.data && (
        <section className="content-card">
          <AsyncForm
            label="Save profile"
            save={async (f) => {
              await api(
                '/api/profile',
                json({ fullName: value(f, 'fullName'), mobile: value(f, 'mobile') }, 'PUT'),
              );
            }}
          >
            <label>
              Full name
              <input
                name="fullName"
                defaultValue={profile.data.fullName}
                maxLength={200}
                required
              />
            </label>
            <label>
              Phone (optional)
              <input name="mobile" defaultValue={profile.data.mobile} maxLength={40} />
            </label>
          </AsyncForm>
          <div className="toolbar">
            <a className="button" href="/interviews">
              Start an interview
            </a>
            <a className="button button-secondary" href="/coding-practice">
              Practice coding
            </a>
            <a href="/dashboard">Open dashboard</a>
          </div>
        </section>
      )}
    </Screen>
  );
}
