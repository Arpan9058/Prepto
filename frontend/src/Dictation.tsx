import { useEffect, useRef, useState } from 'react';
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function Dictation({ text, setText }: { text: string; setText: (text: string) => void }) {
  const root = useRef<HTMLDivElement>(null),
    recognition = useRef<Recognition | null>(null),
    [active, setActive] = useState(false),
    [error, setError] = useState('');
  const Constructor =
    (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  useEffect(() => {
    const form = root.current?.closest('form');
    const stop = () => {
      recognition.current?.stop();
      setActive(false);
    };
    form?.addEventListener('submit', stop);
    return () => {
      form?.removeEventListener('submit', stop);
      if (recognition.current) {
        recognition.current.onresult = null;
        recognition.current.onend = null;
        recognition.current.onerror = null;
        recognition.current.abort();
      }
    };
  }, []);
  if (!Constructor)
    return (
      <p className="dictation-note">
        Voice input is unavailable in this browser. You can type your answer.
      </p>
    );
  return (
    <div ref={root} className="dictation">
      <button
        type="button"
        className="button button-secondary"
        aria-pressed={active}
        onClick={() => {
          if (active) {
            recognition.current?.stop();
            setActive(false);
            return;
          }
          const session = new Constructor(),
            prefix = text.trim();
          recognition.current?.abort();
          recognition.current = session;
          session.continuous = true;
          session.interimResults = true;
          session.lang = 'en-US';
          session.onresult = (event) =>
            setText(
              (
                (prefix ? prefix + ' ' : '') +
                Array.from(event.results)
                  .map((result) => result[0].transcript)
                  .join(' ')
              ).slice(0, 12000),
            );
          session.onerror = () => {
            setError('Voice input stopped. Check browser permissions or continue typing.');
            setActive(false);
          };
          session.onend = () => setActive(false);
          try {
            session.start();
            setError('');
            setActive(true);
          } catch {
            setError('Could not start voice input. You can continue typing.');
          }
        }}
      >
        {active ? 'Stop voice input' : 'Start voice input'}
      </button>
      <p className="dictation-note">
        Optional browser speech recognition may use your browser vendor’s service. No microphone
        access is requested until you choose Start.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
