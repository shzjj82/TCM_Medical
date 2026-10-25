import { useEffect, useState } from 'react';
import { Play, Send, Wand2 } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Textarea } from '../components/ui/input';
import { api } from '../lib/api';
import type { SkillSummary } from '../types';

/** 技能面板：展示 Skill 的触发词、意图路由与工具，并支持直接执行 / 自然语言调用。 */
export function SkillsPage() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [tool, setTool] = useState('tcm_intake');
  const [params, setParams] = useState('{\n  "json": "{}"\n}');
  const [output, setOutput] = useState<string>('');
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState<{ text: string; mode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSkills().then(setSkills).catch((err) => setError(String(err)));
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(params);
      } catch {
        throw new Error('参数不是合法 JSON');
      }
      const result = await api.runSkill(tool, parsed);
      setOutput(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function chat() {
    if (!chatInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await api.agentChat(chatInput);
      setChatReply({ text: reply.text, mode: reply.mode });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {skills.map((skill) => (
        <Card key={skill.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {skill.name}
              <Badge variant="outline">{skill.id}</Badge>
              <Badge variant="secondary">{skill.tools.length} 个工具</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">触发词</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {skill.keywords.map((word) => (
                  <Badge key={word} variant="accent">{word}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">意图路由</p>
              <table className="mt-2 w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1 text-left font-medium">意图</th>
                    <th className="py-1 text-left font-medium">命中条件</th>
                    <th className="py-1 text-left font-medium">执行命令</th>
                  </tr>
                </thead>
                <tbody>
                  {skill.intents.map((intent) => (
                    <tr key={intent.intent} className="border-b border-border last:border-0">
                      <td className="py-1 font-medium">{intent.intent}</td>
                      <td className="py-1 text-muted-foreground">{intent.when}</td>
                      <td className="py-1 font-mono">{intent.command}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">可用工具</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {skill.tools.map((item) => (
                  <li key={item.name}>
                    <span className="font-mono text-foreground">{item.name}</span> — {item.description}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              直接执行工具
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>工具名</Label>
              <Input value={tool} onChange={(e) => setTool(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>
                参数<span className="text-xs font-normal text-muted-foreground"> JSON</span>
              </Label>
              <Textarea value={params} onChange={(e) => setParams(e.target.value)} className="min-h-[140px] font-mono text-xs" />
            </div>
            <Button onClick={run} disabled={busy}>执行</Button>
            {output ? (
              <pre className="max-h-64 overflow-auto rounded bg-secondary/60 p-2 text-[11px] leading-relaxed">{output}</pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Agent 自然语言调用
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="例：给 P20261025E252 录入今天的复诊，医生说「糖尿病取承山，配足三里调理中焦气机」"
              className="min-h-[140px]"
            />
            <Button variant="accent" onClick={chat} disabled={busy}>
              <Send className="h-4 w-4" />
              发送
            </Button>
            {chatReply ? (
              <div className="space-y-2 rounded-md bg-secondary/60 p-3 text-xs">
                <Badge variant={chatReply.mode === 'llm' ? 'success' : 'warning'}>
                  {chatReply.mode === 'llm' ? '模型自动编排' : '规则降级'}
                </Badge>
                <pre className="whitespace-pre-wrap">{chatReply.text}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
