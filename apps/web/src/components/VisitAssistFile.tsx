import { FileAudio, FileText } from 'lucide-react';
import { isAudioMedia, type VisitMedia } from '../lib/visit-display';

export function VisitAssistFile({ file }: { file: VisitMedia }) {
  const Icon = isAudioMedia(file) ? FileAudio : FileText;
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[#e7f4f2] px-2 py-1 text-xs text-[#175055]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{file.name}</span>
    </a>
  );
}
