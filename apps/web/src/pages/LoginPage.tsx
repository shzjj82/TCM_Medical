import { useState, type FormEvent } from 'react';
import { ClinicMark } from '../components/ClinicSidebar';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { api } from '../lib/api';
import { writeSession } from '../lib/session';
import type { SessionUser } from '../types';

const controlClass = 'h-11 rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

interface Props {
  onLoggedIn: (user: SessionUser) => void;
}

/** 登录页：居中表单，不带左侧导航。 */
export function LoginPage({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const account = username.trim();
    if (!account || !password) {
      setError('请输入账号和密码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(account, password);
      writeSession(result);
      onLoggedIn(result.user);
    } catch (err) {
      setError(String(err).replace(/^\d+\s+/, ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-white text-slate-800 md:bg-[#e7eef1] md:p-3">
      <form
        className="flex w-full max-w-[400px] flex-col bg-white px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] md:rounded-[22px] md:px-8 md:py-10"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#175055]">
            <ClinicMark />
          </span>
          <p className="text-sm font-medium text-[#175055]">沉浸中医诊所</p>
        </div>
        <h1 className="mt-8 text-lg font-semibold tracking-tight text-slate-800">登录</h1>
        <p className="mt-1 text-xs text-slate-400">使用诊所账号进入系统</p>

        <div className="mt-8 grid gap-2">
          <Label htmlFor="login-username">账号</Label>
          <Input
            id="login-username"
            className={controlClass}
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入账号"
          />
        </div>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="login-password">密码</Label>
          <Input
            id="login-password"
            type="password"
            className={controlClass}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
          />
        </div>

        {error ? <Alert className="mt-5" tone="danger">{error}</Alert> : null}

        <Button className="mt-6 h-11 w-full" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </Button>
        <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">
          演示账号 doctor / assistant，初始密码 tcm123456
        </p>
      </form>
    </div>
  );
}
