export type PromptOutputLanguage =
  | "简体中文"
  | "日语"
  | "韩语"
  | "俄语"
  | "与用户输入相同的语言";

export function detectPromptOutputLanguage(
  input: string
): PromptOutputLanguage {
  if (/[぀-ヿ]/u.test(input)) return "日语";
  if (/[가-힯]/u.test(input)) return "韩语";
  if (/[㐀-鿿]/u.test(input)) return "简体中文";
  if (/[Ѐ-ӿ]/u.test(input)) return "俄语";
  return "与用户输入相同的语言";
}

export function buildPromptGenerationInput(input: string): string {
  return `<output-language>${detectPromptOutputLanguage(input)}</output-language>\n<user-input>\n${input}\n</user-input>`;
}
