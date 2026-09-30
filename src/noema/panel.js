// SPDX-License-Identifier: GPL-3.0-or-later
import { APP_ORIGIN } from './config.js';
const byId = id => document.getElementById(id);
const call = async type => {
  const result = await chrome.runtime.sendMessage({target:'noema-control',type});
  if (result?.error) throw Error(result.error);
  return result;
};
const attempt = async action => {
  byId('error').textContent = '';
  try { await action(); await refresh(); }
  catch (error) { byId('error').textContent = error.message || 'Could not complete this action.'; }
};
let currentOrigin = '';
async function refresh() {
  const state = await call('status');
  byId('connection').textContent = state.connected ? (state.running ? 'A browser task is running. Review it in Noema.' : 'Connected. Start your next task in Noema chat.') : 'Connect from Browser tasks in your Noema chat.';
  byId('stop').hidden = !state.running;
  byId('disconnect').hidden = !state.connected;
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  const url = tab?.url ? new URL(tab.url) : null;
  currentOrigin = url && ['https:','http:'].includes(url.protocol) && url.origin !== APP_ORIGIN ? url.origin : '';
  byId('current-site').textContent = currentOrigin || 'Open the site you want Noema to use.';
  byId('allow').disabled = !currentOrigin;
  const permissions = await chrome.permissions.getAll();
  const origins = (permissions.origins || []).filter(origin => !origin.startsWith(APP_ORIGIN+'/'));
  const nodes = origins.map(origin => {
    const row = document.createElement('li'), name = document.createElement('span'), button = document.createElement('button');
    name.textContent = origin.replace(/\/\*$/, ''); button.textContent = 'Remove';
    button.setAttribute('aria-label', 'Remove access to '+name.textContent);
    button.onclick = () => void attempt(async () => { await chrome.permissions.remove({origins:[origin]}); });
    row.append(name,button);return row;
  });
  byId('sites').replaceChildren(...nodes);
}
byId('open').onclick = () => void attempt(async () => {
  const existing = (await chrome.tabs.query({url:APP_ORIGIN+'/*'})).find(tab => tab.url && /^\/c\//.test(new URL(tab.url).pathname));
  if (existing) { await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true}); }
  else await chrome.tabs.create({url:APP_ORIGIN+'/c/new'});
});
byId('allow').onclick = () => {
  if (!currentOrigin) return;
  // Keep the native request directly in the user's click gesture.
  const request = chrome.permissions.request({origins:[currentOrigin+'/*']});
  void attempt(async () => { if (!await request) throw Error('Site access was not granted.'); });
};
byId('stop').onclick = () => void attempt(() => call('stop'));
byId('disconnect').onclick = () => void attempt(() => call('disconnect'));
const update = () => void refresh().catch(error => { byId('error').textContent = error.message; });
chrome.tabs.onActivated.addListener(update);
chrome.tabs.onUpdated.addListener((id,change) => {if(change.url)update();});
chrome.storage.onChanged.addListener((changes,area) => {if(area==='session'&&(changes.noemaPair||changes.noemaWorkspaceTask))update();});
chrome.permissions.onRemoved.addListener(update);
window.addEventListener('focus',update);
update();
