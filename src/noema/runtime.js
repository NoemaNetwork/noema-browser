// SPDX-License-Identifier: GPL-3.0-or-later
import { APP_ORIGIN } from './config.js';
import { workspacePath, parseTask, taskView } from './workspace.js';
let workspaceDriver;
let taskStarting = false;
export function registerWorkspaceDriver(driver) { workspaceDriver = driver; }
export const TOOL_NAMES = new Set(['get_accessibility_tree', 'click_ax', 'set_checked', 'type_ax', 'set_field', 'inspect_viewport', 'read_page',
    'click', 'type_text', 'press_keys', 'scroll', 'navigate', 'extract_data', 'wait_for_element', 'get_selection', 'find_text', 'done', 'clarify',
    'scratchpad_write', 'progress_update', 'progress_read']);
const localTools = new Set(['done', 'clarify', 'scratchpad_write', 'progress_update', 'progress_read']);
const pending = new Map();
let observation;
const frameSignature = frames => JSON.stringify((frames || []).map(f => [f.frameId, f.documentId, f.url]).sort((a,b) => a[0]-b[0]));
const mutatingTools = new Set(['click', 'click_ax', 'set_checked', 'set_field', 'type_ax', 'type_text', 'press_keys']);
const CONTENT = ['src/content/rich-text-toolbar-heuristic.js', 'src/content/accessibility-tree.js', 'src/content/teacher-capture.js',
    'src/content/chat-observation.js', 'src/content/content.js', 'src/content/agent-visual-indicator.js'];
const ownPage = sender => sender.id === chrome.runtime.id && String(sender.url || '').split(/[?#]/)[0] === chrome.runtime.getURL('src/ui/sidepanel.html');
const validId = v => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
async function saved() { return (await chrome.storage.session.get('noemaPair')).noemaPair; }
export async function pairState() {
    const pair = await saved();
    if (!pair?.ready || pair.expiresAt <= Date.now())
        return null;
    try {
        const tab = await chrome.tabs.get(pair.tabId);
        if (pair.documentId) {
            const frame = await chrome.webNavigation.getFrame({tabId:pair.tabId,frameId:0});
            if (frame?.documentId !== pair.documentId) return null;
        }
        return new URL(tab.url).origin === APP_ORIGIN && workspacePath(new URL(tab.url).pathname) ? pair : null;
    }
    catch {
        return null;
    }
}
async function revoke() {
    const task = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
    // Invalidate authority before awaiting shutdown, even if cleanup fails.
    await chrome.storage.session.remove(['noemaWorkspaceTask', 'noemaWorkspaceIds', 'noemaPair', 'noemaTaskTab']);
    await chrome.alarms?.clear('noema-pair-expiry');
    observation = undefined;
    for (const p of pending.values())
        p.reject(Error('Noema disconnected. Reconnect before continuing.'));
    pending.clear();
    if (task) await workspaceDriver?.clear?.(task.tabId);
}
export async function bridgeRequest(type, payload, signal) {
    signal?.throwIfAborted();
    const pair = await pairState();
    if (!pair)
        throw Error('Connect Noema and leave its browser-session tab open.');
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); };
        const abort = () => { cleanup(); void chrome.tabs.sendMessage(pair.tabId, { target: 'noema-app', type: 'cancel', pairId: pair.id, id }).catch(() => { }); reject(Error('Stopped by user.')); };
        const timer = setTimeout(abort, 90000);
        pending.set(id, { pairId: pair.id, resolve: v => { cleanup(); resolve(v); }, reject: e => { cleanup(); reject(e); } });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) {
            abort();
            return;
        }
        chrome.tabs.sendMessage(pair.tabId, { target: 'noema-app', type, pairId: pair.id, id, ...payload }).catch(() => { cleanup(); reject(Error('Noema is unavailable. Reconnect before continuing.')); });
    });
}
export async function assertSite(tabId, url) {
    const tab = await chrome.tabs.get(tabId), target = new URL(url || tab.url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.origin === APP_ORIGIN)
        throw Error('This page cannot be controlled by the browser agent.');
    if (!await chrome.permissions.contains({ origins: [target.origin + '/*'] }))
        throw Error('Allow this site in the Noema extension before continuing.');
    return { tab, url: target.href, origin: target.origin };
}
export async function assertObservation() {
    if (!await pairState())
        throw Error('Noema disconnected.');
    const { noemaTaskTab: tabId } = await chrome.storage.session.get('noemaTaskTab');
    const site = await assertSite(tabId), frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames || []) {
        if (frame.url === 'about:blank' || frame.url === 'about:srcdoc')
            continue;
        await assertSite(tabId, frame.url);
    }
    observation = { tabId, url: site.url, documentId: frames?.find(f => f.frameId === 0)?.documentId, frames: frameSignature(frames) };
    return site;
}
export async function startTask(tabId, requestId) {
    const pair = await pairState();
    if (!pair)
        throw Error('Connect Noema before starting a task.');
    const task = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
    if (pair.workspace && (!task || task.tabId !== tabId || task.id !== requestId))
        throw Error('Start browser tasks from your Noema conversation.');
    await chrome.storage.session.set({ noemaTaskTab: tabId });
    const site = await assertObservation();
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT });
    return site;
}
export async function resetApprovals(tabId) {
    const pair = await pairState(), task = (await chrome.storage.session.get('noemaTaskTab')).noemaTaskTab;
    if (pair && task === tabId)
        await chrome.tabs.sendMessage(pair.tabId, { target: 'noema-app', type: 'reset-approvals', pairId: pair.id }).catch(() => {});
}
export async function requestPermission(tabId, permission, signal) {
    signal?.throwIfAborted();
    const pair = await pairState(), task = (await chrome.storage.session.get('noemaTaskTab')).noemaTaskTab;
    if (!pair || task !== tabId) throw Error('This task is not connected to Noema.');
    const site = await assertSite(tabId);
    await assertSite(tabId, permission.url);
    if (permission.kind !== 'action' || permission.capability !== 'navigate') {
        if (new URL(permission.url).origin !== site.origin) throw Error('Read the destination page before approving this action.');
    }
    const signature = async () => JSON.stringify((await chrome.webNavigation.getAllFrames({ tabId }) || [])
        .map(frame => [frame.frameId, frame.documentId, frame.url]).sort((a, b) => a[0] - b[0]));
    const before = await signature();
    const result = await bridgeRequest('permission', { permission }, signal);
    signal?.throwIfAborted();
    const current = await assertSite(tabId);
    await assertSite(tabId, permission.url);
    if ((await pairState())?.id !== pair.id || current.url !== site.url || await signature() !== before)
        throw Error('The page or session changed while reviewing this action. Read it again.');
    if (result?.allowed !== true) throw Error('Browser action denied.');
    return 'once';
}
export async function beforeAction(tabId, name, args, signal) {
    if (!TOOL_NAMES.has(name))
        throw Error('This tool is not connected to Noema.');
    if (!await pairState())
        throw Error('Noema disconnected.');
    if (localTools.has(name))
        return args;
    const site = await assertSite(tabId);
    if (mutatingTools.has(name)) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        for(const frame of frames||[])if(!['about:blank','about:srcdoc'].includes(frame.url))await assertSite(tabId,frame.url);
        if (!observation || observation.tabId !== tabId || observation.url !== site.url || observation.documentId !== frames?.find(f => f.frameId === 0)?.documentId || observation.frames !== frameSignature(frames))
            throw Error('The page changed. Read it again before acting.');
    }
    // Navigating replaces the document. Upstream content scripts guard against
    // duplicate installation, so restore them before each permitted page action.
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT });
    if (name === 'navigate' && !String(args.url).includes('⟦'))
        await assertSite(tabId, args.url);
    if (JSON.stringify(args).includes('⟦')) {
        const result = await bridgeRequest('restore', { name, args, url: site.url }, signal);
        const current = await assertSite(tabId);
        if (!await pairState() || current.url !== site.url || frameSignature(await chrome.webNavigation.getAllFrames({tabId})) !== observation?.frames)
            throw Error('The page changed while reviewing this action. Try again.');
        if (!result?.args)
            throw Error('Protected action was not approved.');
        if (name === 'navigate') await assertSite(tabId, result.args.url);
        return result.args;
    }
    return args;
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.target !== 'noema-bridge' && msg?.target !== 'noema-control')
        return;
    void (async () => {
        if (msg.target === 'noema-control') {
            if (!ownPage(sender))
                throw Error('Open the extension controls.');
            if (msg.type === 'status') {
                const pair = await pairState();
                const task = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
                const view = pair && task && workspaceDriver ? taskView(task, await workspaceDriver.state(task)) : undefined;
                return { connected: !!pair, expiresAt: pair?.expiresAt, running: view?.status === 'running' };
            }
            if (msg.type === 'stop') {
                const task = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
                if (task) await workspaceDriver?.stop(task.tabId);
                return { ok: true };
            }
            if (msg.type === 'disconnect') {
                const pair = await saved();
                if (pair)
                    await chrome.tabs.sendMessage(pair.tabId, { target: 'noema-app', type: 'disconnect', pairId: pair.id }).catch(() => { });
                await revoke();
                return { ok: true };
            }
            if (msg.type === 'connect') {
                await revoke();
                const id = crypto.randomUUID(), tab = await chrome.tabs.create({ url: APP_ORIGIN + '/browser#pair=' + id });
                await chrome.storage.session.set({ noemaPair: { id, tabId: tab.id, expiresAt: Date.now() + 300000, ready: false } });
                return { ok: true };
            }
            throw Error('Unsupported control.');
        }
        const fromApp = sender.id === chrome.runtime.id && sender.tab?.id && sender.frameId === 0 &&
            sender.origin === APP_ORIGIN && new URL(sender.url).origin === APP_ORIGIN && workspacePath(new URL(sender.url).pathname);
        if (!fromApp) throw Error('Open Noema in a top-level tab.');
        if (msg.type === 'workspace-hello') return { installed: true };
        if (msg.type === 'workspace-connect') {
            const existing = await pairState();
            if (existing && existing.tabId !== sender.tab.id) throw Error('Disconnect the other Noema tab first.');
            await revoke();
            const id = crypto.randomUUID();
            await chrome.storage.session.set({ noemaPair: { id, tabId: sender.tab.id, documentId: sender.documentId,
                expiresAt: Date.now() + 300000, ready: false, workspace: true } });
            return { pairId: id };
        }
        const pair = await saved();
        if (sender.id !== chrome.runtime.id || !pair || sender.tab?.id !== pair.tabId || sender.frameId !== 0 || sender.origin !== APP_ORIGIN ||
            !workspacePath(new URL(sender.url).pathname) || (pair.documentId && sender.documentId !== pair.documentId) || pair.expiresAt <= Date.now())
            throw Error('Pairing expired.');
        if (msg.type === 'hello')
            return { pairId: pair.id, extensionId: chrome.runtime.id, connected: pair.ready };
        if (msg.pairId !== pair.id)
            throw Error('Invalid pairing.');
        if (msg.type === 'workspace-tabs') {
            if (!pair.ready) throw Error('Connect Noema first.');
            const choices = [];
            for (const tab of await chrome.tabs.query({ windowId: sender.tab.windowId })) {
                try { const site = await assertSite(tab.id); choices.push({ id: tab.id, origin: site.origin, title: String(tab.title || site.origin).slice(0, 160) }); } catch {}
            }
            return { tabs: choices };
        }
        if (msg.type === 'workspace-start') {
            if (!pair.ready || !workspaceDriver || taskStarting) throw Error('A browser task is already starting.');
            const input = parseTask(msg.task);
            taskStarting = true;
            try {
                const used = (await chrome.storage.session.get('noemaWorkspaceIds')).noemaWorkspaceIds || [];
                if (used.includes(input.id) || used.length >= 100) throw Error('This task was already submitted or the session task limit was reached.');
                const previous = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
                if (previous) {
                    if (previous.id === input.id) throw Error('This task was already submitted. Check its result.');
                    const view = taskView(previous, await workspaceDriver.state(previous));
                    if (view.status === 'running') throw Error('Stop the current task before starting another.');
                    await workspaceDriver.clear?.(previous.tabId);
                }
                await assertSite(input.tabId);
                const task = { id: input.id, tabId: input.tabId, pairId: pair.id };
                // Persist identity before dispatch. An uncertain start is never replayed.
                await chrome.storage.session.set({ noemaWorkspaceTask: task, noemaWorkspaceIds: [...used, input.id] });
                await workspaceDriver.start(input);
                return { accepted: true, id: input.id };
            } finally { taskStarting = false; }
        }
        if (['workspace-state', 'workspace-stop', 'workspace-answer', 'workspace-finish'].includes(msg.type)) {
            const task = (await chrome.storage.session.get('noemaWorkspaceTask')).noemaWorkspaceTask;
            if (!task || task.pairId !== pair.id || task.id !== msg.taskId || !workspaceDriver) throw Error('No matching browser task.');
            if (msg.type === 'workspace-stop') { await workspaceDriver.stop(task.tabId); return { ok: true }; }
            if (msg.type === 'workspace-finish') {
                await workspaceDriver.clear?.(task.tabId);
                await chrome.storage.session.remove('noemaWorkspaceTask');
                return { ok: true };
            }
            if (msg.type === 'workspace-answer') {
                if (typeof msg.questionId !== 'string' || msg.questionId.length > 150 || typeof msg.answer !== 'string' || !msg.answer.trim() || msg.answer.length > 4000) throw Error('Invalid answer.');
                const current = taskView(task, await workspaceDriver.state(task));
                if (!current.question || current.question.id !== msg.questionId) throw Error('That question is no longer waiting for an answer.');
                return workspaceDriver.answer(task.tabId, current.question, msg.answer);
            }
            return taskView(task, await workspaceDriver.state(task));
        }
        if (msg.type === 'paired' || msg.type === 'workspace-pair') {
            if (typeof msg.expiresAt !== 'number' || msg.expiresAt <= Date.now() || msg.expiresAt > Date.now() + 901000)
                throw Error('Invalid expiry.');
            await chrome.storage.session.set({ noemaPair: { ...pair, ready: true, expiresAt: msg.expiresAt } });
            await chrome.alarms?.create('noema-pair-expiry', { when: msg.expiresAt });
            return { ok: true };
        }
        if (msg.type === 'disconnect') {
            await revoke();
            return { ok: true };
        }
        if (msg.type === 'result' && validId(msg.id)) {
            const request = pending.get(msg.id);
            if (request?.pairId === pair.id) {
                if (msg.error)
                    request.reject(Error(String(msg.error).slice(0, 250)));
                else
                    request.resolve(msg.result);
            }
            return { ok: true };
        }
        throw Error('Unsupported bridge message.');
    })().then(reply).catch(error => reply({ error: String(error?.message || 'Noema pairing is unavailable.').slice(0, 250) }));
    return true;
});
chrome.tabs.onRemoved.addListener(tabId => { void saved().then(pair => { if (pair?.tabId === tabId)
    return revoke(); }); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url)
        void saved().then(pair => {
            if (pair?.tabId === tabId && (new URL(change.url).origin !== APP_ORIGIN || !workspacePath(new URL(change.url).pathname)))
                return revoke();
        });
});
chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm.name === 'noema-pair-expiry') void revoke();
});
