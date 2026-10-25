// Every asynchronous read/write must pass this gate before updating visible data.
// Abort saves work; the generation check also handles an already-completed response.
export class RequestScope {
  private generation=0;
  private controller:AbortController|null=null;
  cancel(){this.generation++;this.controller?.abort();this.controller=null;}
  start(){
    this.cancel();const generation=this.generation;
    const controller=new AbortController();this.controller=controller;
    return {signal:controller.signal,current:()=>this.generation===generation&&!controller.signal.aborted};
  }
}
