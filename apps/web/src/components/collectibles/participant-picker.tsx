"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

export type CollectibleParticipant = {
  avatarFallbackColor: string | null;
  id: string;
  image: string | null;
  name: string;
};

export function ParticipantPicker({
  label = "Persona destinataria",
  onChange,
  value,
}: {
  label?: string;
  onChange: (participant: CollectibleParticipant | null) => void;
  value: CollectibleParticipant | null;
}) {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const results = useQuery({
    ...orpc.user.searchCollectibleParticipants.queryOptions({
      input: { search: submittedSearch || "__" },
    }),
    enabled: submittedSearch.length >= 2,
  });

  if (value) {
    return (
      <div className="rounded-2xl border bg-background/70 p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-2 flex items-center gap-3">
          <ProfileAvatar className="size-10" user={value} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{value.name}</p>
            <p className="text-muted-foreground text-sm">Cuenta seleccionada</p>
          </div>
          <Button
            onClick={() => onChange(null)}
            type="button"
            variant="outline"
          >
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
      <div>
        <label className="font-semibold text-sm" htmlFor="participant-search">
          {label}
        </label>
        <p className="text-muted-foreground text-xs">
          Busca por el nombre visible de la cuenta.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = search.trim();
          if (normalized.length >= 2) {
            setSubmittedSearch(normalized);
          }
        }}
      >
        <Input
          autoComplete="off"
          id="participant-search"
          minLength={2}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nombre de usuario"
          type="search"
          value={search}
        />
        <Button
          disabled={search.trim().length < 2}
          type="submit"
          variant="outline"
        >
          Buscar
        </Button>
      </form>
      {results.isFetching ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Buscando cuentas…
        </p>
      ) : results.isError ? (
        <p className="text-destructive text-sm" role="alert">
          No pudimos buscar cuentas. Intenta nuevamente.
        </p>
      ) : submittedSearch && results.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No encontramos cuentas con ese nombre.
        </p>
      ) : results.data?.length ? (
        <ul
          aria-label="Cuentas encontradas"
          className="grid gap-2 sm:grid-cols-2"
        >
          {results.data.map((participant) => (
            <li key={participant.id}>
              <button
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onChange(participant)}
                type="button"
              >
                <ProfileAvatar
                  className="size-8"
                  decorative
                  user={participant}
                />
                <span className="truncate font-medium">{participant.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
