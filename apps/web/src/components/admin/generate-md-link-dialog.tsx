import { useState } from "react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldSet } from "../ui/field";
import { Input } from "../ui/input";

export function GenerateMarkdownLinkDialog() {
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogData, setDialogData] = useState({
    link: "",
    text: "",
  });

  return (
    <Dialog onOpenChange={setOpenDialog} open={openDialog}>
      <DialogTrigger render={<Button />}>Generar Link</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar Link</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const { text } = dialogData;
            const { link } = dialogData;

            setOpenDialog(false);

            try {
              await navigator.clipboard.writeText(`[${text}](${link})`);
              trackEvent("markdown_link_generated", {
                linkLength: link.length,
                textLength: text.length,
              });
              toast.success("Link copiado al portapapeles!");
            } catch {
              toast.error("Error al generar link");
            }

            setDialogData({
              link: "",
              text: "",
            });
          }}
        >
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="text">Texto</FieldLabel>
                <Input
                  id="text"
                  onChange={(e) =>
                    setDialogData((prev) => ({
                      ...prev,
                      text: e.target.value,
                    }))
                  }
                  placeholder="Texto..."
                  type="text"
                  value={dialogData.text}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link">Link</FieldLabel>
                <Input
                  id="link"
                  onChange={(e) =>
                    setDialogData((prev) => ({
                      ...prev,
                      link: e.target.value,
                    }))
                  }
                  placeholder="Link..."
                  type="url"
                  value={dialogData.link}
                />
              </Field>
              <Button type="submit">Generar</Button>
            </FieldGroup>
          </FieldSet>
        </form>
      </DialogContent>
    </Dialog>
  );
}
