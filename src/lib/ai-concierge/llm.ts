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
      // llama-3.3-70b-versatile is deprecated on Groq (decommissions 2026-08-16),
      // which fails the chat completion with a non-200 and surfaces to the app as
      // "The assistant is unavailable right now." Default to a currently-supported
      // Groq model; AI_CONCIERGE_TEXT_MODEL still overrides at runtime (e.g. set it
      // to openai/gpt-oss-120b if you want a larger model for tool-heavy answers).
      model: TEXT_MODEL_OVERRIDE || "llama-3.1-8b-instant",
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
