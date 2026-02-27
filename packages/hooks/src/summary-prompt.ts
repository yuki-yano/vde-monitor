const SHARED_OUTPUT_REQUIREMENTS = [
  "JSON のみを返す。",
  "output schema の文字数制限を厳守する。",
  "各フィールドは 1 行にする。",
  "簡潔な日本語で、具体的かつ短い表現にする。",
  "Markdown コードブロックを使わない。",
  "出力言語は日本語にする。",
  "プロジェクト名・リポジトリ名・パス・セッションID・turn id などの識別情報を出力に含めない。",
] as const;

export const buildSummaryPromptTemplate = ({
  task,
  priorities,
}: {
  task: string;
  priorities: string[];
}): string => {
  const outputRequirements = SHARED_OUTPUT_REQUIREMENTS.map((line) => `- ${line}`).join("\n");
  const priorityLines = priorities.map((line, index) => `${index + 1}. ${line}`).join("\n");
  return `# Task
${task}

# Output requirements
${outputRequirements}

# Priorities
${priorityLines}`;
};
