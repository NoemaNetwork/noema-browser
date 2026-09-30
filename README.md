# Noema browser extension

Use your Noema conversation to work on websites you permit. Read pages, follow
links and fill drafts while keeping progress, questions and action approvals
in the same chat.

[Open Noema](https://app.noemanetwork.xyz) ·
[Browser guide](https://docs.noemanetwork.xyz/automation/browser) ·
[Website](https://noemanetwork.xyz) ·
[Updates](https://x.com/noemanetwork)

## Install

This is a manual-install extension for desktop Chromium browsers with extension
and side-panel support. The manifest requires Chromium 116 or newer. Safari,
Firefox and mobile-browser automation are not supported.

1. Download and extract the source archive, or clone this repository.
2. Open your browser's Extensions page and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open a website you want Noema to work on. Open the Noema extension, select
   **Allow this site**, and review the browser's permission request.
5. Open [Noema](https://app.noemanetwork.xyz). Choose **Noema Router**, open
   **Browser tasks**, connect your verified wallet, select a model, set a session
   spending limit and choose a permitted starting tab.
6. Select **Use browser for next message** and send your task in chat.

Keep the Noema tab and the task website in the same browser window. Browser
tasks use Noema credits. No separate model-provider credentials are needed.
The extension alone does not provide a model service.

## Your controls

- Grant access to individual websites and remove it when you are done.
- Review actions in chat. **Allow once** applies to the reviewed action;
  session approvals apply to the displayed site and action category.
- **Approve for me** covers verified read-only searches. It is not blanket
  permission to perform actions.
- Set a spending limit and stop or disconnect at any time. Connections expire
  after 15 minutes. Interrupted tasks are not automatically restarted.

Noema protects detected sensitive text before cloud requests. You can mark
additional values for protection. The selected cloud model receives the prepared
task context; detection does not guarantee that every sensitive value is found.
Conversations and results remain in the workspace's browser storage. Temporary
extension task state is cleared on completion or disconnection.

This release does not offer operating-system control, wallet signing, screenshots,
file uploads or unattended scheduled tasks. Read the
[browser guide](https://docs.noemanetwork.xyz/automation/browser) for the supported
workflow and its limits.

## Update or remove

Stop and disconnect first. Replace the extracted files, click **Reload** on the
extension card and refresh Noema. Review any new permission request.

To uninstall, remove Noema from your browser's Extensions page. Manage saved
conversations separately in the Noema workspace.

## Source and development

The extension is editable JavaScript, HTML and CSS. There is no build step or
dependency installation required to load it. Changes can be tested by reloading
the unpacked extension. The production workspace connection is configured in
`src/noema/config.js`.

Use Node.js 24 or newer to run the included checks:

```sh
node --test tests/*.test.mjs
node scripts/check.mjs
```

The tests use browser API mocks and do not make model requests or spend credits.
They cover task scoping, permissions, reconnection and the workspace bridge.
The check command validates source checksums, the manifest, JavaScript syntax
and local module paths. These checks do not replace testing in an actual browser.
After intentional source changes, `node scripts/check.mjs --syntax-only` checks
syntax and paths without comparing against the release checksums.

## Permissions

Website access is optional and requested per site. Tab and scripting permissions
let the extension read and operate the selected page. The browser debugging
interface supports page interaction. The side panel contains site controls;
storage and alarms support temporary sessions. Other retained engine permissions
are explained in the browser guide. The extension does not sign transactions.

## License and attribution

This extension is distributed under **GPL-3.0-or-later**. It includes modified
[WebBrain](https://github.com/webbrain-one/webbrain) source, Noema adapters and
bundled dependencies with their original notices. See [LICENSE](LICENSE),
[NOEMA-NOTICE.txt](NOEMA-NOTICE.txt) and the notices alongside bundled dependencies.
Retained upstream documentation describes the upstream project and is not the
Noema feature list.

This repository contains the browser extension only. The Noema application,
model service and other separately provided services are not included.
