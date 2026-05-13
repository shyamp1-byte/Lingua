import { create } from "zustand";
import type { Caption, SessionStatus } from "../types";

interface SessionStore {
  status: SessionStatus;
  targetLanguage: string;
  caption: Caption | null;
  partialCaption: string | null;
  detectedLanguage: string | null;
  setStatus: (s: SessionStatus) => void;
  setTargetLanguage: (lang: string) => void;
  setCaption: (c: Caption | null) => void;
  setPartialCaption: (t: string | null) => void;
  setDetectedLanguage: (lang: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  status: "idle",
  targetLanguage: "es",
  caption: null,
  partialCaption: null,
  detectedLanguage: null,
  setStatus: (status) => set({ status }),
  setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
  setCaption: (caption) => set({ caption }),
  setPartialCaption: (partialCaption) => set({ partialCaption }),
  setDetectedLanguage: (detectedLanguage) => set({ detectedLanguage }),
}));
