import { BadRequestException } from '@nestjs/common';
import { domainToASCII } from 'node:url';
import { currencyScales } from '../billing/money.js';

export const typography = ['TAJAWAL','SYSTEM','NOTO_NASKH'] as const;
export const staffRoles = ['CLINIC_OWNER','CLINIC_ADMIN','DOCTOR','RECEPTIONIST','ACCOUNTANT'] as const;
export const currencies = Object.keys(currencyScales);
const reserved = new Set(['www','api','admin','platform','auth','login','logout','app','mail','smtp','support','help','status','static','assets','cdn','public','billing','root','localhost','lamssa']);
export function subdomain(value:string):string {
  const result=value.normalize('NFKC').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(result)||reserved.has(result))throw new BadRequestException();
  return result;
}
export function customHostname(value:string,base:string):string {
  if(typeof value!=='string'||value.length>253||/[\s/@:#?\\]/.test(value))throw new BadRequestException();
  const host=domainToASCII(value.replace(/\.$/,'').toLowerCase());
  const labels=host.split('.');
  if(labels.length<2||labels.some(l=>!l||l.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l))||
    !/^[a-z]{2,63}$/.test(labels.at(-1)!)||['localhost','local','internal','invalid','test','example','lan','home','arpa','onion'].includes(labels.at(-1)!)||
    host===base||host.endsWith('.'+base))throw new BadRequestException();
  return host;
}
export function validTimezone(value:unknown):boolean {
  if(typeof value!=='string'||value.length>100||/^[+-]/.test(value)||(!value.includes('/')&&value!=='UTC'))return false;
  try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}
}
const luminance=(hex:string)=>{const s=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2];};
export const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
export function validateColors(primary:string,secondary:string,accent:string|null){
  if(contrast(primary,'#FFFFFF')<4.5||contrast(secondary,'#17243B')<4.5||(accent&&Math.max(contrast(accent,'#FFFFFF'),contrast(accent,'#17243B'))<4.5))throw new BadRequestException();
}
