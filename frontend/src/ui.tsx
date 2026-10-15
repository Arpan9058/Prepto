import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { Notice } from './components';
import type { Page } from './domain';
export const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const value = (form: FormData, name: string) => String(form.get(name) || '');
export const percent = (n: number | null | undefined) => (n == null ? 'Not scored' : `${n}%`);
export function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, refresh] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    api<T>(url, { headers: { Accept: 'application/json' }, signal: control.signal })
      .then((v) => {
        if (!control.signal.aborted) setData(v);
      })
      .catch((e: unknown) => {
        if (!control.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load this screen');
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [url, revision]);
  return { data, error, loading, reload: () => refresh((n) => n + 1) };
}
export function usePages<T>(url: string) {
  const [cursor, setCursor] = useState<string | null>(null),
    [items, setItems] = useState<T[]>([]),
    [refresh, setRefresh] = useState(0);
  const previous = useRef(url);
  const resource = useResource<Page<T>>(
    `${url}${url.includes('?') ? '&' : '?'}${cursor ? 'after=' + encodeURIComponent(cursor) + '&' : ''}pageSize=12&refresh=${refresh}`,
  );
  useEffect(() => {
    if (previous.current !== url) {
      previous.current = url;
      setCursor(null);
      setItems([]);
    }
  }, [url]);
  useEffect(() => {
    if (resource.data)
      setItems((old) => (cursor ? [...old, ...resource.data!.items] : resource.data!.items));
  }, [resource.data]);
  return {
    ...resource,
    items,
    more: resource.data?.nextCursor ? () => setCursor(resource.data!.nextCursor) : undefined,
    reload: () => {
      setCursor(null);
      setItems([]);
      setRefresh((n) => n + 1);
    },
  };
}
export function LoadState({
  resource,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
}) {
  return resource.error ? (
    <Notice error retry={resource.reload}>
      {resource.error}
    </Notice>
  ) : resource.loading ? (
    <Notice busy>Loading your saved work…</Notice>
  ) : null;
}
export function Screen({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="product-main" tabIndex={-1}>
      <p className="eyebrow">YOUR PREPARATION WORKSPACE</p>
      <h1>{title}</h1>
      <p className="screen-intro">{intro}</p>
      {children}
    </main>
  );
}
export function AsyncForm({
  children,
  save,
  label = 'Save',
  success = 'Saved successfully.',
  className = '',
  id,
}: {
  children: ReactNode;
  save: (data: FormData, requestId: string) => Promise<void>;
  label?: string;
  success?: string;
  className?: string;
  id?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  return (
    <form
      id={id}
      className={`form-stack ${className}`}
      onInput={() => {
        requestId.current = null;
        setSaved(false);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        requestId.current ||= crypto.randomUUID();
        setBusy(true);
        setError('');
        setSaved(false);
        try {
          await save(form, requestId.current);
          setSaved(true);
          requestId.current = null;
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Unable to save. Please try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="button" type="submit">
          {busy ? 'Saving…' : label}
        </button>
      </fieldset>
      {error && <Notice error>{error}</Notice>}
      {saved && <Notice>{success}</Notice>}
    </form>
  );
}
export function Action({
  children,
  run,
  className = '',
}: {
  children: ReactNode;
  run: () => Promise<unknown>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <span className="action-wrap">
      <button
        className={`button button-secondary ${className}`}
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await run();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to complete request');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Working…' : children}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
export function More({ run }: { run?: () => void }) {
  return run ? (
    <button className="button button-secondary more-button" onClick={run}>
      Load more
    </button>
  ) : null;
}
export function Select({
  name,
  label,
  choices,
  value: current,
  onChange,
}: {
  name?: string;
  label: string;
  choices: string[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select name={name} value={current} onChange={(e) => onChange?.(e.target.value)}>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c || 'All'}
          </option>
        ))}
      </select>
    </label>
  );
}
