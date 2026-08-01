"use client";

import { ClipboardPasteIcon, FileIcon, ImagePlusIcon } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";


import {
  useThreadStore,
  useThreadStoreActions,
} from "../stores/thread-store";

import {
  MAX_IMAGES_PER_THREAD,
  prepareImageFile,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "./image-input";

export function AddImagesMenu({
  messageId,
  disabled,
}: {
  messageId: string;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addMessageImageContent } = useThreadStoreActions();
  const messages = useThreadStore(
    (state) => state.thread.context?.messages ?? []
  );
  const imageCount = useMemo(
    () =>
      messages.reduce(
        (count, message) =>
          count +
          message.content.filter((content) => content.type === "image_data")
            .length,
        0
      ),
    [messages]
  );

  const ensureAvailable = useCallback(() => {
    if (imageCount >= MAX_IMAGES_PER_THREAD) {
      toast.warning(`每个 Thread 最多添加 ${MAX_IMAGES_PER_THREAD} 张图片。`);
      return false;
    }
    return true;
  }, [imageCount]);

  const addImage = useCallback(
    ({ mimeType, data }: { mimeType: string; data: string }) => {
      addMessageImageContent(messageId, mimeType, data);
    },
    [addMessageImageContent, messageId]
  );

  const handleFilesSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0 || !ensureAvailable()) {
        return;
      }
      const remaining = MAX_IMAGES_PER_THREAD - imageCount;
      const selected = files.slice(0, remaining);
      if (files.length > remaining) {
        toast.warning(`本次最多还能添加 ${remaining} 张图片。`);
      }
      for (const file of selected) {
        try {
          addImage(await prepareImageFile(file));
        } catch (error) {
          toast.error("图片添加失败", {
            description:
              error instanceof Error ? error.message : "请换一张图片后重试。",
          });
        }
      }
    },
    [addImage, ensureAvailable, imageCount]
  );

  const handleFromFiles = useCallback(() => {
    if (ensureAvailable()) fileInputRef.current?.click();
  }, [ensureAvailable]);

  const handleFromClipboard = useCallback(async () => {
    if (!ensureAvailable()) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const file = new File([blob], "clipboard-image", { type });
            addImage(await prepareImageFile(file));
            return;
          }
        }
      }
    } catch (error) {
      toast.error("无法读取剪贴板图片", {
        description:
          error instanceof Error
            ? error.message
            : "请允许剪贴板权限或改用文件上传。",
      });
    }
  }, [addImage, ensureAvailable]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(",")}
        multiple
        aria-label="Image files"
        className="hidden"
        onChange={handleFilesSelected}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add image to message"
            disabled={disabled}
          >
            <ImagePlusIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Add Images</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleFromFiles}>
            <FileIcon />
            From Files
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleFromClipboard}>
            <ClipboardPasteIcon />
            From Clipboard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
