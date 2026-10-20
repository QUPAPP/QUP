/**
 * The AI provider every run goes through (AI_INTEGRATION.md "Provider
 * Strategy"): an `AiProvider` from @qup/ai-gateway, or null when AI is off
 * (AI_PROVIDER=disabled). Tests replace it with a scripted provider.
 */
export const AI_PROVIDER = Symbol("AI_PROVIDER");
