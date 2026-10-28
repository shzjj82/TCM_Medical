import { useCallback, useEffect, useState } from 'react';

export type AppRoute =
  | { name: 'patients' }
  | { name: 'patient'; patientKey: string }
  | { name: 'case'; patientKey: string; caseKey: string }
  | { name: 'knowledge' }
  | { name: 'advise' }
  | { name: 'skills' };

export interface ListQuery {
  page: number;
  q: string;
  view: string;
  disease: string;
  syndrome: string;
  course: string;
  tag: string;
  doctor: string;
  visit: string;
}

const FILTER_KEYS = ['view', 'disease', 'syndrome', 'course', 'tag', 'doctor', 'visit'] as const;
const LIST_STORAGE = 'tcm-patients-list';

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const parts = pathname.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (parts[0] === 'knowledge') return { name: 'knowledge' };
  if (parts[0] === 'advise') return { name: 'advise' };
  if (parts[0] === 'skills') return { name: 'skills' };
  if (parts[0] === 'patients' && parts[1] && parts[2] === 'cases' && parts[3]) {
    return { name: 'case', patientKey: parts[1], caseKey: parts[3] };
  }
  if (parts[0] === 'patients' && parts[1]) return { name: 'patient', patientKey: parts[1] };
  return { name: 'patients' };
}

export function patientPath(key: string): string {
  return `/patients/${encodeURIComponent(key)}`;
}

export function casePath(patientKey: string, caseKey: string): string {
  return `/patients/${encodeURIComponent(patientKey)}/cases/${encodeURIComponent(caseKey)}`;
}

export function readListQuery(search = window.location.search): ListQuery {
  const params = new URLSearchParams(search);
  const page = Number(params.get('page'));
  return {
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    q: params.get('q') ?? '',
    view: params.get('view') ?? '',
    disease: params.get('disease') ?? '',
    syndrome: params.get('syndrome') ?? '',
    course: params.get('course') ?? '',
    tag: params.get('tag') ?? '',
    doctor: params.get('doctor') ?? '',
    visit: params.get('visit') ?? '',
  };
}

export function listHref(query: ListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.page > 1) params.set('page', String(query.page));
  for (const key of FILTER_KEYS) {
    if (query[key]) params.set(key, query[key]);
  }
  const text = params.toString();
  return text ? `/patients?${text}` : '/patients';
}

export function rememberList(href: string) {
  sessionStorage.setItem(LIST_STORAGE, href);
}

export function savedListHref(): string {
  const saved = sessionStorage.getItem(LIST_STORAGE);
  if (!saved) return '/patients';
  try {
    const url = new URL(saved, window.location.origin);
    if (url.pathname === '/patients' || url.pathname === '/') {
      return `/patients${url.search}`;
    }
  } catch {
    return '/patients';
  }
  return '/patients';
}

export function useAppRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path);
    setRoute(parseRoute(new URL(path, window.location.origin).pathname));
  }, []);
  return { route, navigate };
}
