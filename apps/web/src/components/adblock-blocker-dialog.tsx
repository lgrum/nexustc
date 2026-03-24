import { Dialog } from "@base-ui/react/dialog";
import { AlertDiamondIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

type AdblockBlockerDialogProps = {
  open: boolean;
};

const handleReload = () => {
  window.location.reload();
};

export function AdblockBlockerDialog({ open }: AdblockBlockerDialogProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-background/80 backdrop-blur-3xl data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Popup className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-lg">
          <Card>
            <CardHeader className="flex flex-col items-center">
              <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <HugeiconsIcon
                  className="size-6 text-destructive"
                  icon={AlertDiamondIcon}
                />
              </div>
              <CardTitle className="text-center">
                BLOQUEADOR DE ANUNCIOS DETECTADO
              </CardTitle>
              <CardDescription className="text-center">
                <span className="font-bold">
                  Por favor, desactiva tu bloqueador de anuncios para continuar
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                Nuestro sitio depende de los anuncios para mantenerse en
                funcionamiento. Te pedimos que desactives tu bloqueador de
                anuncios y recargues la página.
              </p>
              <div className="mt-4 rounded-lg bg-muted p-4 text-left text-sm">
                <p className="mb-2 font-medium">
                  Cómo desactivar tu bloqueador:
                </p>
                <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>
                    Haz clic en el icono de tu bloqueador en la barra del
                    navegador
                  </li>
                  <li>
                    Selecciona &quot;Pausar en este sitio&quot; o
                    &quot;Desactivar&quot;
                  </li>
                  <li>Recarga la página</li>
                </ol>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleReload} size="lg">
                Ya desactivé el bloqueador - Recargar página
              </Button>
            </CardFooter>
          </Card>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
