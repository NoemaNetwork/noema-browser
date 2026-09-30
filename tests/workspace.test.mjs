import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspacePath,parseTask,taskView} from '../src/noema/workspace.js';
test('workspace task protocol bounds content and excludes inherited flags',()=>{
 const task={id:crypto.randomUUID(),tabId:4,text:'Compare the options'};
 assert.deepEqual(parseTask(task),task);
 for(const bad of [{...task,text:''},{...task,text:'x'.repeat(16001)},{...task,tabId:-1},{...task,id:'bad'},{...task,mode:'dev'}]) assert.throws(()=>parseTask(bad));
 assert(workspacePath('/c/new'));assert(!workspacePath('/api/browser/chat'));assert(!workspacePath('/artifact/frame'));
});
test('restarted workers never claim a task is still running or automatically replay it',()=>{
 const task={id:'task'};
 assert.equal(taskView(task,{runUi:{requestId:'task',status:'running'},running:false}).status,'interrupted');
 assert.equal(taskView(task,{starting:true}).status,'running');
 assert.equal(taskView(task,{runUi:{requestId:'different',status:'completed'}}).status,'interrupted');
});
test('task results distinguish engine completion from verified success and omit raw page events',()=>{
 const task={id:'task'},runUi={requestId:'task',status:'completed',finalContent:'Please check this.',events:[{type:'tool_result',data:{secret:'should not be in progress'}},{type:'tool_call',data:{name:'read_page'}}]};
 const view=taskView(task,{runUi});assert.equal(view.status,'attention');assert(!JSON.stringify(view).includes('secret'));
 assert.equal(taskView(task,{runUi:{...runUi,successfulDone:true}}).status,'completed');
});
test('clarifications and plan reviews reach chat with bounded explicit options',()=>{
 const task={id:'task'},state={running:true,runUi:{requestId:'task',status:'running'},pendingQuestion:{clarifyId:'q',question:'Which date?',options:['Today','Tomorrow']}};
 assert.deepEqual(taskView(task,state).question,{id:'q',kind:'clarify',text:'Which date?',options:['Today','Tomorrow']});
 const plan=taskView(task,{...state,pendingQuestion:undefined,pendingPlan:{planId:'p',markdown:'Review the plan'}}).question;
 assert.equal(plan.kind,'plan');assert.deepEqual(plan.options,['Approve plan','Reject plan']);
 assert.equal(taskView(task,{...state,runUi:{requestId:'task',status:'stopped'}}).question,undefined);
});
