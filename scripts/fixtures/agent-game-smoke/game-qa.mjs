
import { startGame } from '@call-me-sensei/toonlab/agents/examples/game-foundation.mjs';
const status=document.querySelector('#status');
window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));
const game=await startGame({canvas:document.querySelector('canvas'),onState:s=>{status.textContent=s.won?'Won — press R to restart':'Ready — collect the orb';}});window.game=game;
const scenario=document.querySelector('#scenario'),stop=document.querySelector('#stop');scenario.disabled=stop.disabled=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,cancelable:true}));
async function move(code,ms){key('keydown',code);await wait(ms);key('keyup',code);await wait(80);}
scenario.onclick=async()=>{scenario.disabled=true;try{
 game.restart();await move('KeyW',670);await move('KeyD',1800);
 const blocked=game.state.player; if(blocked[0]>-1.1||blocked[0]<-2.1) throw Error('Collision probe failed: '+blocked);
 game.restart();await move('KeyW',1650);await move('KeyD',2100);
 if(!game.state.won)throw Error('Objective unreachable: '+game.state.player);
 key('keydown','KeyR');key('keyup','KeyR');await wait(100);
 if(game.state.won || game.state.player[0]!==-3)throw Error('Restart failed');
 key('keydown','KeyD');window.dispatchEvent(new Event('blur'));const before=game.state.player[0];await wait(200);
 if(game.state.player[0]!==before)throw Error('Focus loss left held input');
 document.querySelector('canvas').style.width='720px';window.dispatchEvent(new Event('resize'));await wait(100);
 window.qa={passed:true,blocked,restarted:game.state.player,focusCleared:true,resized:true};status.textContent=JSON.stringify(window.qa,null,2);
 }catch(e){window.qa={passed:false,error:e.message};status.textContent=JSON.stringify(window.qa);}finally{scenario.disabled=false;}};
stop.onclick=async()=>{await game.dispose();await game.dispose();window.qaDisposed=true;stop.disabled=scenario.disabled=true;status.textContent+='\nDisposed twice safely.';};
