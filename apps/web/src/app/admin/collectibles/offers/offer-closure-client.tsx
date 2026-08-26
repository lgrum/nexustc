"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

function idempotencyKey(prefix: string) {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}`;
  return `collectibles-admin:${prefix}:${id}`;
}

export function CollectibleOfferClosureClient() {
  const [tradeId, setTradeId] = useState("");
  const [tradeVersion, setTradeVersion] = useState("1");
  const [tradeReason, setTradeReason] = useState("");
  const [giftId, setGiftId] = useState("");
  const [giftVersion, setGiftVersion] = useState("1");
  const [giftReason, setGiftReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef({
    trade: null as string | null,
    gift: null as string | null,
  });
  const trade = useMutation(
    orpc.collectiblesAdmin.offers.trades.cancel.mutationOptions()
  );
  const gift = useMutation(
    orpc.collectiblesAdmin.offers.gifts.cancel.mutationOptions()
  );
  const pending = trade.isPending || gift.isPending;

  async function cancelTrade(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = tradeReason.trim();
    const expectedVersion = Number(tradeVersion);
    if (
      !tradeId.trim() ||
      reason.length < 3 ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      setMessage("Completa la oferta, versión y motivo del intercambio.");
      return;
    }
    keys.current.trade ??= idempotencyKey("trade-cancel");
    try {
      await trade.mutateAsync({
        expectedVersion,
        idempotencyKey: keys.current.trade,
        offerId: tradeId.trim(),
        reason,
      });
      keys.current.trade = null;
      setMessage(
        "Intercambio cerrado; la custodia quedó liberada sin transferir activos."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cerrar el intercambio."
      );
    }
  }

  async function cancelGift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = giftReason.trim();
    const expectedVersion = Number(giftVersion);
    if (
      !giftId.trim() ||
      reason.length < 3 ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      setMessage("Completa el regalo, versión y motivo.");
      return;
    }
    keys.current.gift ??= idempotencyKey("gift-cancel");
    try {
      await gift.mutateAsync({
        expectedVersion,
        giftId: giftId.trim(),
        idempotencyKey: keys.current.gift,
        reason,
      });
      keys.current.gift = null;
      setMessage(
        "Regalo cerrado; la custodia quedó liberada sin aceptar ni transferir."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo cerrar el regalo."
      );
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Cerrar intercambio</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={cancelTrade}>
            <div className="grid gap-2">
              <Label htmlFor="collectible-trade-id">
                Identificador técnico del intercambio
              </Label>
              <Input
                id="collectible-trade-id"
                onChange={(event) => setTradeId(event.target.value)}
                required
                value={tradeId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-trade-version">
                Versión esperada del intercambio
              </Label>
              <Input
                id="collectible-trade-version"
                min={1}
                onChange={(event) => setTradeVersion(event.target.value)}
                required
                type="number"
                value={tradeVersion}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-trade-reason">
                Motivo del intercambio
              </Label>
              <Textarea
                id="collectible-trade-reason"
                minLength={3}
                onChange={(event) => setTradeReason(event.target.value)}
                required
                value={tradeReason}
              />
            </div>
            <Button disabled={pending} loading={trade.isPending} type="submit">
              Cerrar intercambio
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cerrar regalo</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={cancelGift}>
            <div className="grid gap-2">
              <Label htmlFor="collectible-gift-id">
                Identificador técnico del regalo
              </Label>
              <Input
                id="collectible-gift-id"
                onChange={(event) => setGiftId(event.target.value)}
                required
                value={giftId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-gift-version">
                Versión esperada del regalo
              </Label>
              <Input
                id="collectible-gift-version"
                min={1}
                onChange={(event) => setGiftVersion(event.target.value)}
                required
                type="number"
                value={giftVersion}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-gift-reason">Motivo del regalo</Label>
              <Textarea
                id="collectible-gift-reason"
                minLength={3}
                onChange={(event) => setGiftReason(event.target.value)}
                required
                value={giftReason}
              />
            </div>
            <Button disabled={pending} loading={gift.isPending} type="submit">
              Cerrar regalo
            </Button>
          </form>
        </CardContent>
      </Card>
      <p
        aria-live="polite"
        className="text-muted-foreground text-sm md:col-span-2"
      >
        {message ??
          "Los cierres administrativos no aceptan, transfieren ni publican Eteris."}
      </p>
    </div>
  );
}
