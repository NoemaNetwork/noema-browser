// SPDX-License-Identifier: GPL-3.0-or-later
const bar = document.createElement('div');
bar.id = 'noema-controls';
const connect = document.createElement('button'), grant = document.createElement('button'), status = document.createElement('span');
connect.textContent = 'Connect Noema';
grant.textContent = 'Allow this site';
status.setAttribute('role', 'status');
const brand = document.createElement('strong');
brand.className = 'noema-brand';
brand.textContent = 'Noema';
bar.append(brand, connect, grant, status);
document.body.prepend(bar);
const call = type => chrome.runtime.sendMessage({ target: 'noema-control', type });
connect.onclick = async () => {
    if (connect.disabled)
        return;
    connect.disabled = true;
    try {
        const state = await call('status');
        await call(state.connected ? 'disconnect' : 'connect');
        await refresh();
    }
    catch {
        status.textContent = 'Could not connect. Try again.';
    }
    finally {
        connect.disabled = false;
    }
};
grant.onclick = async () => {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true }), tab = tabs[0], url = new URL(tab.url);
        if (!['https:', 'http:'].includes(url.protocol))
            throw Error();
        const allowed = await chrome.permissions.request({ origins: [url.origin + '/*'] });
        status.textContent = allowed ? 'Site allowed' : 'Site access not granted';
    }
    catch {
        status.textContent = 'Open the site you want to use, then try again.';
    }
};
async function refresh() { const state = await call('status'); connect.textContent = state.connected ? 'Disconnect Noema' : 'Connect Noema'; }
void refresh();
window.addEventListener('focus', () => void refresh());
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.noemaPair)
    void refresh(); });
