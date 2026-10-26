import { useEffect } from 'react';
import type { CSSProperties } from 'react';
export const fontFamilies:Record<string,string>={TAJAWAL:'Tajawal, Tahoma, Arial, sans-serif',SYSTEM:'Tahoma, Arial, sans-serif',NOTO_NASKH:'"Noto Naskh Arabic", "Traditional Arabic", serif'};
export interface BrandIdentity {displayName:string;branding:{logoUrl:string|null;faviconUrl?:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null;typography?:string}|null}
export const brandStyle=(b:BrandIdentity['branding']):CSSProperties=>({'--clinic-primary':b?.primaryColor??'#7854D9','--clinic-secondary':b?.secondaryColor??'#F6F8FC','--clinic-accent':b?.accentColor??b?.primaryColor??'#7854D9',fontFamily:fontFamilies[b?.typography??'TAJAWAL']??fontFamilies.TAJAWAL} as CSSProperties);
export function useDocumentIdentity(identity:BrandIdentity|null){
  useEffect(()=>{
    if(!identity)return;const original=document.title;document.title=`${identity.displayName} | لمسة`;
    let icon:HTMLLinkElement|undefined;
    if(identity.branding?.faviconUrl){icon=document.createElement('link');icon.rel='icon';icon.id='clinic-brand-favicon';icon.href=identity.branding.faviconUrl;document.head.append(icon);}
    return()=>{document.title=original;icon?.remove();};
  },[identity?.displayName,identity?.branding?.faviconUrl]);
}
export function readableColors(primary:string,secondary:string,accent:string|null){
  if(![primary,secondary,...(accent?[accent]:[])].every(v=>/^#[0-9a-f]{6}$/i.test(v)))return false;
  const lum=(h:string)=>{const a=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const contrast=(a:string,b:string)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  return contrast(primary,'#FFFFFF')>=4.5&&contrast(secondary,'#17243B')>=4.5&&(!accent||Math.max(contrast(accent,'#FFFFFF'),contrast(accent,'#17243B'))>=4.5);
}
