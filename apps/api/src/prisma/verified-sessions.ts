import { Injectable, UnauthorizedException } from '@nestjs/common';

// A plain JSON object, body field or TypeScript cast cannot manufacture this proof.
declare const verified: unique symbol;
export type VerifiedPrincipal = Readonly<{ [verified]: true }>;
@Injectable()
export class VerifiedSessions {
  private readonly issued = new WeakMap<object, Readonly<{userId:string;sessionId:string}>>();
  issue(userId:string,sessionId:string): VerifiedPrincipal {
    const proof=Object.freeze({}) as VerifiedPrincipal;
    this.issued.set(proof,Object.freeze({userId,sessionId}));return proof;
  }
  require(proof:VerifiedPrincipal) {
    const value=proof && this.issued.get(proof);
    if(!value)throw new UnauthorizedException();
    return value;
  }
}
