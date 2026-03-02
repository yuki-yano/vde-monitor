export type SummaryPromptLanguage = "en" | "ja";

const resolveOutputLanguageLabel = (outputLanguage: SummaryPromptLanguage) =>
  outputLanguage === "ja" ? "Japanese" : "English";

export const buildSummaryPromptTemplate = ({
  task,
  priorities,
  outputLanguage = "en",
}: {
  task: string;
  priorities: string[];
  outputLanguage?: SummaryPromptLanguage;
}): string => {
  const outputLanguageLabel = resolveOutputLanguageLabel(outputLanguage);
  const sharedOutputRequirements = [
    "Return JSON only.",
    "Strictly follow output schema character limits.",
    "Each field must be a single line.",
    "Use concise, concrete wording.",
    `Write all output fields in ${outputLanguageLabel}.`,
    'Do not prepend labels like "Claude hook summary:" or "Summary:".',
    "Do not use Markdown code fences.",
    "Do not include project/repository/path/session IDs/turn IDs or similar identifiers.",
  ] as const;
  const outputRequirements = sharedOutputRequirements.map((line) => `- ${line}`).join("\n");
  const priorityLines = priorities.map((line, index) => `${index + 1}. ${line}`).join("\n");
  return `# Task
${task}

# Output requirements
${outputRequirements}

# Priorities
${priorityLines}`;
};
