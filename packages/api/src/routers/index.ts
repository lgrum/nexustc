import type { RouterClient } from "@orpc/server";
import chronos from "./chronos";
import comic from "./comic";
import emoji from "./emoji";
import engagementQuestion from "./engagementQuestion";
import extras from "./extras";
import file from "./file";
import patreon from "./patreon";
import post from "./post";
import rating from "./rating";
import staticPage from "./staticPage";
import sticker from "./sticker";
import term from "./term";
import user from "./user";

export const appRouter = {
  comic,
  engagementQuestion,
  post,
  term,
  user,
  file,
  extras,
  rating,
  patreon,
  chronos,
  staticPage,
  emoji,
  sticker,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
