import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpTrafficInterceptor } from './http-traffic.interceptor';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  controllers: [OpsController],
  providers: [
    OpsService,
    { provide: APP_INTERCEPTOR, useClass: HttpTrafficInterceptor },
  ],
})
export class OpsModule {}
