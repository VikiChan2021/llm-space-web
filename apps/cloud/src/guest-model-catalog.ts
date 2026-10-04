import { findGuestModel } from "@llm-space/core/guest-models";

export {
  createGuestModelProvider,
  createGuestModels,
  findGuestModel,
  GUEST_MODEL_CATALOG,
  GUEST_PROVIDER_DEFINITIONS,
  isGuestModelAllowed,
  isGuestProviderId,
  type GuestProviderApiKeys,
  type GuestProviderId,
} from "@llm-space/core/guest-models";

// Keep compatibility with installations that only have Zhipu credentials.
export const GUEST_PROVIDER_ID = "bigmodel";
export const DEFAULT_GUEST_MODEL_ID = "glm-4.5-air";

export function guestModelSupportsImageInput(modelId: string): boolean {
  return findGuestModel(modelId)?.input.includes("image") ?? false;
}
