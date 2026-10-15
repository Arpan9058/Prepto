import { useState } from 'react';
import { api } from './api';
import type { Question } from './domain';
import {
  Action,
  AsyncForm,
  Empty,
  LoadState,
  More,
  Screen,
  Select,
  json,
  usePages,
  value,
} from './ui';
const categories = [
  'technical',
  'behavioral',
  'systemDesign',
  'aptitude',
  'reasoning',
  'automata',
  'englishComprehension',
  'personality',
];
export function Questions({ admin }: { admin: boolean }) {
  const [query, setQuery] = useState(''),
    [saved, setSaved] = useState(false),
    [editing, setEditing] = useState<Question | 'new' | null>(null);
  const rows = usePages<Question>(`/api/${saved ? 'bookmarks' : 'questions'}?${query}`);
  return (
    <Screen
      title="A question worth your time."
      intro="Search, bookmark and take a useful question into your next interview."
    >
      <AsyncForm
        label="Apply filters"
        success="Filters updated."
        save={async (form) => {
          setQuery(
            new URLSearchParams({
              q: value(form, 'q'),
              category: value(form, 'category'),
              difficulty: value(form, 'difficulty'),
              ...(admin && form.has('archived') ? { archived: 'true' } : {}),
            }).toString(),
          );
        }}
        className="filter-form"
      >
        <label>
          Search
          <input name="q" maxLength={100} />
        </label>
        <Select label="Category" name="category" choices={['', ...categories]} />
        <Select label="Difficulty" name="difficulty" choices={['', 'easy', 'medium', 'hard']} />
        {admin && (
          <label className="check-label">
            <input type="checkbox" name="archived" />
            Archived questions only
          </label>
        )}
      </AsyncForm>
      <div className="toolbar">
        <button
          className="button button-secondary"
          aria-pressed={saved}
          onClick={() => setSaved(!saved)}
        >
          {saved ? 'Show all questions' : 'Bookmarks'}
        </button>
        {admin && (
          <button className="button" onClick={() => setEditing('new')}>
            Create question
          </button>
        )}
      </div>
      <LoadState resource={rows} />
      <div className="cards-grid">
        {rows.items.map((q) => (
          <article className="content-card" key={q.id}>
            <p className="eyebrow">
              {q.category} · {q.difficulty}
            </p>
            <h2>{q.title}</h2>
            <p>{q.prompt}</p>
            <p>{q.skills.join(' · ')}</p>
            <div className="toolbar">
              <Action
                run={async () => {
                  await api(`/api/questions/${q.id}/bookmark`, {
                    method: saved || q.bookmarked ? 'DELETE' : 'PUT',
                  });
                  rows.reload();
                }}
              >
                {saved || q.bookmarked ? 'Unsave question' : 'Bookmark'}
              </Action>
              <a className="button" href={`/interviews?question=${q.id}`}>
                Practice this question
              </a>
              {admin && (
                <>
                  <button className="button button-secondary" onClick={() => setEditing(q)}>
                    Edit question
                  </button>
                  <Action
                    run={async () => {
                      if (
                        confirm(
                          'Archive this question? Existing interview snapshots are preserved.',
                        )
                      ) {
                        await api(
                          `/api/admin/questions/${q.id}/archive`,
                          json({ revision: q.revision }),
                        );
                        rows.reload();
                      }
                    }}
                  >
                    Archive
                  </Action>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!rows.loading && !rows.error && !rows.items.length && (
        <Empty>No questions match. Try different filters or save your first bookmark.</Empty>
      )}
      <More run={rows.more} />
      {editing && (
        <section className="content-card" aria-labelledby="editor-title">
          <h2 id="editor-title">{editing === 'new' ? 'Create question' : 'Edit question'}</h2>
          <QuestionEditor
            key={editing === 'new' ? 'new' : editing.id}
            question={editing === 'new' ? undefined : editing}
            save={async (body) => {
              await api(
                editing === 'new' ? '/api/admin/questions' : `/api/admin/questions/${editing.id}`,
                json(body, editing === 'new' ? 'POST' : 'PUT'),
              );
              setEditing(null);
              rows.reload();
            }}
          />
          <button className="text-button" onClick={() => setEditing(null)}>
            Cancel editing
          </button>
        </section>
      )}
    </Screen>
  );
}
function QuestionEditor({
  question,
  save,
}: {
  question?: Question;
  save: (body: unknown) => Promise<void>;
}) {
  return (
    <AsyncForm
      save={async (form) =>
        save({
          title: value(form, 'title'),
          prompt: value(form, 'prompt'),
          category: value(form, 'category'),
          difficulty: value(form, 'difficulty'),
          type: value(form, 'type'),
          skills: value(form, 'skills')
            .split(',')
            .map((s) => s.trim()),
          options: value(form, 'options').split('\n').filter(Boolean),
          answer: value(form, 'answer'),
          explanation: value(form, 'explanation'),
          revision: question?.revision,
        })
      }
      label="Save question"
    >
      <label>
        Title
        <input name="title" defaultValue={question?.title} maxLength={140} required />
      </label>
      <label>
        Prompt
        <textarea name="prompt" defaultValue={question?.prompt} maxLength={4000} required />
      </label>
      <label>
        Category
        <select name="category" defaultValue={question?.category}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Difficulty
        <select name="difficulty" defaultValue={question?.difficulty}>
          {['easy', 'medium', 'hard'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select name="type" defaultValue={question?.type}>
          <option value="openEnded">Open-ended</option>
          <option value="multipleChoice">Multiple choice</option>
        </select>
      </label>
      <label>
        Skills (comma separated, 1–5)
        <input name="skills" defaultValue={question?.skills.join(', ')} required />
      </label>
      <label>
        Options (one per line for multiple choice)
        <textarea name="options" defaultValue={question?.options.join('\n')} />
      </label>
      <label>
        Correct option (multiple choice only)
        <input name="answer" defaultValue={question?.answer} />
      </label>
      <label>
        Explanation
        <textarea
          name="explanation"
          defaultValue={question?.explanation}
          maxLength={4000}
          required
        />
      </label>
    </AsyncForm>
  );
}
