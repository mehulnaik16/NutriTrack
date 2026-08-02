
import { createServerFn } from "@tanstack/react-start";
import ytSearch from "yt-search";

export const searchYouTube = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async (ctx) => {
    try {
      const results = await ytSearch(ctx.data + " exercise form tutorial");
      const videos = results.videos || results.all || [];
      return videos.slice(0, 3).map((v: any) => ({
        title: v.title,
        channel: v.author?.name || v.channel?.name || "YouTube",
        watch_url: v.url,
        embed_url: `https://www.youtube.com/embed/${v.videoId}`,
      }));
    } catch (error) {
      console.error("YouTube search error:", error);
      return [];
    }
  });

