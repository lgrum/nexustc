import type { RouterClient } from "@orpc/server";

import chronos from "./chronos";
import comic from "./comic";
import comicProgress from "./comic-progress";
import creator from "./creator";
import emoji from "./emoji";
import engagementQuestion from "./engagement-question";
import extras from "./extras";
import file from "./file";
import media from "./media";
import notification from "./notification";
import patreon from "./patreon";
import post from "./post";
import profile from "./profile";
import profileAdmin from "./profile-admin";
import rating from "./rating";
import siteConfig from "./site-config";
import staticPage from "./static-page";
import sticker from "./sticker";
import term from "./term";
import user from "./user";

export const appRouter = {
  chronos,
  comic,
  comicProgress,
  creator,
  emoji,
  engagementQuestion,
  extras,
  file,
  media,
  notification,
  patreon,
  post,
  profile,
  profileAdmin,
  rating,
  siteConfig,
  staticPage,
  sticker,
  term,
  user,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
