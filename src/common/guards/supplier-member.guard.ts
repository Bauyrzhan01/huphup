import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CompaniesService } from '../../companies/companies.service';
import { SUPPLIER_MEMBER_KEY } from '../decorators/supplier-member.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class SupplierMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly companies: CompaniesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      SUPPLIER_MEMBER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPPLIER) {
      return true;
    }

    const resolved = await this.companies.resolveCompanyForUser(user.id);
    if (resolved) {
      return true;
    }

    throw new ForbiddenException('Supplier company membership required');
  }
}
