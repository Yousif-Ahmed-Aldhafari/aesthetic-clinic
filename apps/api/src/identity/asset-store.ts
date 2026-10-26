import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Environment } from '../config/environment.js';

// A future object-storage adapter must retain immutable keys, private drafts,
// authorized reads/publication and the same retention policy.
export abstract class AssetStore {
  abstract put(key:string,bytes:Buffer):Promise<void>;
  abstract read(key:string):Promise<Buffer>;
  abstract remove(key:string):Promise<void>;
}
@Injectable()
export class LocalAssetStore extends AssetStore {
  constructor(private readonly config:ConfigService<Environment,true>){super();}
  private async path(key:string,create=false){
    if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png)$/.test(key))throw new NotFoundException();
    const configured=this.config.get('ASSET_STORAGE_DIR',{infer:true});
    if(this.config.get('NODE_ENV',{infer:true})==='production'&&!configured)throw new ServiceUnavailableException();
    const root=configured??resolve(import.meta.dirname,'../../../../var/clinic-assets');
    const file=resolve(root,key),folder=dirname(file);
    if(create){await mkdir(root,{recursive:true,mode:0o700});await mkdir(folder,{recursive:true,mode:0o700});}
    if((await lstat(root)).isSymbolicLink()||(await lstat(folder)).isSymbolicLink())throw new ServiceUnavailableException();
    return file;
  }
  async put(key:string,bytes:Buffer){const path=await this.path(key,true);const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);}finally{await file.close();}}
  async read(key:string){try{const file=await open(await this.path(key),constants.O_RDONLY|constants.O_NOFOLLOW);try{return await file.readFile();}finally{await file.close();}}catch{throw new NotFoundException();}}
  async remove(key:string){try{await unlink(await this.path(key));}catch(e){if((e as{code?:string}).code!=='ENOENT')throw e;}}
}
