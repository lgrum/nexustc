import type { RouterClient } from "@orpc/server";

import appTheme from "./app-theme";
import blackMarket from "./black-market";
import cardShop from "./card-shop";
import cards from "./cards";
import chronos from "./chronos";
import collectiblesAdmin from "./collectibles-admin";
import comic from "./comic";
import comicCreator from "./comic-creator";
import comicProgress from "./comic-progress";
import creator from "./creator";
import emoji from "./emoji";
import engagementQuestion from "./engagement-question";
import eteris from "./eteris";
import extras from "./extras";
import file from "./file";
import gacha from "./gacha";
import gifts from "./gifts";
import media from "./media";
import moderation from "./moderation";
import notification from "./notification";
import packs from "./packs";
import patreon from "./patreon";
import post from "./post";
import profile from "./profile";
import profileAdmin from "./profile-admin";
import profileCatalogAdmin from "./profile-catalog-admin";
import progression from "./progression";
import rating from "./rating";
import siteConfig from "./site-config";
import staticPage from "./static-page";
import sticker from "./sticker";
import streak from "./streak";
import term from "./term";
import trades from "./trades";
import translator from "./translator";
import user from "./user";

export const appRouter = {
  appTheme,
  blackMarket,
  cards,
  cardShop,
  chronos,
  comic,
  comicCreator,
  comicProgress,
  collectiblesAdmin,
  creator,
  emoji,
  engagementQuestion,
  eteris,
  extras,
  file,
  gacha,
  gifts,
  media,
  moderation,
  notification,
  patreon,
  post,
  packs,
  profile,
  profileAdmin,
  profileCatalogAdmin,
  progression,
  rating,
  siteConfig,
  staticPage,
  streak,
  sticker,
  term,
  trades,
  translator,
  user,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
