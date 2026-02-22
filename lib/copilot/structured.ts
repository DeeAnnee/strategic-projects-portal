import { parseAndValidateArtifact } from "@/lib/copilot/artifact-schemas";
import {
  mapCopilotArtifactTypeToStorage,
  type CopilotMode,
  type CopilotStorageArtifactType
} from "@/lib/copilot/types";

type ParsedStructuredOutput = {
  cleanText: string;
  jsonData: unknown | null;
  artifacts: Array<{
    type: CopilotStorageArtifactType;
    payload: unknown;
  }>;
};

const stripJsonMarkers = (text: string) =>
  text
    .replace(/\[\[COPILOT_JSON\]\][\s\S]*?\[\[\/COPILOT_JSON\]\]/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .trim();

export const parseStructuredOutput = (mode: CopilotMode, text: string): ParsedStructuredOutput => {
  const cleanText = stripJsonMarkers(text);
  const parsed = parseAndValidateArtifact(mode, text);
  if (!parsed.artifact) {
    return {
      cleanText,
      jsonData: null,
      artifacts: []
    };
  }

  return {
    cleanText,
    jsonData: parsed.artifact.data,
    artifacts: [
      {
        type: mapCopilotArtifactTypeToStorage(parsed.artifact.artifactType),
        payload: {
          artifactType: parsed.artifact.artifactType,
          data: parsed.artifact.data
        }
      }
    ]
  };
};

