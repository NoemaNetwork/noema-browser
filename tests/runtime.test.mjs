import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const messages=[],removed=[],updated=[];let store,tabs,origins,frames,injected,deliver;
const app='https://app.noemanetwork.xyz',fixture='https://allowed.example',id='fixture-extension';
globalThis.chrome={runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p,onMessage:{addListener:f=>messages.push(f)}},
 storage:{session:{get:async key=>typeof key==='string'?{[key]:store[key]}:Object.fromEntries(key.map(k=>[k,store[k]])),set:async values=>Object.assign(store,values),remove:async keys=>{for(const k of typeof keys==='string'?[keys]:keys)delete store[k];}}},
 tabs:{query:async()=>Object.entries(tabs).map(([id,t])=>({...t,id:Number(id)})),get:async n=>{if(!tabs[n])throw Error();return tabs[n];},sendMessage:async(...args)=>deliver?.(...args),onRemoved:{addListener:f=>removed.push(f)},onUpdated:{addListener:f=>updated.push(f)}},
 permissions:{contains:async({origins:wanted})=>wanted.every(x=>origins.has(x))},webNavigation:{getAllFrames:async()=>frames,getFrame:async({tabId})=>({documentId:tabs[tabId]?.documentId||'app-document'})},scripting:{executeScript:async()=>{injected++;}}};
// Browser APIs are mocked; no network calls are made.
const runtime=await import('../src/noema/runtime.js');
beforeEach(()=>{store={noemaPair:{id:'pair',tabId:1,ready:true,expiresAt:Date.now()+60000},noemaTaskTab:2};tabs={1:{url:app+'/browser'},2:{url:fixture+'/form'}};origins=new Set([fixture+'/*']);frames=[{frameId:0,url:fixture+'/form',documentId:'original'}];injected=0;deliver=undefined;});
test('site and embedded-frame scope is required before cloud observation',async()=>{await runtime.assertObservation();frames.push({frameId:1,url:'https://private.other/frame',documentId:'other'});await assert.rejects(runtime.assertObservation(),/Allow this site/);origins.add('https://private.other/*');await runtime.assertObservation();});
test('unsupported tools and ungranted navigation fail before injection or dispatch',async()=>{await assert.rejects(runtime.beforeAction(2,'execute_js',{code:'fetch("https://bad.test")'}),/not connected/);await assert.rejects(runtime.beforeAction(2,'navigate',{url:'https://bad.test'}),/Allow this site/);});
test('mutations are bound to the observed document, even when its URL is unchanged',async()=>{await runtime.assertObservation();assert.deepEqual(await runtime.beforeAction(2,'set_field',{ref_id:'ref_1',text:'hello'}),{ref_id:'ref_1',text:'hello'});frames[0].documentId='replacement';await assert.rejects(runtime.beforeAction(2,'set_field',{ref_id:'ref_1',text:'hello'}),/page changed/);});
test('revoked site access or disconnected app prevents further actions',async()=>{await runtime.assertObservation();origins.clear();await assert.rejects(runtime.beforeAction(2,'click_ax',{ref_id:'ref_1'}),/Allow this site/);tabs[1].url='https://elsewhere.test/';assert.equal(await runtime.pairState(),null);await assert.rejects(runtime.beforeAction(2,'done',{}),/disconnected/);});
test('bridge messages from another tab or embedded frame cannot complete pairing',async()=>{
 const message=(sender)=>new Promise(resolve=>messages[0]({target:'noema-bridge',type:'hello'},sender,resolve));
 const valid={id,tab:{id:1},frameId:0,origin:app,url:app+'/browser'};
 assert.equal((await message(valid)).pairId,'pair');assert((await message({...valid,frameId:2})).error);assert((await message({...valid,tab:{id:2}})).error);
});
const permission={kind:'action',capability:'type',url:fixture+'/form',summary:'Type into fields.'};
function answerPermission(change=()=>{},result={allowed:true}){
 deliver=async(tabId,message)=>{
  assert.equal(tabId,1);assert.equal(message.type,'permission');change();
  await new Promise(resolve=>messages[0]({target:'noema-bridge',type:'result',pairId:'pair',id:message.id,result},
   {id,tab:{id:1},frameId:0,origin:app,url:app+'/browser'},resolve));
 };
}
test('permission approval is delivered through the paired app and stops on document or grant changes',async()=>{
 answerPermission();assert.equal(await runtime.requestPermission(2,permission,new AbortController().signal),'once');
 answerPermission(()=>{frames[0].documentId='replaced';});await assert.rejects(runtime.requestPermission(2,permission),/page or session changed/);
 answerPermission(()=>origins.clear());await assert.rejects(runtime.requestPermission(2,permission),/Allow this site/);
});
test('permission approval cannot move to another tab, origin, port or expired pair',async()=>{
 answerPermission();await assert.rejects(runtime.requestPermission(3,permission),/not connected/);
 await assert.rejects(runtime.requestPermission(2,{...permission,url:fixture+':8443/form'}),/Allow this site/);
 origins.add('https://other.test/*');await assert.rejects(runtime.requestPermission(2,{...permission,url:'https://other.test/form'}),/destination page/);
 store.noemaPair.expiresAt=Date.now()-1;await assert.rejects(runtime.requestPermission(2,permission),/not connected/);
});
test('upstream permanent and whole-turn permission grants cannot bypass Noema review',async()=>{
 const {PermissionManager}=await import('../src/agent/permission-gate.js');
 const p=new PermissionManager({load:async()=>[{host:'allowed.example',capability:'click',action:'allow'}],skipAll:()=>true});
 await p.hydrate();await p.record('allowed.example','click','allow','always',2);
 assert.deepEqual(p.check('allowed.example','click',2),{allowed:false,needsPrompt:true});
 p.hydrateFrom([{host:'allowed.example',capability:'type',action:'allow'}]);await p.record('allowed.example','type','allow','once',2);
 assert.deepEqual(p.check('allowed.example','type',2),{allowed:false,needsPrompt:true});
});

const appSender=()=>({id,tab:{id:1},frameId:0,origin:app,url:app+'/c/new',documentId:'app-document'});
const sendApp=(type,extra={})=>new Promise(resolve=>messages[0]({target:'noema-bridge',type,pairId:store.noemaPair?.id,...extra},appSender(),resolve));
test('chat pairing is bound to its exact document and top-level Noema tab',async()=>{
 tabs[1].url=app+'/c/new';
 assert.equal((await sendApp('workspace-hello')).installed,true);
 const pair=await sendApp('workspace-connect');assert(pair.pairId);
 assert.equal((await sendApp('workspace-pair',{expiresAt:Date.now()+60000})).ok,true);
 store.noemaPair.documentId='other-document';assert((await sendApp('workspace-tabs')).error);
});
test('workspace lists only permitted sites and cannot pass arbitrary engine commands',async()=>{
 tabs[1].url=app+'/c/new'; tabs[3]={url:'https://unpermitted.test/'};
 assert.deepEqual((await sendApp('workspace-tabs')).tabs.map(t=>t.id),[2]);
 let calls=0;runtime.registerWorkspaceDriver({start:async()=>{calls++;},state:async()=>({}),stop:async()=>{}});
 const task={id:crypto.randomUUID(),tabId:2,text:'Read this page'};
 assert((await sendApp('workspace-start',{task:{...task,apiMutationsAllowed:true}})).error);
 assert((await sendApp('workspace-start',{task:{...task,tabId:3}})).error);assert.equal(calls,0);
 assert.equal((await sendApp('workspace-start',{task})).accepted,true);assert.equal(calls,1);
 assert((await sendApp('workspace-start',{task})).error);assert.equal(calls,1);
 assert((await sendApp('workspace-stop',{taskId:crypto.randomUUID()})).error);
});
test('iframe document replacement is detected even when top-level URL and document stay the same',async()=>{
 frames.push({frameId:1,url:fixture+'/frame',documentId:'frame-one'});await runtime.assertObservation();
 frames[1].documentId='frame-two';await assert.rejects(runtime.beforeAction(2,'click_ax',{ref_id:'x'}),/page changed/);
});
test('chat tasks cannot be replaced by a side-panel start or replayed after cleanup',async()=>{
 tabs[1].url=app+'/c/new';store.noemaPair.workspace=true;
 let clears=0;runtime.registerWorkspaceDriver({start:async()=>{},state:async()=>({}),stop:async()=>{},clear:async()=>{clears++;}});
 const task={id:crypto.randomUUID(),tabId:2,text:'Read this page'};
 assert.equal((await sendApp('workspace-start',{task})).accepted,true);
 await assert.rejects(runtime.startTask(2,crypto.randomUUID()),/Noema conversation/);
 assert.equal((await sendApp('workspace-finish',{taskId:task.id})).ok,true);
 assert.equal(clears,1);assert.equal(store.noemaWorkspaceTask,undefined);
 assert((await sendApp('workspace-start',{task})).error);
});
test('a replaced app document cannot retain authority and failed cleanup cannot retain the pair',async()=>{
 store.noemaPair.documentId='app-document';tabs[1].documentId='replacement';assert.equal(await runtime.pairState(),null);
 delete store.noemaPair.documentId;store.noemaWorkspaceTask={id:'old',tabId:2};
 runtime.registerWorkspaceDriver({clear:async()=>{throw Error('cleanup failed');}});
 assert((await sendApp('disconnect')).error);assert.equal(store.noemaPair,undefined);assert.equal(store.noemaTaskTab,undefined);
});
