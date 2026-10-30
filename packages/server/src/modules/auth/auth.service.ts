import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from '../../entities/user.entity';
import { hashPassword, verifyPassword } from './password';
import { signToken, verifyToken, type TokenUser } from './token';

const BOOTSTRAP: Array<{ username: string; name: string; role: UserRole; title: string }> = [
  { username: 'doctor', name: '张医生', role: 'doctor', title: '主治医师' },
  { username: 'assistant', name: '医助', role: 'assistant', title: '医助' },
];

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async onModuleInit() {
    const password = process.env.AUTH_BOOTSTRAP_PASSWORD ?? 'tcm123456';
    for (const item of BOOTSTRAP) {
      const exists = await this.users.findOne({ where: { username: item.username } });
      if (exists) continue;
      await this.users.save(this.users.create({
        ...item,
        passwordHash: await hashPassword(password),
      }));
    }
  }

  async login(username: string, password: string) {
    const account = username.trim().toLowerCase();
    if (!account || !password) throw new UnauthorizedException('请输入账号和密码');
    const user = await this.users.createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.username = :username', { username: account })
      .getOne();
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('账号或密码不正确');
    }
    user.lastLoginAt = new Date();
    await this.users.save(user);
    const profile = this.present(user);
    return { token: signToken(profile), user: profile };
  }

  async profile(id: string): Promise<TokenUser> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('请先登录');
    return this.present(user);
  }

  fromToken(token: string): TokenUser | null {
    return verifyToken(token);
  }

  private present(user: User): TokenUser {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      title: user.title,
    };
  }
}
