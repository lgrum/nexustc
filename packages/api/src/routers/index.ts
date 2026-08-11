import type { RouterClient } from "@orpc/server";

import appTheme from "./app-theme";
import chronos from "./chronos";
import comic from "./comic";
import comicCreator from "./comic-creator";
import comicProgress from "./comic-progress";
import creator from "./creator";
import emoji from "./emoji";
import engagementQuestion from "./engagement-question";
import eteris from "./eteris";
import extras from "./extras";
import file from "./file";
import media from "./media";
import moderation from "./moderation";
import notification from "./notification";
import patreon from "./patreon";
import post from "./post";
import profile from "./profile";
import profileAdmin from "./profile-admin";
import progression from "./progression";
import rating from "./rating";
import siteConfig from "./site-config";
import staticPage from "./static-page";
import sticker from "./sticker";
import term from "./term";
import translator from "./translator";
import user from "./user";

export const appRouter = {
  appTheme,
  chronos,
  comic,
  comicCreator,
  comicProgress,
  creator,
  emoji,
  engagementQuestion,
  eteris,
  extras,
  file,
  media,
  moderation,
  notification,
  patreon,
  post,
  profile,
  profileAdmin,
  progression,
  rating,
  siteConfig,
  staticPage,
  sticker,
  term,
  translator,
  user,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
