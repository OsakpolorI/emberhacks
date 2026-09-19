/** Single-flight queue, retaining only the newest pending snapshot. */
export class LatestQueue<T,R> {
 private pending:T|undefined; private running=false; private closed=false; private controller:AbortController|null=null;
 constructor(private work:(item:T,signal:AbortSignal)=>Promise<R>,private accept:(result:R,item:T)=>void,private fail:(error:unknown)=>void){}
 push(item:T){if(this.closed)return;this.pending=item;void this.drain();}
 private async drain(){if(this.running||this.closed)return;this.running=true;try{while(this.pending!==undefined&&!this.closed){const item=this.pending;this.pending=undefined;this.controller=new AbortController();try{const value=await this.work(item,this.controller.signal);if(!this.closed)this.accept(value,item);}catch(e){if(!this.closed)this.fail(e);}}}finally{this.running=false;}}
 close(){this.closed=true;this.pending=undefined;this.controller?.abort();}
}
export class Once { private started=false; run(fn:()=>void){if(this.started)return false;this.started=true;fn();return true;} }
