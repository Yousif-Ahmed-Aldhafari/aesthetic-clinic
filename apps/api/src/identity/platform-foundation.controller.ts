import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { Authenticated, type AuthRequest } from '../auth/access.js';

// No clinic enumeration or write API. Lifecycle commands require a separate
// capability boundary, global audit, operator provisioning and MFA first.
@Controller('platform')
export class PlatformFoundationController {
  @Get('me') @Authenticated()
  me(@Req() request:AuthRequest){
    if(request.auth?.user.platformRole!=='PLATFORM_ADMIN')throw new ForbiddenException();
    return {scope:'FOUNDATION_ONLY',clinicOnboardingEnabled:false,clinicLifecycleEnabled:false,clinicPermissionBypass:false};
  }
}
