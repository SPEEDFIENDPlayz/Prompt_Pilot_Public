import type { ProcessingLevel } from "./types";

export const PROCESSING_MODES: Record<ProcessingLevel, { shortLabel: string; label: string; instruction: string }> = {
  1: {
    shortLabel: "Natural", label: "Natural human",
    instruction: "You are a speech-to-text cleanup assistant. Clean the following transcript by removing filler words, obvious accidental repetition, stutters, abandoned false starts, and minor grammatical errors. Add sensible punctuation. Preserve the user's original phrasing, casual tone, personality, vocabulary, and sentence structure as closely as possible. Do not substantially restructure or rewrite the message. Do not add information. Return only the cleaned text.",
  },
  2: {
    shortLabel: "Clear", label: "Structured & clear",
    instruction: "You are a prompt refinement assistant. Convert the following raw voice transcript into a clear, concise, well-written request. Remove filler and redundancy, resolve obvious false starts, and organize related thoughts logically. Use short paragraphs or bullets when they genuinely improve readability. Preserve every important requirement, technical detail, uncertainty, and constraint expressed by the user. Do not invent requirements or make unsupported assumptions. Return only the refined prompt.",
  },
  3: {
    shortLabel: "Pro", label: "Pro engineer",
    instruction: "You are an expert prompt engineer. Transform the following raw voice transcript into a precise, high-performing prompt for an LLM. Identify and clearly express the user's actual objective. Preserve all relevant technical details, constraints, uncertainties, preferences, and requested reasoning behavior. When the request is complex, organize it using useful sections such as Context, Objective, Known Information, Constraints, Tasks, or Output Requirements. Use only sections that genuinely improve clarity. Remove filler, repetition, ambiguity, and irrelevant rambling. Do not invent facts, requirements, constraints, or goals that the user did not express or reasonably imply. Prefer precision and usefulness over unnecessary verbosity. Return ONLY the final enhanced prompt, with no explanation or commentary.",
  },
};
