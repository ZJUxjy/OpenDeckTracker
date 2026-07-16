import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useAdvisorStore } from '../stores/advisor-store';

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
};

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export function AdvisorFollowUpChat() {
  const { t } = useTranslation();
  const status = useAdvisorStore((s) => s.status);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextIdRef = useRef(1);
  const pendingAssistantIdRef = useRef<number | null>(null);
  const receivedChunkRef = useRef(false);

  useEffect(() => {
    const off = window.hdt?.advisor?.onAskChunk?.((chunk) => {
      const assistantId = pendingAssistantIdRef.current;
      if (assistantId === null) return;
      receivedChunkRef.current = true;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, text: `${message.text}${chunk}` }
            : message,
        ),
      );
    });
    return () => {
      off?.();
    };
  }, []);

  useEffect(() => {
    if (status !== 'idle') return;
    setMessages([]);
    setInput('');
    setPending(false);
    setError(null);
    pendingAssistantIdRef.current = null;
    receivedChunkRef.current = false;
  }, [status]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || pending) return;

    const api = window.hdt?.advisor;
    if (!api?.ask) {
      setError(t('advisor.chat.unavailable'));
      return;
    }

    const userId = nextIdRef.current++;
    const assistantId = nextIdRef.current++;
    pendingAssistantIdRef.current = assistantId;
    receivedChunkRef.current = false;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: question },
      { id: assistantId, role: 'assistant', text: '' },
    ]);
    setInput('');
    setError(null);
    setPending(true);

    try {
      const answer = await api.ask(question);
      if (!receivedChunkRef.current && answer.trim()) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, text: answer } : message,
          ),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('advisor.chat.failed');
      setError(message);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantId && entry.text.length === 0
            ? { ...entry, text: t('advisor.chat.failed') }
            : entry,
        ),
      );
    } finally {
      setPending(false);
      pendingAssistantIdRef.current = null;
    }
  };

  return (
    <section className="rounded border border-border bg-overlay px-2 py-2 space-y-2">
      <div className="text-[11px] font-semibold uppercase text-text-dim">
        {t('advisor.chat.title')}
      </div>
      {messages.length > 0 ? (
        <div className="space-y-1.5" data-testid="advisor-chat-history">
          {messages.map((message) => (
            <div
              key={message.id}
              data-testid={`advisor-chat-message-${message.role}`}
              className={
                message.role === 'user'
                  ? 'ml-6 rounded bg-accent/10 px-2 py-1.5 text-text'
                  : 'mr-4 rounded border border-border bg-overlay-surface px-2 py-1.5 text-text'
              }
            >
              {message.text || (message.role === 'assistant' && pending ? t('advisor.chat.thinking') : '')}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-red" data-testid="advisor-chat-error">{error}</p> : null}
      <form onSubmit={submit} className="flex items-center gap-2" style={NO_DRAG}>
        <input
          data-testid="advisor-chat-input"
          value={input}
          disabled={pending}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={t('advisor.chat.placeholder')}
          className="min-w-0 flex-1 rounded border border-border bg-overlay-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          data-testid="advisor-chat-send"
          disabled={pending || input.trim().length === 0}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-text hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('advisor.chat.send')}
        >
          <SendHorizontal size={14} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
