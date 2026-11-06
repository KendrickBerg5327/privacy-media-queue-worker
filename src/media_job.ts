import { z } from "zod";

export const MediaIngestion = z.object({
  assetId: z.string().uuid(),
  creatorId: z.string().min(1),
  sourceObject: z.string().min(1),
  deliveryObject: z.string().min(1),
  consentReference: z.string().min(1),
});

export type MediaIngestion = z.infer<typeof MediaIngestion>;

export type CreatorDelivery = {
  assetId: string;
  creatorId: string;
  deliveryObject: string;
  state: "delivered";
};

export async function processMedia(job: MediaIngestion): Promise<CreatorDelivery> {
  return {
    assetId: job.assetId,
    creatorId: job.creatorId,
    deliveryObject: job.deliveryObject,
    state: "delivered",
  };
}
