import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BadRequestException } from '@nestjs/common';

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECKS = '10X98765432';

const ID_CARD_RE = /^[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]$/;
export const PHONE_RE = /^1[3-9]\d{9}$/;

/** 大陆手机号。空值由调用方当作「不填」。 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (!PHONE_RE.test(value)) throw new BadRequestException('请输入 11 位手机号');
  return value;
}

/** 校验 18 位居民身份证，含校验位。空值由调用方当作「不填」。 */
export function normalizeIdCard(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!ID_CARD_RE.test(value)) throw new BadRequestException('身份证号格式不正确');
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  if (CHECKS[sum % 11] !== value[17]) throw new BadRequestException('身份证号校验未通过');
  return value;
}

export function maskIdCard(value: string): string {
  return `${value.slice(0, 3)}${'*'.repeat(value.length - 7)}${value.slice(-4)}`;
}

export function ageFromBirth(birthDate: string, today = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - year;
  const monthDelta = today.getMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) age -= 1;
  return age;
}

export function parseBirthDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('出生日期不正确');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getTime() > Date.now()) {
    throw new BadRequestException('出生日期不正确');
  }
  return value;
}

function encryptionKey(): Buffer {
  const raw = process.env.ID_CARD_KEY?.trim();
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new BadRequestException('未配置身份证加密密钥，暂不能保存身份证号');
  }
  return Buffer.from(raw, 'hex');
}

/** 密文格式 v1.iv.tag.data，三段都是 base64url。密钥不写入密文。 */
export function encryptIdCard(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptIdCard(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new BadRequestException('身份证密文无法读取');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
