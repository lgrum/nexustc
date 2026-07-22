import {
  Calendar03Icon,
  FavouriteIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { PublicProfile } from "@repo/api/services/profile";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProfileIdentity } from "@/components/profile/profile-identity";
import {
  ProfileStat,
  ProfileStatList,
} from "@/components/profile/profile-section";

const COMPACT_FORMATTER = new Intl.NumberFormat("es", {
  maximumFractionDigits: 1,
  notation: "compact",
});

function formatActivityCount(value: number | null) {
  return value === null ? "Privado" : COMPACT_FORMATTER.format(value);
}

export function PublicProfileHero({ profile }: { profile: PublicProfile }) {
  const memberSince = format(profile.createdAt, "MMMM yyyy", { locale: es });
  const identity = {
    avatar: profile.avatar,
    avatarFallbackColor: profile.avatarFallbackColor,
    image: profile.image,
    name: profile.name,
    patronBadge: profile.patronBadge,
    patronTier: profile.patronTier,
    profileEmblems: profile.profileEmblems,
    profileRoles: profile.profileRoles,
    role: profile.role,
    roleBadge: profile.roleBadge,
    roleGradient: profile.roleGradient,
  };

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-card/80 shadow-2xl shadow-black/20">
      <ProfileBanner
        banner={profile.banner}
        className="absolute inset-0 h-full rounded-none border-0 opacity-75"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-r from-background via-background/80 to-background/35"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_80%_12%,oklch(0.795_0.184_86.047/0.22),transparent_32%),radial-gradient(circle_at_15%_100%,oklch(0.57_0.29_304.65/0.14),transparent_38%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-background via-background/60 to-transparent"
      />

      <div className="relative grid min-h-112 gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:p-9">
        <div className="flex min-w-0 flex-col justify-end">
          <p className="mb-5 font-semibold text-[11px] text-primary uppercase tracking-[0.3em]">
            Perfil de la comunidad
          </p>
          <ProfileIdentity
            avatarClassName="border-background/90 bg-background"
            density="public"
            nameAs="h1"
            user={identity}
          >
            <p className="max-w-2xl text-pretty text-sm leading-6 sm:text-base">
              Miembro de NeXusTC desde {memberSince}. Explora el contenido que
              ha guardado y las reseñas que ha compartido con la comunidad.
            </p>
          </ProfileIdentity>
          <div className="glow-line mt-6 max-w-sm" />
        </div>

        <ProfileStatList className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-2">
          <ProfileStat
            icon={Calendar03Icon}
            label="Miembro desde"
            value={format(profile.createdAt, "yyyy")}
          />
          <ProfileStat
            icon={FavouriteIcon}
            label="Favoritos"
            value={formatActivityCount(profile.activityCounts.favorites)}
          />
          <ProfileStat
            icon={StarIcon}
            label="Reseñas"
            value={formatActivityCount(profile.activityCounts.reviews)}
          />
        </ProfileStatList>
      </div>
    </section>
  );
}
