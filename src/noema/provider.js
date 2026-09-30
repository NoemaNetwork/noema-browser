// SPDX-License-Identifier: GPL-3.0-or-later
import { BaseLLMProvider } from '../providers/base.js';
import { bridgeRequest, pairState, TOOL_NAMES, assertObservation } from './runtime.js';
export class NoemaProvider extends BaseLLMProvider {
    get name() { return 'Noema'; }
    get supportsTools() { return true; }
    get supportsVision() { return false; }
    get supportsAskStreaming() { return false; }
    get promptTier() { return 'compact'; }
    async testConnection() { return { ok: !!(await pairState()), model: 'Noema Router', error: 'Connect Noema to start.' }; }
    async chat(messages, options = {}) {
        await assertObservation();
        const input = { messages: messages.map(m => ({
                role: m.role,
                content: Array.isArray(m.content) ? m.content.map(p => { if (p.type !== 'text')
                    throw Error('Image observations are not enabled.'); return p.text; }).join('\n') : m.content ?? null,
                ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
            })),
            max_tokens: Math.min(options.maxTokens || 4096, 4096),
            ...(options.tools?.length ? { tools: options.tools.filter(t => TOOL_NAMES.has(t.function?.name)), tool_choice: 'auto' } : {}),
            ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}) };
        const result = await bridgeRequest('complete', { input }, options.signal);
        const message = result?.choices?.[0]?.message;
        if (!message)
            throw Error('Noema returned an incomplete response.');
        return { content: message.content || '', toolCalls: message.tool_calls || null, usage: result.usage, finishReason: result.choices[0].finish_reason, raw: result };
    }
}
