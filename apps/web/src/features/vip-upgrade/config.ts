import { membershipUpgradeConfigSchema } from "@/features/vip-upgrade/types";

export const defaultMembershipUpgradeConfig =
  membershipUpgradeConfigSchema.parse({
    comparisonDefaults: {
      currentTierId: "citizen",
      featureTab: "unlocked",
      targetTierId: "orbit",
    },
    editorLabel: "Editor de motor VIP",
    features: [
      {
        icon: "sparkles",
        id: "emoji-vault",
        kind: "assets",
        label: "Emoji vault",
        narrative: "Tus reacciones pasan de neutras a coleccionables.",
        shortLabel: "Emojis",
      },
      {
        icon: "stickers",
        id: "sticker-lab",
        kind: "assets",
        label: "Sticker lab",
        narrative: "Los comentarios dejan de verse básicos y ganan presencia.",
        shortLabel: "Stickers",
      },
      {
        icon: "palette",
        id: "theme-remix",
        kind: "palette",
        label: "Theme remix",
        narrative: "La interfaz cambia con tu rango.",
        shortLabel: "Themes",
      },
      {
        icon: "bookmark",
        id: "favorites-cap",
        kind: "counter",
        label: "Favorites cap",
        narrative: "Guardar más contenido reduce fricción.",
        shortLabel: "Favoritos",
      },
      {
        icon: "bolt",
        id: "early-access",
        kind: "timeline",
        label: "Early access runway",
        narrative: "La espera se comprime al subir.",
        shortLabel: "Early access",
      },
      {
        icon: "shield",
        id: "ad-removal",
        kind: "ad-preview",
        label: "Ad removal",
        narrative: "La interfaz deja de competir por atención.",
        shortLabel: "Sin ads",
      },
      {
        icon: "crown",
        id: "premium-links",
        kind: "boolean",
        label: "Premium unlocks",
        narrative: "Más contenido deja de quedarse detrás de la puerta.",
        shortLabel: "Premium",
      },
      {
        icon: "users",
        id: "backstage-room",
        kind: "boolean",
        label: "Backstage room",
        narrative: "Más cercanía, contexto y señal de pertenencia.",
        shortLabel: "Backstage",
      },
    ],
    hero: {
      eyebrow: "Upgrade Engine",
      subtitle:
        "Una comparación en tiempo real entre lo que ya tienes y lo que tu cuenta podría desbloquear.",
      title: "Haz visible el progreso antes de pedir la mejora.",
    },
    recommendation: {
      fallbackTierId: "orbit",
      intro:
        "Responde rápido y el motor empuja la comparación hacia el rango con mejor retorno.",
      questions: [
        {
          id: "consume-frequency",
          options: [
            {
              id: "weekly",
              label: "Cada semana",
              summary: "Quiero entrar antes sin perseguir avisos.",
              weights: { orbit: 2, pulse: 1, vanguard: 2 },
            },
            {
              id: "daily",
              label: "Casi diario",
              summary: "Me pesa esperar lanzamientos.",
              weights: { orbit: 2, vanguard: 4, zenith: 1 },
            },
            {
              id: "binge",
              label: "Modo maratón",
              summary: "Consumo mucho y quiero punta de cola.",
              weights: { vanguard: 3, zenith: 4 },
            },
          ],
          prompt: "¿Con qué frecuencia consumes cómics o juegos nuevos?",
        },
        {
          id: "downloads",
          options: [
            {
              id: "low",
              label: "Pocas veces",
              summary: "Solo quiero un poco más de aire.",
              weights: { pulse: 2, orbit: 1 },
            },
            {
              id: "medium",
              label: "Muy seguido",
              summary: "Los límites empiezan a sentirse chicos.",
              weights: { orbit: 2, vanguard: 3 },
            },
            {
              id: "high",
              label: "Colecciono todo",
              summary: "Necesito acceso ancho y menos topes.",
              weights: { vanguard: 3, zenith: 4 },
            },
          ],
          prompt:
            "¿Qué tan importante es guardar y descargar sin toparte con límites?",
        },
        {
          id: "status-value",
          options: [
            {
              id: "low",
              label: "Me da igual",
              summary: "Busco valor práctico.",
              weights: { orbit: 2, pulse: 1 },
            },
            {
              id: "medium",
              label: "Algo importa",
              summary: "Si subo, quiero que se note.",
              weights: { orbit: 1, vanguard: 3 },
            },
            {
              id: "high",
              label: "Quiero presencia",
              summary: "Me importa la evolución visual.",
              weights: { vanguard: 3, zenith: 5 },
            },
          ],
          prompt: "¿Cuánto valoras que tu cuenta proyecte estatus visual?",
        },
      ],
    },
    tiers: [
      {
        badgeEvolution: {
          previewMonths: 0,
          stages: [
            {
              accent: "#94a3b8",
              emoji: "◌",
              id: "c0",
              label: "Seed",
              monthsRequired: 0,
            },
            {
              accent: "#cbd5e1",
              emoji: "◔",
              id: "c1",
              label: "Echo",
              monthsRequired: 2,
            },
            {
              accent: "#f4d17a",
              emoji: "◕",
              id: "c2",
              label: "Marked",
              monthsRequired: 5,
            },
          ],
        },
        billingLabel: "Siempre abierto",
        conversionNote:
          "Sirve para entrar, pero deja demasiadas ventajas fuera de pantalla.",
        ctaLabel: "Explorar mejoras",
        emphasis: "entry",
        eyebrow: "Base",
        featureValues: {
          "ad-removal": {
            adFree: false,
            kind: "ad-preview",
            placeholderLabel: "Ad slots",
            slots: 3,
          },
          "backstage-room": { enabled: false, kind: "boolean" },
          "early-access": {
            detail: "Esperas al lanzamiento público.",
            kind: "timeline",
            phases: [{ accent: "#64748b", hours: 72, label: "Public release" }],
          },
          "emoji-vault": {
            items: [
              {
                accent: "#64748b",
                emoji: "🙂",
                id: "c-emoji-1",
                label: "Starter",
              },
            ],
            kind: "assets",
          },
          "favorites-cap": {
            detail: "La biblioteca se llena rápido.",
            kind: "counter",
            suffix: "slots",
            value: 5,
          },
          "premium-links": { enabled: false, kind: "boolean" },
          "sticker-lab": {
            items: [
              {
                accent: "#475569",
                emoji: "✦",
                id: "c-sticker-1",
                label: "Basic ping",
              },
            ],
            kind: "assets",
          },
          "theme-remix": {
            kind: "palette",
            palettes: [
              {
                colors: ["#111827", "#334155", "#64748b"],
                gradient: "linear-gradient(135deg,#0f172a,#1e293b 55%,#334155)",
                id: "c-theme-1",
                label: "Night index",
              },
            ],
          },
        },
        id: "citizen",
        identity: {
          badgeAccent: "#94a3b8",
          badgeLabel: "Open Access",
          glow: "rgba(148,163,184,0.35)",
          gradient: ["#cbd5e1", "#64748b"],
          sampleName: "Visitor_204",
          subtitle: "Presencia discreta.",
        },
        name: "Citizen",
        order: 0,
        patronUrl: "https://www.patreon.com/",
        popularityNote: "Entrada libre",
        priceLabel: "Gratis",
        recommendationBonus: 0,
        shortName: "Citizen",
        sourceTierKey: "none",
        tagline: "Acceso base al catálogo público.",
        visual: {
          border: "rgba(148,163,184,0.28)",
          glow: "rgba(51,65,85,0.45)",
          surface:
            "linear-gradient(160deg,rgba(15,23,42,0.86),rgba(15,23,42,0.62))",
          text: "#e2e8f0",
        },
        xp: {
          level: 2,
          monthlyBoost: 20,
          nextLevelXp: 500,
          upgradeBonusXp: 0,
          xp: 140,
        },
      },
      {
        badgeEvolution: {
          previewMonths: 1,
          stages: [
            {
              accent: "#f59e0b",
              emoji: "◉",
              id: "p0",
              label: "Pulse",
              monthsRequired: 0,
            },
            {
              accent: "#fbbf24",
              emoji: "⬢",
              id: "p1",
              label: "Signal",
              monthsRequired: 3,
            },
            {
              accent: "#fde68a",
              emoji: "✺",
              id: "p2",
              label: "Beacon",
              monthsRequired: 6,
            },
          ],
        },
        billingLabel: "por mes",
        conversionNote: "El primer empujón: menos espera y más control.",
        ctaLabel: "Subir a Pulse",
        emphasis: "entry",
        eyebrow: "Starter VIP",
        featureValues: {
          "ad-removal": {
            adFree: false,
            kind: "ad-preview",
            placeholderLabel: "Low-noise ads",
            slots: 2,
          },
          "backstage-room": { enabled: false, kind: "boolean" },
          "early-access": {
            detail: "Apareces antes que la mayoría.",
            kind: "timeline",
            phases: [
              { accent: "#fb923c", hours: 24, label: "Pulse window" },
              { accent: "#64748b", hours: 48, label: "Public release" },
            ],
          },
          "emoji-vault": {
            items: [
              {
                accent: "#fb923c",
                emoji: "⚡",
                id: "p-emoji-1",
                label: "Spark",
              },
              {
                accent: "#f59e0b",
                emoji: "🔥",
                id: "p-emoji-2",
                label: "Heat",
              },
            ],
            kind: "assets",
          },
          "favorites-cap": { kind: "counter", suffix: "slots", value: 10 },
          "premium-links": {
            detail: "Abres una parte del catálogo premium.",
            enabled: true,
            kind: "boolean",
          },
          "sticker-lab": {
            items: [
              {
                accent: "#f59e0b",
                emoji: "✺",
                id: "p-sticker-1",
                label: "Burst",
              },
              {
                accent: "#fbbf24",
                emoji: "☄",
                id: "p-sticker-2",
                label: "Comet",
              },
            ],
            kind: "assets",
          },
          "theme-remix": {
            kind: "palette",
            palettes: [
              {
                colors: ["#1f2937", "#f97316", "#fbbf24"],
                gradient: "linear-gradient(135deg,#1f2937,#7c2d12 45%,#f59e0b)",
                id: "p-theme-1",
                label: "Solar drift",
              },
            ],
          },
        },
        id: "pulse",
        identity: {
          badgeAccent: "#f59e0b",
          badgeLabel: "Pulse",
          glow: "rgba(245,158,11,0.45)",
          gradient: ["#fde68a", "#f59e0b"],
          sampleName: "PulseRunner",
          subtitle: "Tu nombre deja de verse neutro.",
        },
        name: "Pulse",
        order: 1,
        patronUrl: "https://www.patreon.com/",
        popularityNote: "Primer salto",
        priceLabel: "US$1",
        recommendationBonus: 0.4,
        shortName: "Pulse",
        sourceTierKey: "level1",
        tagline: "La puerta de entrada a la sensación VIP.",
        visual: {
          border: "rgba(245,158,11,0.34)",
          glow: "rgba(245,158,11,0.42)",
          surface:
            "linear-gradient(160deg,rgba(23,18,9,0.94),rgba(120,53,15,0.68))",
          text: "#fff7ed",
        },
        xp: {
          level: 4,
          monthlyBoost: 45,
          nextLevelXp: 600,
          upgradeBonusXp: 90,
          xp: 320,
        },
      },
      {
        badgeEvolution: {
          previewMonths: 3,
          stages: [
            {
              accent: "#06b6d4",
              emoji: "◈",
              id: "o0",
              label: "Orbit",
              monthsRequired: 0,
            },
            {
              accent: "#38bdf8",
              emoji: "✶",
              id: "o1",
              label: "Drift",
              monthsRequired: 2,
            },
            {
              accent: "#c084fc",
              emoji: "✹",
              id: "o2",
              label: "Nova",
              monthsRequired: 5,
            },
          ],
        },
        billingLabel: "por mes",
        conversionNote: "El punto donde la experiencia ya se siente distinta.",
        ctaLabel: "Subir a Orbit",
        emphasis: "mid",
        eyebrow: "Most chosen",
        featureValues: {
          "ad-removal": {
            adFree: true,
            kind: "ad-preview",
            placeholderLabel: "Ads removed",
            slots: 3,
          },
          "backstage-room": {
            detail: "Acceso a comunidad de rango medio.",
            enabled: true,
            kind: "boolean",
          },
          "early-access": {
            detail: "Entras antes del tráfico fuerte.",
            kind: "timeline",
            phases: [
              { accent: "#06b6d4", hours: 24, label: "Orbit priority" },
              { accent: "#f59e0b", hours: 24, label: "Pulse follow-up" },
              { accent: "#64748b", hours: 24, label: "Public release" },
            ],
          },
          "emoji-vault": {
            items: [
              {
                accent: "#06b6d4",
                emoji: "🛰",
                id: "o-emoji-1",
                label: "Orbit ping",
              },
              {
                accent: "#38bdf8",
                emoji: "🌊",
                id: "o-emoji-2",
                label: "Wave",
              },
              {
                accent: "#818cf8",
                emoji: "💫",
                id: "o-emoji-3",
                label: "Shimmer",
              },
            ],
            kind: "assets",
          },
          "favorites-cap": {
            emphasis: "sweet spot",
            kind: "counter",
            suffix: "slots",
            value: 15,
          },
          "premium-links": {
            detail: "Acceso premium completo.",
            enabled: true,
            kind: "boolean",
          },
          "sticker-lab": {
            items: [
              {
                accent: "#38bdf8",
                emoji: "🌀",
                id: "o-sticker-1",
                label: "Spiral",
              },
              {
                accent: "#818cf8",
                emoji: "🪐",
                id: "o-sticker-2",
                label: "Orbit ring",
              },
              {
                accent: "#c084fc",
                emoji: "✨",
                id: "o-sticker-3",
                label: "Shine",
              },
            ],
            kind: "assets",
          },
          "theme-remix": {
            kind: "palette",
            palettes: [
              {
                colors: ["#0f172a", "#06b6d4", "#818cf8"],
                gradient: "linear-gradient(135deg,#0f172a,#0f3b58 42%,#6366f1)",
                id: "o-theme-1",
                label: "Orbit reef",
              },
              {
                colors: ["#111827", "#2563eb", "#c084fc"],
                gradient: "linear-gradient(135deg,#111827,#1d4ed8 42%,#c084fc)",
                id: "o-theme-2",
                label: "Signal bloom",
              },
            ],
          },
        },
        id: "orbit",
        identity: {
          badgeAccent: "#38bdf8",
          badgeLabel: "Recommended",
          glow: "rgba(56,189,248,0.42)",
          gradient: ["#67e8f9", "#a78bfa"],
          sampleName: "OrbitShift",
          subtitle: "El rango medio ya cambia tu perfil.",
        },
        name: "Orbit",
        order: 2,
        patronUrl: "https://www.patreon.com/",
        popularityNote: "Más elegido",
        priceLabel: "US$5",
        recommendationBonus: 1.35,
        shortName: "Orbit",
        sourceTierKey: "level5",
        spotlightLabel: "Recommended",
        tagline: "El punto de equilibrio entre acceso y presencia.",
        visual: {
          border: "rgba(56,189,248,0.36)",
          glow: "rgba(129,140,248,0.36)",
          surface:
            "linear-gradient(160deg,rgba(7,17,35,0.96),rgba(14,52,86,0.8),rgba(76,29,149,0.62))",
          text: "#eef2ff",
        },
        xp: {
          level: 8,
          monthlyBoost: 110,
          nextLevelXp: 750,
          upgradeBonusXp: 180,
          xp: 520,
        },
      },
      {
        badgeEvolution: {
          previewMonths: 6,
          stages: [
            {
              accent: "#f472b6",
              emoji: "◆",
              id: "v0",
              label: "Vanguard",
              monthsRequired: 0,
            },
            {
              accent: "#fb7185",
              emoji: "✦",
              id: "v1",
              label: "Riot",
              monthsRequired: 3,
            },
            {
              accent: "#f9a8d4",
              emoji: "✧",
              id: "v2",
              label: "Ascend",
              monthsRequired: 6,
            },
          ],
        },
        billingLabel: "por mes",
        conversionNote: "La mejora premium elimina la sensación de límite.",
        ctaLabel: "Subir a Vanguard",
        emphasis: "premium",
        eyebrow: "Priority lane",
        featureValues: {
          "ad-removal": {
            adFree: true,
            kind: "ad-preview",
            placeholderLabel: "Clean feed",
            slots: 4,
          },
          "backstage-room": {
            detail: "Backstage completo y drops antes.",
            enabled: true,
            kind: "boolean",
          },
          "early-access": {
            detail: "Primera ola de acceso.",
            kind: "timeline",
            phases: [
              { accent: "#f472b6", hours: 24, label: "Vanguard first look" },
              { accent: "#06b6d4", hours: 24, label: "Orbit window" },
              { accent: "#64748b", hours: 24, label: "Public release" },
            ],
          },
          "emoji-vault": {
            items: [
              {
                accent: "#f472b6",
                emoji: "👑",
                id: "v-emoji-1",
                label: "Crown",
              },
              {
                accent: "#fb7185",
                emoji: "🩷",
                id: "v-emoji-2",
                label: "Pulse heart",
              },
              {
                accent: "#f59e0b",
                emoji: "🚀",
                id: "v-emoji-3",
                label: "Launch",
              },
              {
                accent: "#38bdf8",
                emoji: "🧠",
                id: "v-emoji-4",
                label: "Signal mind",
              },
            ],
            kind: "assets",
          },
          "favorites-cap": { kind: "counter", suffix: "slots", value: 50 },
          "premium-links": {
            detail: "Todo desbloqueado.",
            enabled: true,
            kind: "boolean",
          },
          "sticker-lab": {
            items: [
              {
                accent: "#f472b6",
                emoji: "💥",
                id: "v-sticker-1",
                label: "Impact",
              },
              {
                accent: "#fb7185",
                emoji: "🗡",
                id: "v-sticker-2",
                label: "Strike",
              },
              {
                accent: "#fde68a",
                emoji: "🌟",
                id: "v-sticker-3",
                label: "Fanfare",
              },
              {
                accent: "#38bdf8",
                emoji: "🪽",
                id: "v-sticker-4",
                label: "Wing",
              },
            ],
            kind: "assets",
          },
          "theme-remix": {
            kind: "palette",
            palettes: [
              {
                colors: ["#190b22", "#f472b6", "#fb7185"],
                gradient: "linear-gradient(135deg,#190b22,#7e1d59 42%,#fb7185)",
                id: "v-theme-1",
                label: "Velvet shock",
              },
              {
                colors: ["#111827", "#ec4899", "#fde68a"],
                gradient: "linear-gradient(135deg,#111827,#9d174d 42%,#fde68a)",
                id: "v-theme-2",
                label: "Royal flare",
              },
            ],
          },
        },
        id: "vanguard",
        identity: {
          badgeAccent: "#f472b6",
          badgeLabel: "Priority",
          glow: "rgba(244,114,182,0.48)",
          gradient: ["#fbcfe8", "#fb7185"],
          sampleName: "VanguardPrime",
          subtitle: "La cuenta ya comunica prioridad.",
        },
        name: "Vanguard",
        order: 3,
        patronUrl: "https://www.patreon.com/",
        popularityNote: "Premium",
        priceLabel: "US$8",
        recommendationBonus: 1.1,
        shortName: "Vanguard",
        sourceTierKey: "level8",
        spotlightLabel: "Priority",
        tagline: "Acceso adelantado, presencia fuerte y menos límites.",
        visual: {
          border: "rgba(244,114,182,0.34)",
          glow: "rgba(251,113,133,0.42)",
          surface:
            "linear-gradient(160deg,rgba(28,10,24,0.98),rgba(88,20,66,0.84),rgba(249,115,22,0.48))",
          text: "#fff1f2",
        },
        xp: {
          level: 12,
          monthlyBoost: 185,
          nextLevelXp: 900,
          upgradeBonusXp: 260,
          xp: 690,
        },
      },
      {
        badgeEvolution: {
          previewMonths: 9,
          stages: [
            {
              accent: "#facc15",
              emoji: "⬡",
              id: "z0",
              label: "Zenith",
              monthsRequired: 0,
            },
            {
              accent: "#fde047",
              emoji: "✷",
              id: "z1",
              label: "Solar",
              monthsRequired: 4,
            },
            {
              accent: "#fff7ae",
              emoji: "✺",
              id: "z2",
              label: "Crown",
              monthsRequired: 8,
            },
          ],
        },
        billingLabel: "por mes",
        conversionNote: "Máxima visibilidad, máxima anticipación y cero techo.",
        ctaLabel: "Subir a Zenith",
        emphasis: "legend",
        eyebrow: "Top tier",
        featureValues: {
          "ad-removal": {
            adFree: true,
            kind: "ad-preview",
            placeholderLabel: "No ads",
            slots: 4,
          },
          "backstage-room": {
            detail: "Canales y drops más exclusivos.",
            enabled: true,
            kind: "boolean",
          },
          "early-access": {
            detail: "Siempre en la punta de la cola.",
            kind: "timeline",
            phases: [
              { accent: "#facc15", hours: 24, label: "Zenith first wave" },
              { accent: "#f472b6", hours: 24, label: "Vanguard wave" },
              { accent: "#06b6d4", hours: 24, label: "Orbit wave" },
            ],
          },
          "emoji-vault": {
            items: [
              {
                accent: "#facc15",
                emoji: "🌞",
                id: "z-emoji-1",
                label: "Solar",
              },
              {
                accent: "#fde047",
                emoji: "🦁",
                id: "z-emoji-2",
                label: "Lion",
              },
              {
                accent: "#f59e0b",
                emoji: "⚜",
                id: "z-emoji-3",
                label: "Sigil",
              },
              {
                accent: "#f472b6",
                emoji: "💎",
                id: "z-emoji-4",
                label: "Facet",
              },
              {
                accent: "#38bdf8",
                emoji: "🛡",
                id: "z-emoji-5",
                label: "Aegis",
              },
            ],
            kind: "assets",
          },
          "favorites-cap": {
            emphasis: "unlimited",
            kind: "counter",
            suffix: "slots",
            value: 999,
          },
          "premium-links": {
            detail: "Acceso premium total.",
            enabled: true,
            kind: "boolean",
          },
          "sticker-lab": {
            items: [
              {
                accent: "#facc15",
                emoji: "👁",
                id: "z-sticker-1",
                label: "Oracle",
              },
              {
                accent: "#fde047",
                emoji: "🜂",
                id: "z-sticker-2",
                label: "Sunfire",
              },
              {
                accent: "#fb7185",
                emoji: "🏆",
                id: "z-sticker-3",
                label: "Trophy",
              },
              {
                accent: "#38bdf8",
                emoji: "🧬",
                id: "z-sticker-4",
                label: "Helix",
              },
              {
                accent: "#c084fc",
                emoji: "🔱",
                id: "z-sticker-5",
                label: "Trident",
              },
            ],
            kind: "assets",
          },
          "theme-remix": {
            kind: "palette",
            palettes: [
              {
                colors: ["#1c1917", "#facc15", "#fb7185"],
                gradient:
                  "linear-gradient(135deg,#1c1917,#92400e 35%,#facc15 68%,#fb7185)",
                id: "z-theme-1",
                label: "Solar monarch",
              },
              {
                colors: ["#111827", "#f59e0b", "#fff1a6"],
                gradient:
                  "linear-gradient(135deg,#111827,#78350f 38%,#fde047 72%,#fff1a6)",
                id: "z-theme-2",
                label: "Golden signal",
              },
            ],
          },
        },
        id: "zenith",
        identity: {
          badgeAccent: "#facc15",
          badgeLabel: "Zenith",
          glow: "rgba(250,204,21,0.5)",
          gradient: ["#fff7ae", "#facc15"],
          sampleName: "ZenithCrown",
          subtitle: "Presencia que nadie confunde con básica.",
        },
        name: "Zenith",
        order: 4,
        patronUrl: "https://www.patreon.com/",
        popularityNote: "Elite",
        priceLabel: "US$12",
        recommendationBonus: 0.9,
        shortName: "Zenith",
        sourceTierKey: "level12",
        spotlightLabel: "Elite",
        tagline: "La versión sin techo de la experiencia VIP.",
        visual: {
          border: "rgba(250,204,21,0.38)",
          glow: "rgba(250,204,21,0.44)",
          surface:
            "linear-gradient(160deg,rgba(27,17,3,0.98),rgba(120,53,15,0.86),rgba(250,204,21,0.42))",
          text: "#fefce8",
        },
        xp: {
          level: 18,
          monthlyBoost: 260,
          nextLevelXp: 1100,
          upgradeBonusXp: 360,
          xp: 870,
        },
      },
    ],
  });
