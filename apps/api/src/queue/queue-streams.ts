import { HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

// Short transactions poll the authoritative database. Only invalidations cross
// the stream; reconnect always triggers a new authorized REST snapshot.
@Injectable()
export class QueueStreams {
  private readonly counts=new Map<string,number>();
  private total=0;
  async open(request:Request,response:Response,read:()=>Promise<{revision:string}>){
    const initial=await read(); // Reject access before sending event-stream headers.
    if(response.destroyed)return;
    const key=request.ip??'local';
    if(this.total>=100||(this.counts.get(key)??0)>=8)throw new HttpException('Rate limited',429);
    this.total++;this.counts.set(key,(this.counts.get(key)??0)+1);
    response.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    response.flushHeaders();
    let closed=false,timer:NodeJS.Timeout|undefined,last=initial.revision,cycles=0;
    const stop=()=>{if(closed)return;closed=true;if(timer)clearTimeout(timer);this.total--;const n=(this.counts.get(key)??1)-1;if(n)this.counts.set(key,n);else this.counts.delete(key);};
    response.on('close',stop);
    const send=(event:string,data:unknown)=>{if(!closed&&!response.destroyed)response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
    response.write('retry: 3000\n\n');send('resync',initial);
    const poll=async()=>{
      if(closed)return;
      try{
        const state=await read(); // Fresh session, membership and clinic checks.
        if(closed)return;
        if(state.revision!==last){last=state.revision;send('resync',state);}
        if(++cycles%5===0)send('heartbeat',{});
        if(cycles>=450||response.writableLength>65536){send('reconnect',{});stop();response.end();return;}
      }catch(error){
        const ended=error instanceof HttpException&&[401,403,404].includes(error.getStatus());
        send(ended?'access-ended':'reconnect',{});stop();response.end();return;
      }
      timer=setTimeout(()=>{void poll();},2000);timer.unref();
    };
    timer=setTimeout(()=>{void poll();},2000);timer.unref();
  }
}
