import { createServerFn } from "@tanstack/react-start";
import { VIDEO_MAP } from "./videoMap.js";

export const searchYouTube = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async (ctx) => {
    try {
      // The frontend sends just the exercise name
      const query = ctx.data;
      if (VIDEO_MAP[query]) {
        return VIDEO_MAP[query];
      }
      return [];
    } catch (error) {
      console.error("YouTube map lookup error:", error);
      return [];
    }
  });
