import { Dialog } from "@base-ui/react/dialog";
import { SquareLock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { getCookie } from "@/lib/utils";

import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

export function AgeVerificationDialog() {
  const [open, setOpen] = useState(false);

  // getCookie only works on browser environments, so we avoid ssr with this
  useEffect(() => {
    setOpen(!getCookie("age_verified"));
  }, []);

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-background/80 backdrop-blur-3xl data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Popup className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-2xl">
          <Card>
            <CardHeader className="flex flex-col items-center">
              <CardTitle className="flex flex-row items-center gap-2">
                <HugeiconsIcon icon={SquareLock01Icon} /> VERIFICACIÓN DE EDAD
              </CardTitle>
              <CardDescription className="flex flex-col items-center text-center">
                <span className="font-bold">
                  Este sitio puede contener contenido sexual no apropiado para
                  todas las edades
                </span>
                Al entrar, estás afirmando que tienes al menos 18 años de edad o
                la mayoría de edad en la jurisdicción en la que te encuentras.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="prose dark:prose-invert h-75 w-full rounded-md border p-4">
                <h1>Verificación de Edad</h1>
                <p>
                  Este sitio web contiene contenido para adultos que incluye
                  representaciones gráficas, lenguaje explícito y temáticas
                  sexuales.
                </p>
                <p>
                  Al ingresar, declaras que tienes 18 años o más, o que eres
                  mayor de edad según la legislación vigente en tu país o
                  región.
                </p>
                <p>
                  Si NO cumples con este requisito, NO estás autorizado a
                  acceder ni visualizar el contenido de este sitio.
                </p>
                <h2>Aviso Legal y Condiciones</h2>
                <p>
                  Al continuar navegando, aceptas expresamente los siguientes
                  puntos:
                </p>
                <ul>
                  <li>
                    Que no te ofende el contenido sexual explícito en cualquiera
                    de sus formas (visual, textual, o interactiva).
                  </li>
                  <li>
                    Que el acceso a este sitio es voluntario y bajo tu propia
                    responsabilidad.
                  </li>
                  <li>
                    Que cumplirás con todos los términos y condiciones
                    establecidos en nuestras [Políticas de Uso] y [Aviso Legal]
                    (puedes enlazarlos si los tienes).
                  </li>
                  <li>
                    Que no compartirás el contenido de este sitio con menores de
                    edad, ni lo usarás de forma ilegal o irresponsable.
                  </li>
                </ul>
                <p>
                  Si tienes menos de 18 años o si este tipo de contenido va en
                  contra de tus valores, creencias o leyes locales, por favor
                  abandona el sitio inmediatamente.
                </p>
              </ScrollArea>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <button
                className="w-full max-w-md cursor-pointer rounded-full bg-primary text-primary-foreground"
                onClick={async () => {
                  await cookieStore.set({
                    name: "age_verified",
                    value: "true",
                    path: "/",
                    expires: new Date("9999-12-31T23:59:59Z").getTime(),
                    sameSite: "lax",
                  });
                  setOpen(false);
                }}
                type="button"
              >
                <div className="flex flex-col gap-2 p-2">
                  <p className="text-lg">Tengo más de 18 años</p>
                  <p className="font-bold text-3xl">ENTRAR AHORA</p>
                </div>
              </button>
              <Button
                className="w-full underline"
                onClick={() => {
                  window.location.assign("about:blank");
                }}
                variant="link"
              >
                No, tengo menos de 18 años
              </Button>
            </CardFooter>
          </Card>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
