import type { RouterClient } from "@orpc/server";
import chronos from "./chronos";
import comic from "./comic";
import emoji from "./emoji";
import extras from "./extras";
import file from "./file";
import patreon from "./patreon";
import post from "./post";
import profile from "./profile";
import profileAdmin from "./profile-admin";
import rating from "./rating";
import staticPage from "./staticPage";
import sticker from "./sticker";
import term from "./term";
import user from "./user";

export const appRouter = {
  comic,
  post,
  term,
  user,
  file,
  extras,
  rating,
  patreon,
  profile,
  profileAdmin,
  chronos,
  staticPage,
  emoji,
  sticker,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
