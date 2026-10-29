import { BadRequestException } from '@nestjs/common';

/** 性别字典。新建和未填写时默认「男」。 */
export const GENDERS = ['男', '女'] as const;
export type Gender = (typeof GENDERS)[number];
export const DEFAULT_GENDER: Gender = '男';

/** 紧急联系人与患者的关系。一位患者可以有多条。 */
export const CONTACT_RELATIONS = ['配偶', '父母', '子女', '兄弟姐妹', '朋友', '其他'] as const;

export function readGender(value: unknown, fallback: Gender = DEFAULT_GENDER): Gender {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (text === '男' || text === '女') return text;
  throw new BadRequestException('性别请选择男或女');
}
