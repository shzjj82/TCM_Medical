import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';

interface Props {
  code: 403 | 404;
  onHome: () => void;
  homeLabel?: string;
}

const COPY = {
  404: {
    kind: 'missing' as const,
    title: '页面不存在',
    text: '这个地址没有对应页面，可能已删除或输入有误。',
  },
  403: {
    kind: 'idle' as const,
    title: '没有访问权限',
    text: '当前账号不能查看这项内容，如需开通请联系诊所管理员。',
  },
};

/** 403 / 404：按意图用空状态插画（找不到 → missing，没权限 → idle）。 */
export function StatusPage({ code, onHome, homeLabel = '返回工作台' }: Props) {
  const copy = COPY[code];
  return (
    <EmptyState
      kind={copy.kind}
      title={copy.title}
      text={copy.text}
      action={<Button onClick={onHome}>{homeLabel}</Button>}
    />
  );
}
