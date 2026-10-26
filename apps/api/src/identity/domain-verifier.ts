import { Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { createHash } from 'node:crypto';
@Injectable()
export class DomainVerifier {
  async owns(hostname:string,challengeHash:string){
    // DNS TXT only: never HTTP fetch, connect to a resolved address or redirect.
    const resolver=new Resolver({timeout:1500,tries:1});
    try{const rows=await resolver.resolveTxt(`_lamssa-verification.${hostname}`);return rows.slice(0,100).some(parts=>{const text=parts.join('');if(!/^lamssa-verification=[A-Za-z0-9_-]{43}$/.test(text))return false;return createHash('sha256').update(text.slice('lamssa-verification='.length)).digest('hex')===challengeHash;});}catch{return false;}finally{resolver.cancel();}
  }
}
