/**
 * Text-path LLM provider for Butler AI. Mirrors the Groq-first / OpenAI-fallback
 * resolver in ai-notes.ts (both speak the OpenAI-compatible chat/completions
 * API), so the typed chat mode stays near-free while voice uses paid Realtime.
 *
 * Dependencies: @/lib/ai-concierge/config.
 */
import { TEXT_MODEL_OVERRIDE } from "@/lib/ai-concierge/config";

export type TextProvider = { url: string; key: string; model: string };

export function resolveTextProvider(): TextProvider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: TEXT_MODEL_OVERRIDE || "llama-3.3-70b-versatile",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: TEXT_MODEL_OVERRIDE || "gpt-4o-mini",
    };
  }
  return null;
}

export function isTextConfigured(): boolean {
  return resolveTextProvider() !== null;
}
