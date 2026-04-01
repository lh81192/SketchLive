import { create } from "zustand";
import { apiFetch, handleApiProjectAccessError } from "@/lib/api-fetch";
import { routing } from "@/i18n/routing";

function getLocaleFromPathname(): string {
  if (typeof window === "undefined") return routing.defaultLocale;
  const locale = window.location.pathname.split("/")[1];
  return routing.locales.includes(locale as (typeof routing.locales)[number])
    ? locale
    : routing.defaultLocale;
}

function handleProjectAccessError(error: unknown): never {
  handleApiProjectAccessError(error, getLocaleFromPathname());
}

interface Character {
  id: string;
  name: string;
  description: string;
  referenceImage: string | null;
  visualHint?: string | null;
  scope?: string;
  episodeId?: string | null;
}

interface Dialogue {
  id: string;
  text: string;
  characterId: string;
  characterName: string;
  sequence: number;
}

interface EpubImport {
  id: string;
  fileName: string;
  status: "pending" | "extracting" | "ready" | "failed";
  title: string | null;
  author: string | null;
  coverPath: string | null;
  totalPages: number;
}

interface EpubPage {
  id: string;
  pageNumber: number;
  imagePath: string;
  thumbPath: string | null;
  width: number | null;
  height: number | null;
  sourceHref: string | null;
  sourceMediaType: string | null;
  isSelected: boolean;
  sortOrder: number;
}

interface Shot {
  id: string;
  sequence: number;
  prompt: string;
  startFrameDesc: string | null;
  endFrameDesc: string | null;
  videoScript: string | null;
  motionScript: string | null;
  cameraDirection: string;
  duration: number;
  firstFrame: string | null;
  lastFrame: string | null;
  videoUrl: string | null;
  referenceVideoUrl: string | null;
  lastFrameUrl: string | null;
  sceneRefFrame: string | null;
  videoPrompt: string | null;
  status: string;
  dialogues: Dialogue[];
}

export type StoryboardVersion = {
  id: string;
  label: string;
  versionNum: number;
  createdAt: number;
};

interface Project {
  id: string;
  title: string;
  idea: string;
  script: string;
  status: string;
  finalVideoUrl: string | null;
  generationMode: "keyframe" | "reference";
  inputSource: "script" | "epub";
  epubImportId: string | null;
  epubImport?: EpubImport | null;
  epubPages?: EpubPage[];
  characters: Character[];
  shots: Shot[];
  versions: StoryboardVersion[];
}

interface ProjectStore {
  project: Project | null;
  loading: boolean;
  currentEpisodeId: string | null;
  fetchProject: (id: string, episodeId?: string, versionId?: string) => Promise<void>;
  updateIdea: (idea: string) => void;
  updateScript: (script: string) => void;
  setProject: (project: Project) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  loading: false,
  currentEpisodeId: null,

  fetchProject: async (id: string, episodeId?: string, versionId?: string) => {
    if (!get().project) set({ loading: true });

    try {
      const url = episodeId
        ? `/api/projects/${id}/episodes/${episodeId}${versionId ? `?versionId=${versionId}` : ""}`
        : `/api/projects/${id}${versionId ? `?versionId=${versionId}` : ""}`;

      const res = await apiFetch(url);
      const data = await res.json();
      set({ project: data, loading: false, currentEpisodeId: episodeId ?? null });
    } catch (error) {
      set({ loading: false });
      handleProjectAccessError(error);
    }
  },

  updateIdea: (idea: string) => {
    set((state) => ({
      project: state.project ? { ...state.project, idea } : null,
    }));
  },

  updateScript: (script: string) => {
    set((state) => ({
      project: state.project ? { ...state.project, script } : null,
    }));
  },

  setProject: (project: Project) => {
    set({ project });
  },
}));
