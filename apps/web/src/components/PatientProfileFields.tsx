import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Patient } from '../types';
import { cn } from '../lib/utils';
import { FieldWrapper } from './CaseForm';
import { DatePicker } from './ui/date-picker';
import { DoctorSearch } from './ui/doctor-search';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { TabItem, Tabs } from './ui/tabs';

export const GENDERS = [
  { value: '男', label: '男' },
  { value: '女', label: '女' },
] as const;
export const DEFAULT_GENDER = '男';

export const CONTACT_RELATIONS = ['配偶', '父母', '子女', '兄弟姐妹', '朋友', '其他'] as const;
export const PATIENT_SOURCES = ['自然到诊', '亲友介绍', '医生转诊', '线上咨询', '其他'] as const;
export const CONSENT_OPTIONS = [
  { id: 'unknown', label: '未记录' },
  { id: 'granted', label: '已授权' },
  { id: 'revoked', label: '已拒绝' },
] as const;

export type ConsentStatus = (typeof CONSENT_OPTIONS)[number]['id'];

const EMPTY_OPTION = '__none__';

export interface EmergencyContactValue {
  key: string;
  name: string;
  relation: string;
  phone: string;
}

export interface PatientProfileValue {
  name: string;
  gender: string;
  birthDate: string;
  phone: string;
  idCard: string;
  clearIdCard: boolean;
  occupation: string;
  residence: string;
  emergencyContacts: EmergencyContactValue[];
  source: string;
  doctor: string;
  tags: string;
  privacyConsent: ConsentStatus;
  aiConsent: ConsentStatus;
}

function emptyContact(): EmergencyContactValue {
  return { key: crypto.randomUUID(), name: '', relation: '', phone: '' };
}

export const EMPTY_PROFILE: PatientProfileValue = {
  name: '', gender: DEFAULT_GENDER, birthDate: '', phone: '', idCard: '', clearIdCard: false,
  occupation: '', residence: '', emergencyContacts: [emptyContact()],
  source: '', doctor: '', tags: '', privacyConsent: 'revoked', aiConsent: 'revoked',
};

export function ageFromBirth(birthDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [year, month, day] = birthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDelta = today.getMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

export function profileFromPatient(patient: Patient): PatientProfileValue {
  const contacts = (patient.emergencyContacts ?? []).map((item) => ({
    key: item.id ?? crypto.randomUUID(),
    name: item.name ?? '',
    relation: item.relation ?? '',
    phone: item.phone ?? '',
  }));
  return {
    ...EMPTY_PROFILE,
    name: patient.name ?? '',
    gender: patient.gender === '女' ? '女' : DEFAULT_GENDER,
    birthDate: patient.birthDate ? String(patient.birthDate).slice(0, 10) : '',
    phone: patient.phone ?? '',
    occupation: patient.occupation ?? '',
    residence: patient.residence ?? '',
    emergencyContacts: contacts.length ? contacts : [emptyContact()],
    source: patient.source ?? '',
    doctor: patient.doctor ?? '',
    tags: (patient.tags ?? []).join('，'),
    privacyConsent: patient.privacyConsent === 'granted' ? 'granted' : 'revoked',
    aiConsent: patient.aiConsent === 'granted' ? 'granted' : 'revoked',
  };
}

export function profilePayload(value: PatientProfileValue) {
  const birthDate = value.birthDate || null;
  const payload: Record<string, unknown> = {
    name: value.name.trim(),
    gender: value.gender === '女' ? '女' : DEFAULT_GENDER,
    birthDate,
    age: birthDate ? ageFromBirth(value.birthDate) : null,
    phone: value.phone,
    occupation: value.occupation,
    residence: value.residence,
    source: value.source,
    doctor: value.doctor,
    tags: value.tags.split(/[,，、/|]+/).map((item) => item.trim()).filter(Boolean),
    privacyConsent: value.privacyConsent,
    aiConsent: value.aiConsent,
    emergencyContacts: value.emergencyContacts
      .map((item) => ({ name: item.name.trim(), relation: item.relation.trim(), phone: item.phone.trim() }))
      .filter((item) => item.name || item.relation || item.phone),
  };
  if (value.clearIdCard) payload.idCard = null;
  else if (value.idCard.trim()) payload.idCard = value.idCard.trim();
  return payload;
}

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';
const PHONE_RE = /^1[3-9]\d{9}$/;
const ID_CARD_RE = /^[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]$/;
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECKS = '10X98765432';

export function phoneError(phone: string): string | null {
  const value = phone.trim();
  if (!value) return null;
  if (!PHONE_RE.test(value)) return '请输入 11 位手机号';
  return null;
}

export function idCardError(idCard: string): string | null {
  const value = idCard.trim().toUpperCase();
  if (!value) return null;
  if (!ID_CARD_RE.test(value)) return '身份证号格式不正确';
  const sum = ID_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  if (ID_CHECKS[sum % 11] !== value[17]) return '身份证号校验未通过';
  return null;
}

export function profileIssues(value: PatientProfileValue): string | null {
  return phoneError(value.phone) ?? idCardError(value.idCard);
}

function ConsentSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{checked ? '授权' : '未授权'}{hint ? ` · ${hint}` : ''}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function DictSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[70]">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PatientProfileFields({
  value,
  idCardMask,
  onChange,
  reveal = 0,
}: {
  value: PatientProfileValue;
  idCardMask?: string | null;
  onChange: (patch: Partial<PatientProfileValue>) => void;
  /** 保存被格式校验拦住时加一，回到出问题的基本信息页。 */
  reveal?: number;
}) {
  const age = ageFromBirth(value.birthDate);
  const [tab, setTab] = useState('basic');
  const phoneIssue = phoneError(value.phone);
  const idIssue = idCardError(value.idCard);
  useEffect(() => {
    if (reveal && (phoneIssue || idIssue)) setTab('basic');
  }, [reveal, phoneIssue, idIssue]);
  const idHint = value.clearIdCard
    ? '保存后删除已存身份证'
    : idCardMask
      ? `已加密保存 ${idCardMask}，留空则不修改`
      : undefined;

  return (
    <Tabs value={tab} onValueChange={setTab} variant="line" stableHeight>
      <TabItem value="basic" label="基本信息">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrapper label="姓名" required>
              <Input className={controlClass} value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="性别">
              <DictSelect
                value={value.gender === '女' ? '女' : DEFAULT_GENDER}
                options={GENDERS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={(gender) => onChange({ gender })}
              />
            </FieldWrapper>
            <FieldWrapper label="出生日期">
              <DatePicker
                value={value.birthDate}
                onChange={(birthDate) => onChange({ birthDate })}
                suffix={age === null ? undefined : `${age} 岁`}
              />
            </FieldWrapper>
            <FieldWrapper label="职业">
              <Input className={controlClass} value={value.occupation} onChange={(event) => onChange({ occupation: event.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="手机号" error={phoneIssue ?? undefined}>
              <Input className={cn(controlClass, phoneIssue && 'border-destructive')} inputMode="tel" aria-invalid={phoneIssue ? true : undefined} value={value.phone} onChange={(event) => onChange({ phone: event.target.value })} placeholder="11 位手机号" />
            </FieldWrapper>
            <FieldWrapper label="身份证号" hint={idHint} error={idIssue ?? undefined}>
              <Input
                className={cn(controlClass, idIssue && 'border-destructive')}
                aria-invalid={idIssue ? true : undefined}
                value={value.idCard}
                onChange={(event) => onChange({ idCard: event.target.value, clearIdCard: false })}
                placeholder={idCardMask && !value.clearIdCard ? idCardMask : '18 位'}
                autoComplete="off"
              />
              {idCardMask && !value.idCard ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-xs text-slate-400"
                  onClick={() => onChange({ clearIdCard: !value.clearIdCard, idCard: '' })}
                >
                  {value.clearIdCard ? '取消清除身份证' : '清除已存身份证'}
                </Button>
              ) : null}
            </FieldWrapper>
            <div className="md:col-span-2">
              <FieldWrapper label="居住地">
                <Textarea
                  className={`${controlClass} min-h-[84px] resize-y`}
                  rows={3}
                  value={value.residence}
                  onChange={(event) => onChange({ residence: event.target.value })}
                  placeholder="省市区、街道、门牌号"
                />
              </FieldWrapper>
            </div>
          </div>
        </div>
      </TabItem>
      <TabItem value="contacts" label="紧急联系人">
        <div className="space-y-3">
          {value.emergencyContacts.map((contact, index) => {
            const known = CONTACT_RELATIONS as readonly string[];
            const relationOptions = [
              { value: EMPTY_OPTION, label: '请选择' },
              ...(contact.relation && !known.includes(contact.relation) ? [{ value: contact.relation, label: contact.relation }] : []),
              ...CONTACT_RELATIONS.map((item) => ({ value: item, label: item })),
            ];
            return (
              <div key={contact.key} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">联系人 {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-slate-400"
                    onClick={() => onChange({
                      emergencyContacts: value.emergencyContacts.length === 1
                        ? [emptyContact()]
                        : value.emergencyContacts.filter((item) => item.key !== contact.key),
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <FieldWrapper label="姓名">
                    <Input className={controlClass} value={contact.name} onChange={(event) => onChange({
                      emergencyContacts: value.emergencyContacts.map((item) => item.key === contact.key ? { ...item, name: event.target.value } : item),
                    })} />
                  </FieldWrapper>
                  <FieldWrapper label="关系">
                    <DictSelect
                      value={contact.relation || EMPTY_OPTION}
                      options={relationOptions}
                      onChange={(relation) => onChange({
                        emergencyContacts: value.emergencyContacts.map((item) => item.key === contact.key ? { ...item, relation: relation === EMPTY_OPTION ? '' : relation } : item),
                      })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="电话">
                    <Input className={controlClass} inputMode="tel" value={contact.phone} onChange={(event) => onChange({
                      emergencyContacts: value.emergencyContacts.map((item) => item.key === contact.key ? { ...item, phone: event.target.value } : item),
                    })} />
                  </FieldWrapper>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full border-slate-200"
            onClick={() => onChange({ emergencyContacts: [...value.emergencyContacts, emptyContact()] })}
          >
            <Plus className="h-4 w-4" />
            添加联系人
          </Button>
        </div>
      </TabItem>
      <TabItem value="visit" label="就诊信息">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="患者来源">
            <DictSelect
              value={value.source || EMPTY_OPTION}
              options={[{ value: EMPTY_OPTION, label: '未填写' }, ...PATIENT_SOURCES.map((item) => ({ value: item, label: item }))]}
              onChange={(source) => onChange({ source: source === EMPTY_OPTION ? '' : source })}
            />
          </FieldWrapper>
          <FieldWrapper label="主治医生">
            <DoctorSearch className={controlClass} value={value.doctor} onChange={(doctor) => onChange({ doctor })} />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="患者标签" hint="多个标签用逗号分开">
              <Input className={controlClass} value={value.tags} onChange={(event) => onChange({ tags: event.target.value })} placeholder="眩晕，失眠" />
            </FieldWrapper>
          </div>
        </div>
      </TabItem>
      <TabItem value="consent" label="授权信息">
        <div className="space-y-3">
          <ConsentSwitch
            label="隐私授权"
            checked={value.privacyConsent === 'granted'}
            onCheckedChange={(checked) => onChange({ privacyConsent: checked ? 'granted' : 'revoked' })}
          />
          <ConsentSwitch
            label="AI 授权"
            hint="用于智能解析与建议"
            checked={value.aiConsent === 'granted'}
            onCheckedChange={(checked) => onChange({ aiConsent: checked ? 'granted' : 'revoked' })}
          />
        </div>
      </TabItem>
    </Tabs>
  );
}
