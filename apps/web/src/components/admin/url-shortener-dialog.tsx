import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export function URLShortenerDialog({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [shortenedUrl, setShortenedUrl] = useState("");

  const shortenUrlMutation = useMutation({
    ...orpc.extras.shortenUrl.mutationOptions(),
    onError: (error) => {
      toast.error(
        `No se pudo acortar la URL: ${error instanceof Error ? error.message : "Error desconocido"}`
      );
    },
    onSuccess: (data) => {
      setShortenedUrl(data.shortenedUrl);
      toast.success("URL acortada correctamente");
    },
  });

  const resetState = () => {
    setUrl("");
    setShortenedUrl("");
    shortenUrlMutation.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetState();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shortenedUrl);
      toast.success("URL copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar la URL");
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button
            className={cn(triggerClassName)}
            type="button"
            variant="outline"
          />
        }
      >
        Acortar URL
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acortar URL</DialogTitle>
          <DialogDescription>
            Envía una URL al pipeline `uii.io` → `shrinkearn.com` → `exe.io`.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            event.stopPropagation();

            await shortenUrlMutation.mutateAsync({ url });
          }}
        >
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="url-shortener-source-url">
                  URL original
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="url-shortener-source-url"
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/post"
                    required
                    type="url"
                    value={url}
                  />
                  <FieldDescription>
                    Se intentará usar el título de la página como alias si está
                    disponible.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="url-shortener-result">
                  URL final
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="url-shortener-result"
                    placeholder="La URL acortada aparecerá aquí"
                    readOnly
                    type="text"
                    value={shortenedUrl}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              disabled={!shortenedUrl}
              onClick={handleCopy}
              type="button"
              variant="outline"
            >
              Copiar
            </Button>
            <Button
              disabled={!url}
              loading={shortenUrlMutation.isPending}
              type="submit"
            >
              Acortar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
