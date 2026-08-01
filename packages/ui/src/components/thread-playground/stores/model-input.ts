import type { Message, UserMessage } from "@llm-space/core";

const OMITTED_IMAGE_NOTICE = "[图片未发送：当前模型仅支持文本。]";

/**
 * Build a model-only view of the conversation without mutating Thread data.
 * Text-only models receive all textual history plus a compact marker for each
 * user turn that contained images; switching back to a vision model still has
 * access to the original images kept in the Thread.
 */
export function prepareMessagesForModel(
  messages: Message[],
  supportsImageInput: boolean
): Message[] {
  if (supportsImageInput) return messages;

  let changed = false;
  const prepared = messages.map((message) => {
    if (message.role !== "user") return message;
    const withoutImages = message.content.filter(
      (content) => content.type !== "image_data"
    );
    if (withoutImages.length === message.content.length) return message;
    changed = true;
    return {
      ...message,
      content: [
        ...withoutImages,
        { type: "text", text: OMITTED_IMAGE_NOTICE },
      ],
    } satisfies UserMessage;
  });
  return changed ? prepared : messages;
}
