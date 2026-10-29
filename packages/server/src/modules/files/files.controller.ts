import { BadRequestException, Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { Response } from 'express';

const DIR = join(process.cwd(), 'uploads', 'tongues');

/** 舌象图片落在本地，只保存文件名和访问地址，不写进病历正文。 */
@Controller('files')
export class FilesController {
  @Post('tongue')
  tongue(@Body() body: { imageBase64?: string; mime?: string; name?: string }) {
    const raw = (body?.imageBase64 ?? '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!raw) throw new BadRequestException('没有图片内容');
    const bytes = Buffer.from(raw, 'base64');
    if (!bytes.length) throw new BadRequestException('没有图片内容');
    if (bytes.length > 5 * 1024 * 1024) throw new BadRequestException('舌象图片请控制在 5MB 以内');
    const mime = (body.mime ?? '').toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, id), bytes);
    const name = (body.name || '舌象').replace(/[^\w.\-\u4e00-\u9fff]+/g, '').slice(0, 80) || '舌象';
    return { url: `/api/files/tongues/${id}`, name };
  }

  @Get('tongues/:name')
  read(@Param('name') name: string, @Res() res: Response) {
    const safe = basename(name);
    if (!safe || safe !== name || !/^[\w.-]+$/.test(safe)) {
      throw new BadRequestException('文件不存在');
    }
    const file = join(DIR, safe);
    if (!existsSync(file)) throw new BadRequestException('文件不存在');
    const type = safe.endsWith('.png') ? 'image/png' : safe.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    createReadStream(file).pipe(res);
  }
}
