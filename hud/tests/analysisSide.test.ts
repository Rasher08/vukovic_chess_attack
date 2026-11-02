import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import type {BrowserChessEngine} from '../../src/lib/browserEngine';
import {HudController} from '../core/controller';
const white=new Chess().fen(),board=new Chess();board.move('e4');const black=board.fen();board.move('e5');const whiteNext=board.fen();
const tick=()=>new Promise<void>(r=>setTimeout(r,0));
async function main(){
 let created=0,disposed=0;
 const jobs:{fen:string;signal:AbortSignal;resolve:(v:{brilliant:boolean})=>void}[]=[];
 const hud=new HudController(()=>{created++;return{dispose(){disposed++;}} as BrowserChessEngine;},async(fen,_engine,signal)=>new Promise(resolve=>jobs.push({fen,signal,resolve})),()=>{});
 hud.setSide('white');hud.accept(black);
 assert.equal(created,0);assert.equal(hud.state.status,'opponent');assert(!hud.state.idea,'No opponent signal');
 hud.accept(black);assert.equal(created,0,'Opponent heartbeats never create a worker');
 hud.accept(white);assert.equal(created,1);assert.equal(hud.state.status,'checking');
 hud.accept(black);assert(jobs[0].signal.aborted);assert(disposed>0);assert.equal(hud.state.status,'opponent');
 jobs[0].resolve({brilliant:true});await tick();assert(!hud.state.idea,'Late own-turn verdict cannot survive the opponent move');
 hud.accept(whiteNext);assert.equal(created,2);jobs[1].resolve({brilliant:true});await tick();assert(hud.state.idea);
 hud.setSide('black');assert(!hud.state.idea);hud.accept(whiteNext);assert.equal(created,2);assert.equal(hud.state.status,'opponent');
 hud.accept(black);assert.equal(created,3);jobs[2].resolve({brilliant:false});await tick();assert.equal(hud.state.status,'checked');
 hud.setSide('both');hud.accept(white);assert.equal(created,4);jobs[3].resolve({brilliant:false});await tick();
 hud.accept(black);assert.equal(created,5,'Both-side mode includes the other color');jobs[4].resolve({brilliant:false});await tick();
 hud.accept(null);assert.equal(hud.state.status,'unknown','Lost source is not confused with opponent turn');
 hud.setPaused(true);hud.setSide('white');hud.accept(white);assert.equal(created,5);assert.equal(hud.state.status,'paused');
 hud.dispose();
 console.log('Analysis side PASS: no opponent worker, no opponent hint, white/black/both, cancellation/stale verdicts, policy changes, source loss and pause.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
