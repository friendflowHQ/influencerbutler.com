/**
 * Text-path LLM provider for Butler AI. Mirrors the Groq-first / OpenAI-fallback
 * resolver in ai-notes.ts (both speak the OpenAI-compatible chat/completions
 * API), so the typed chat mode stays near-free while voice uses paid Realtime.
 *
 * Dependencies: @/lib/ai-concierge/config.
 */
import { TEXT_MODEL_OVERRIDE } from "@/lib/ai-concierge/config";

export type TextProvider = { url: string; key: string; model: string; kind: "groq" | "openai" };

export function resolveTextProvider(): TextProvider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      // llama-3.3-70b-versatile is deprecated on Groq (decommissions 2026-08-16).
      // Its first replacement, llama-3.1-8b-instant, was too small for this job:
      // it drifted into random languages (a customer got Korean + Spanish answers
      // to an English question) and skipped the search_help grounding tool.
      // openai/gpt-oss-120b is still near-free on Groq and follows the persona's
      // language + tool rules. AI_CONCIERGE_TEXT_MODEL overrides at runtime.
      model: TEXT_MODEL_OVERRIDE || "openai/gpt-oss-120b",
      kind: "groq",
    };
  }
  return openAiFallbackProvider();
}

/**
 * OpenAI provider used both as the no-Groq default and as the failover when
 * Groq's free-tier tokens-per-minute cap 429s mid-conversation. Deliberately
 * ignores AI_CONCIERGE_TEXT_MODEL: that override names a Groq model, which
 * OpenAI would reject.
 */
export function openAiFallbackProvider(): TextProvider | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return {
    url: "https://api.openai.com/v1/chat/completions",
    key: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    kind: "openai",
  };
}

export function isTextConfigured(): boolean {
  return resolveTextProvider() !== null;
}
