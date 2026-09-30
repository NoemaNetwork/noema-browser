// SPDX-License-Identifier: GPL-3.0-or-later
// This script exists only on the configured Noema bridge page.
if (window === window.top) {
    const forward = async event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'noema-app')
            return;
        try {
            if (!chrome.runtime?.id) {
                window.removeEventListener('message', forward);
                return;
            }
            const result = await chrome.runtime.sendMessage({ ...event.data, target: 'noema-bridge' });
            if (event.data.type.startsWith('workspace-'))
                window.postMessage({ source: 'noema-extension', type: 'workspace-result', commandId: event.data.commandId, result }, location.origin);
            if (event.data.type === 'hello')
                window.postMessage({ source: 'noema-extension', type: 'hello', ...result }, location.origin);
            if (event.data.type === 'paired')
                window.postMessage({ source: 'noema-extension', type: 'paired-ack', pairId: event.data.pairId, ...result }, location.origin);
        } catch (error) {
            // Reloading/uninstalling invalidates existing content-script worlds.
            // Stop their heartbeat listener; a refreshed page gets a new bridge.
            if (!chrome.runtime?.id || String(error).includes('Extension context invalidated'))
                window.removeEventListener('message', forward);
        }
    };
    window.addEventListener('message', forward);
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
        if (sender.id !== chrome.runtime.id || message?.target !== 'noema-app')
            return;
        window.postMessage({ ...message, source: 'noema-extension' }, location.origin);
        reply({ received: true });
    });
}
