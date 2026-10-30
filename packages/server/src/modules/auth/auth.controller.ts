import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public';
import type { TokenUser } from './token';

class LoginBody {
  @IsString()
  @IsNotEmpty({ message: '请输入账号' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginBody) {
    return this.auth.login(body.username, body.password);
  }

  @Get('me')
  me(@Req() request: Request & { user?: TokenUser }) {
    if (!request.user) throw new UnauthorizedException('请先登录');
    return request.user;
  }
}
