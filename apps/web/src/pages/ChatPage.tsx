import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { History, Plus, Send, Settings, Trash2 } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { EmptyState } from '../components/ui/empty-state';
import { FormSheet } from '../components/ui/form-sheet';
import { ChatReplySkeleton } from '../components/ui/skeleton';
import { Input, Textarea } from '../components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover';
import { Scrollbar } from '../components/ui/scrollbar';
import { api } from '../lib/api';
import { readThreads, removeThread, titleFrom, upsertThread, type ChatThread } from '../lib/chat-history';
import type { Patient } from '../types';

const MODES = [
  { id: 'summary', label: '简洁摘要' },
  { id: 'review', label: '临床复盘' },
  { id: 'advise', label: '治疗参考' },
  { id: 'teach', label: '教学模式' },
] as const;

type AnswerMode = (typeof MODES)[number]['id'];

interface Scopes {
  patient: boolean;
  internal: boolean;
  external: boolean;
}

interface ChatReply {
  mode: 'llm' | 'rule_based' | 'rule_based_fallback';
  conclusion: string;
  evidence: string[];
  citations: Array<{ kind: string; title: string; note?: string }>;
  risks: string[];
  missing: string[];
  disclaimer: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: ChatReply;
}

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';
const DESKTOP_QUERY = '(min-width: 768px)';

/** 按 PRD：指定患者 / 知识库范围 / 回答模式，回答带来源和风险提示。 */
export function ChatPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [scopes, setScopes] = useState<Scopes>({ patient: false, internal: true, external: true });
  const [answerMode, setAnswerMode] = useState<AnswerMode>('summary');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setHeaderSlot(document.getElementById('mobile-header-end'));
  }, []);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    setScopes((current) => ({ ...current, patient: Boolean(patient) && current.patient }));
  }, [patient]);

  function persist(next: Message[]) {
    if (next.length === 0) return;
    const id = threadId ?? crypto.randomUUID();
    if (!threadId) setThreadId(id);
    const list = upsertThread({
      id,
      title: titleFrom(next),
      updatedAt: new Date().toISOString(),
      patientName: patient?.name,
      patient,
      scopes,
      answerMode,
      messages: next,
    });
    if (historyOpen) setThreads(list);
  }

  function openHistory() {
    setThreads(readThreads());
    setHistoryOpen((open) => !open);
    setSidebarOpen(false);
    setSheetOpen(false);
  }

  function startNew() {
    setThreadId(null);
    setMessages([]);
    setError(null);
    setDraft('');
    if (!desktop) setHistoryOpen(false);
  }

  function openThread(thread: ChatThread) {
    setThreadId(thread.id);
    setMessages(thread.messages);
    setPatient(thread.patient ?? null);
    setScopes(thread.scopes);
    setAnswerMode(thread.answerMode);
    setError(null);
    if (!desktop) setHistoryOpen(false);
  }

  function deleteThread(event: MouseEvent, id: string) {
    event.stopPropagation();
    setThreads(removeThread(id));
    if (threadId !== id) return;
    setThreadId(null);
    setMessages([]);
    setError(null);
    setDraft('');
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const history = messages.slice(-8).map((item) => ({
      role: item.role,
      content: item.role === 'assistant' ? (item.reply?.conclusion || item.text) : item.text,
    }));
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    const started = [...messages, userMsg];
    setDraft('');
    setError(null);
    setMessages(started);
    setBusy(true);
    try {
      const reply = await api.chat({
        message: text,
        history,
        patientId: scopes.patient ? (patient?.externalId ?? patient?.id) : undefined,
        scopes,
        answerMode,
      });
      const next = [...started, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        text: reply.conclusion,
        reply,
      }];
      setMessages(next);
      persist(next);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const customized = Boolean(patient) || !scopes.internal || !scopes.external || answerMode !== 'summary';

  function pickPatient(next: Patient | null) {
    setPatient(next);
    setScopes((current) => ({ ...current, patient: Boolean(next) }));
  }

  function renderSettings() {
    return (
      <ChatSettings
        patient={patient}
        scopes={scopes}
        answerMode={answerMode}
        onPatient={pickPatient}
        onScopes={setScopes}
        onMode={setAnswerMode}
      />
    );
  }

  function renderHistoryButton() {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="历史记录"
        title="历史记录"
        aria-pressed={historyOpen}
        onClick={openHistory}
        className="shrink-0 border-slate-200"
      >
        <History className="h-4 w-4" />
      </Button>
    );
  }

  function renderSettingsButton(onClick: () => void, pressed: boolean) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="对话设置"
        title="对话设置"
        aria-pressed={pressed}
        onClick={onClick}
        className="relative shrink-0 border-slate-200"
      >
        <Settings className="h-4 w-4" />
        {customized ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#175055]" /> : null}
      </Button>
    );
  }

  function renderHeaderActions(onSettings: () => void, settingsPressed: boolean) {
    return (
      <div className="flex items-center gap-2">
        {renderHistoryButton()}
        {renderSettingsButton(onSettings, settingsPressed)}
      </div>
    );
  }

  function renderHistoryList() {
    if (threads.length === 0) {
      return <EmptyState compact kind="empty" text="还没有历史对话。发送后会保存在这里。" />;
    }
    return (
      <div className="divide-y divide-slate-100">
        {threads.map((thread) => (
          <div key={thread.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openThread(thread)}
              className={`min-w-0 flex-1 py-3 text-left ${thread.id === threadId ? 'text-[#175055]' : 'text-slate-800'}`}
            >
              <span className="block truncate text-sm">{thread.title}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-400">
                {[thread.patientName, formatWhen(thread.updatedAt)].filter(Boolean).join(' · ')}
              </span>
            </button>
            <button
              type="button"
              aria-label="删除这条对话"
              onClick={(event) => deleteThread(event, thread.id)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <aside
        aria-hidden={!sidebarOpen}
        className={`hidden h-full shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-out md:block ${
          sidebarOpen ? 'mr-5 w-[240px]' : 'mr-0 w-0'
        }`}
      >
        {sidebarOpen ? (
          <div className="filter-aside-in flex h-full w-[240px] flex-col gap-4 border-r border-slate-100 pr-4">
            <p className="text-sm font-semibold text-slate-800">对话设置</p>
            <Scrollbar className="min-h-0 flex-1" viewportClassName="flex flex-col gap-4">
              {renderSettings()}
            </Scrollbar>
          </div>
        ) : null}
      </aside>

      <aside
        aria-hidden={!historyOpen}
        className={`hidden h-full shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-out md:block ${
          historyOpen ? 'mr-5 w-[260px]' : 'mr-0 w-0'
        }`}
      >
        {historyOpen && desktop ? (
          <div className="filter-aside-in flex h-full w-[260px] flex-col border-r border-slate-100 pr-4">
            <p className="shrink-0 text-sm font-semibold text-slate-800">对话历史</p>
            <Scrollbar className="mt-3 min-h-0 flex-1" viewportClassName="overscroll-contain">
              {renderHistoryList()}
            </Scrollbar>
            <Button className="mt-3 w-full shrink-0" onClick={startNew}>
              <Plus className="h-4 w-4" />
              新对话
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {headerSlot ? createPortal(renderHeaderActions(() => setSheetOpen(true), sheetOpen), headerSlot) : null}

        <div className="hidden shrink-0 items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-800">AI 对话</h1>
          </div>
          {renderHeaderActions(() => {
            setSidebarOpen((open) => !open);
            setHistoryOpen(false);
          }, sidebarOpen)}
        </div>

        <Scrollbar className="mt-3 min-h-0 flex-1 md:mt-4" viewportClassName="flex min-h-full flex-col gap-3 pb-2">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center py-10 text-center">
              <p className="text-sm text-slate-500">可问：总结该患者当前情况、与期初相比有哪些变化、资料库有哪些参考方向</p>
              <p className="mt-2 text-xs text-slate-400">未指定患者时，只检索已勾选的知识库，不会编造病历</p>
            </div>
          ) : messages.map((item) => (
            item.role === 'user' ? (
              <div key={item.id} className="ml-8 flex justify-end md:ml-24">
                <p className="max-w-[min(100%,36rem)] rounded-2xl rounded-br-md bg-[#175055] px-4 py-2.5 text-sm leading-6 text-white">{item.text}</p>
              </div>
            ) : (
              <div key={item.id} className="mr-8 max-w-[min(100%,40rem)] rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 md:mr-16">
                {item.reply ? <ReplyCard reply={item.reply} /> : <p className="text-sm leading-6 text-slate-700">{item.text}</p>}
              </div>
            )
          ))}
          {busy ? <ChatReplySkeleton /> : null}
          <div ref={bottomRef} />
        </Scrollbar>

        {error ? <Alert className="mt-3 shrink-0" tone="danger">{error}</Alert> : null}

        <div className="mt-3 flex shrink-0 items-end gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入问题，Enter 发送"
            className={`${controlClass} min-h-[44px] max-h-32 flex-1 resize-none`}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button className="h-11 shrink-0" disabled={busy || !draft.trim()} onClick={() => void send()}>
            <Send className="h-4 w-4" />
            发送
          </Button>
        </div>
      </div>

      <FormSheet
        open={sheetOpen}
        title="对话设置"
        onClose={() => setSheetOpen(false)}
        footer={<Button className="w-full" onClick={() => setSheetOpen(false)}>完成</Button>}
      >
        <div className="flex flex-col gap-4">
          {renderSettings()}
        </div>
      </FormSheet>

      <FormSheet
        open={historyOpen && !desktop}
        title="对话历史"
        onClose={() => setHistoryOpen(false)}
        footer={(
          <Button className="w-full" onClick={startNew}>
            <Plus className="h-4 w-4" />
            新对话
          </Button>
        )}
      >
        {renderHistoryList()}
      </FormSheet>
    </div>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ChatSettings({
  patient,
  scopes,
  answerMode,
  onPatient,
  onScopes,
  onMode,
}: {
  patient: Patient | null;
  scopes: Scopes;
  answerMode: AnswerMode;
  onPatient: (next: Patient | null) => void;
  onScopes: (next: Scopes | ((current: Scopes) => Scopes)) => void;
  onMode: (next: AnswerMode) => void;
}) {
  return (
    <>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-800">指定患者</p>
        <PatientPick value={patient} onChange={onPatient} />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-800">检索范围</p>
        <ScopeCheck
          label="患者全部记录"
          checked={scopes.patient}
          disabled={!patient}
          onChange={(checked) => onScopes((current) => ({ ...current, patient: checked }))}
        />
        <ScopeCheck
          label="内部治疗资料库"
          checked={scopes.internal}
          onChange={(checked) => onScopes((current) => ({ ...current, internal: checked }))}
        />
        <ScopeCheck
          label="外部治疗参考资料库"
          checked={scopes.external}
          onChange={(checked) => onScopes((current) => ({ ...current, external: checked }))}
        />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-800">回答模式</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={answerMode === item.id}
              onClick={() => onMode(item.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                answerMode === item.id ? 'bg-[#175055] text-white' : 'bg-[#f3f6f7] text-slate-600 hover:bg-[#e7eef1]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ReplyCard({ reply }: { reply: ChatReply }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-700">
      <section>
        <p className="text-xs text-slate-400">结论</p>
        <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{reply.conclusion || '—'}</p>
      </section>
      {reply.evidence.length ? (
        <section>
          <p className="text-xs text-slate-400">依据</p>
          <ul className="mt-0.5 list-disc space-y-1 pl-4">
            {reply.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}
      {reply.citations.length ? (
        <section>
          <p className="text-xs text-slate-400">引用资料</p>
          <ul className="mt-0.5 space-y-1">
            {reply.citations.map((item, index) => (
              <li key={`${item.title}-${index}`} className="text-slate-600">
                来源：{citeLabel(item.kind)}「{item.title}」{item.note ? `，${item.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reply.risks.length ? (
        <section>
          <p className="text-xs text-amber-700">风险与不确定性</p>
          <p className="mt-0.5 text-amber-800">{reply.risks.join('、')}</p>
        </section>
      ) : null}
      {reply.missing.length ? (
        <section>
          <p className="text-xs text-slate-400">建议补充的信息</p>
          <p className="mt-0.5">{reply.missing.join('、')}</p>
        </section>
      ) : null}
      <p className="text-[11px] leading-5 text-slate-400">{reply.disclaimer}</p>
    </div>
  );
}

function citeLabel(kind: string): string {
  if (kind === 'internal') return '内部资料';
  if (kind === 'external') return '外部资料';
  if (kind === 'patient') return '患者记录';
  return '模型通用知识';
}

function ScopeCheck({
  label, checked, disabled, onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? 'text-slate-300' : 'text-slate-600'}`}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </label>
  );
}

function PatientPick({ value, onChange }: { value: Patient | null; onChange: (next: Patient | null) => void }) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Patient[]>([]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      api.listPatients({ keyword: keyword.trim() || undefined, page: 1, pageSize: 8 })
        .then((result) => setRows(result.items))
        .catch(() => setRows([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [keyword, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            className={`${controlClass} bg-white`}
            value={open ? keyword : (value ? `${value.name}${value.gender ? ` ${value.gender}` : ''}${value.age ? ` ${value.age}岁` : ''}` : '')}
            placeholder="搜索并指定患者，可不选"
            onChange={(event) => {
              setKeyword(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setKeyword('');
              setOpen(true);
            }}
          />
          {value && !open ? (
            <button type="button" className="absolute right-3 top-2 text-xs text-[#175055]" onClick={() => onChange(null)}>
              清除
            </button>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[var(--radix-popper-anchor-width)] p-1"
      >
        <ul className="max-h-44 overflow-auto">
          {rows.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-slate-400">没有匹配患者</li>
          ) : rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[#f4fbf9]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item.name}
                <span className="ml-2 text-xs text-slate-400">
                  {[item.gender, item.age ? `${item.age}岁` : ''].filter(Boolean).join(' ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
