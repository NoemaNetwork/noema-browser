// SPDX-License-Identifier: GPL-3.0-or-later
// This adapter exposes a small task protocol, never the upstream message router.
export function workspacePath(path) {
  return path === '/' || path === '/browser' || /^\/(?:c|settings|wallet|account|models|about|images|video|audio|library)(?:\/|$)/.test(path);
}
const terminal = new Set(['completed', 'stopped', 'failed', 'cancelled', 'clarification_required']);
const labels = { get_accessibility_tree: 'Reading the page', read_page: 'Reading the page',
  inspect_viewport: 'Inspecting the page', extract_data: 'Reading details', navigate: 'Opening a page',
  click: 'Using a page control', click_ax: 'Using a page control', type_ax: 'Entering text',
  set_field: 'Updating a field', type_text: 'Entering text', scroll: 'Scrolling the page',
  find_text: 'Finding text', done: 'Checking the result' };
export function taskView(task, state) {
  const run = state?.runUi;
  if (state?.detachedError) {
    const text = String(state.detachedError.message).slice(0, 1000);
    return { id: task.id, status: /^(?:Protected action denied|Browser action denied|Action denied)/.test(text) ? 'cancelled' : 'failed', text };
  }
  if (!run || run.requestId !== task.id) return { id: task.id, status: state?.starting ? 'running' : 'interrupted', text: state?.starting ? 'Starting browser task…' : 'The browser task was interrupted. Check the page before starting again.' };
  if (!state.running && !state.starting && !terminal.has(run.status)) return { id: task.id, status: 'interrupted', text: 'The browser task was interrupted. Check the page before starting again.' };
  const steps = (run.events || []).filter(e => e.type === 'tool_call').slice(-8).map(e => labels[e.data?.name] || 'Working on the page');
  const finished = terminal.has(run.status);
  // A finished loop is not necessarily a successfully completed task.
  const status = run.status === 'completed' && run.successfulDone !== true && run.runSucceeded !== true ? 'attention' : run.status;
  const pending = state.pendingQuestion;
  const question = !finished && pending ? { id: String(pending.clarifyId).slice(0, 150), kind: 'clarify',
    text: String(pending.question || '').slice(0, 4000), options: (pending.options || []).slice(0, 8).map(v => String(v).slice(0, 200)) } :
    !finished && state.pendingPlan ? { id: String(state.pendingPlan.planId).slice(0, 150), kind: 'plan',
      text: String(state.pendingPlan.markdown || 'Review the proposed browser task.').slice(0, 4000), options: ['Approve plan', 'Reject plan'] } : undefined;
  return { id: task.id, status: finished ? status : 'running', steps, ...(question ? { question } : {}),
    text: String(finished ? run.finalContent || (status === 'completed' ? 'Browser task completed.' : 'Check the page before continuing.') : run.streamedText || steps.at(-1) || 'Working in your browser…').slice(0, 30000) };
}
export function parseTask(value) {
  if (!value || !Number.isInteger(value.tabId) || value.tabId < 1 ||
      typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) ||
      typeof value.text !== 'string' || !value.text.trim() || value.text.length > 16000 ||
      Object.keys(value).some(key => !['id', 'tabId', 'text'].includes(key))) throw Error('Invalid browser task.');
  return { id: value.id, tabId: value.tabId, text: value.text };
}
