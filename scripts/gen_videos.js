import { search } from "youtube-ext";
import { EXERCISES_DB } from "../src/lib/exercises.ts";
import { HOME_WORKOUTS } from "../src/lib/homeWorkouts.ts";
import fs from "fs";

async function generate() {
  const allExercises = new Set();
  
  Object.values(EXERCISES_DB).forEach(list => list.forEach(ex => allExercises.add(ex)));
  HOME_WORKOUTS.forEach(hw => hw.exercises.forEach(ex => allExercises.add(ex.name)));

  const videoMap = {};
  const exercises = Array.from(allExercises);
  
  console.log(`Fetching videos for ${exercises.length} exercises...`);
  
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    try {
      const res = await search(ex + " exercise form tutorial");
      const v = res.videos[0];
      if (v) {
        videoMap[ex] = [{
          title: v.title,
          channel: v.channel?.name || "YouTube",
          watch_url: v.url,
          embed_url: `https://www.youtube.com/embed/${v.id}`,
        }];
        console.log(`[${i+1}/${exercises.length}] Found: ${ex} -> ${v.id}`);
      }
    } catch (e) {
      console.log(`[${i+1}/${exercises.length}] Failed: ${ex}`);
    }
    // throttle slightly
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync("src/lib/videoMap.ts", `export const VIDEO_MAP: Record<string, any[]> = ${JSON.stringify(videoMap, null, 2)};`);
  console.log("Written to src/lib/videoMap.ts");
}

generate();
