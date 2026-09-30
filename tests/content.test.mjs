import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/noema/content.js',import.meta.url),'utf8');
function world(sendMessage){
  let listener;const output=[],removed=[];
  const window={addEventListener:(type,fn)=>{listener=fn;},removeEventListener:(type,fn)=>removed.push(fn),postMessage:message=>output.push(message)};
  window.top=window;
  const context={window,location:{pathname:'/browser',origin:'https://app.test'},chrome:{runtime:{id:'extension',sendMessage,onMessage:{addListener:()=>{}}}}};
  vm.runInNewContext(source,context);
  return {context,output,removed,send:()=>listener({source:window,origin:'https://app.test',data:{source:'noema-app',type:'hello'}})};
}
test('an invalidated extension context stops its old listener without throwing',async()=>{
  const state=world(()=>{throw Error('Extension context invalidated.');});
  await assert.doesNotReject(state.send());assert.equal(state.removed.length,1);assert.equal(state.output.length,0);
});
test('a transient worker failure preserves the listener for a later hello',async()=>{
  let attempt=0;const state=world(async()=>{if(!attempt++)throw Error('Receiving end does not exist.');return {pairId:'pair'};});
  await state.send();await state.send();assert.equal(state.removed.length,0);assert.equal(state.output[0].pairId,'pair');
});
