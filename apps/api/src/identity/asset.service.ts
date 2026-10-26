import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AssetStore } from './asset-store.js';
import { IdentityError } from './identity-error.js';
import { ClinicAdministrationRepository } from '../prisma/clinic-administration.repository.js';
import type { VerifiedPrincipal } from '../prisma/verified-sessions.js';
export type ImageUpload={buffer:Buffer;mimetype:string;size:number};
export async function encodeImage(file:ImageUpload|undefined,purpose:'LOGO'|'FAVICON'){
  if(!file||!Buffer.isBuffer(file.buffer)||file.buffer.length===0||file.buffer.length>2097152)throw new IdentityError('ASSET_INVALID');
  const b=file.buffer;
  const format=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':b[0]===255&&b[1]===216&&b[2]===255?'jpeg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;
  if(!format||file.mimetype!==({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}as const)[format])throw new IdentityError('ASSET_INVALID');
  try{
    const image=sharp(b,{limitInputPixels:4096*4096,failOn:'warning',animated:false});const m=await image.metadata();
    if(m.format!==format||!m.width||!m.height||m.width<16||m.height<16||m.width>4096||m.height>4096||(m.pages??1)>1)throw new Error();
    const size=purpose==='FAVICON'?128:1024;
    const pipeline=image.rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true});
    const {data,info}=await (purpose==='FAVICON'?pipeline.png():pipeline.webp({quality:90})).toBuffer({resolveWithObject:true});
    if(data.length>2097152)throw new Error();
    return{bytes:data,width:info.width,height:info.height,mimeType:purpose==='FAVICON'?'image/png':'image/webp',sha256:createHash('sha256').update(data).digest('hex')};
  }catch{throw new IdentityError('ASSET_INVALID');}
}
@Injectable()
export class AssetService {
  constructor(private readonly store:AssetStore,private readonly repository:ClinicAdministrationRepository){}
  async upload(proof:VerifiedPrincipal,clinicId:string,purpose:'LOGO'|'FAVICON',file:ImageUpload|undefined){
    const image=await encodeImage(file,purpose),id=randomUUID(),key=`${clinicId}/${id}.${purpose==='FAVICON'?'png':'webp'}`;
    await this.store.put(key,image.bytes);
    try{return await this.repository.assetCreate(proof,clinicId,{id,purpose,storageKey:key,mimeType:image.mimeType,byteSize:image.bytes.length,width:image.width,height:image.height,sha256:image.sha256});}
    catch(e){await this.store.remove(key);throw e;}
  }
  async cleanup(proof:VerifiedPrincipal,clinicId:string){const rows=await this.repository.cleanup(proof,clinicId);let removed=0;for(const row of rows){try{await this.store.remove(row.storageKey);removed++;}catch{/* An orphaned private file needs maintenance retry; never republish it. */}}return{removed,orphanedFiles:rows.length-removed};}
}
