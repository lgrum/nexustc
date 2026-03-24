import { Link } from "@tanstack/react-router";

import { Button } from "../ui/button";

const footerLinks = [
  { href: "/about", label: "Acerca" },
  { href: "/privacy", label: "Política de Privacidad" },
  { href: "/terms", label: "Términos y Condiciones" },
  { href: "/legal", label: "Aviso Legal" },
] as const;

export function Footer() {
  return (
    <footer className="flex w-full flex-wrap items-center justify-around gap-6 border-t p-10">
      <h1 className="font-bold text-3xl text-primary/80">
        NeXusTC
        <span className="align-super font-normal text-sm">+18</span>
        <span className="font-normal text-sm"> BETA</span>
        <span className="text-sm"> &copy; 2026</span>
      </h1>
      <div className="flex flex-wrap justify-center gap-4 text-muted-foreground">
        {footerLinks.map((link) => (
          <FooterLink key={link.label} {...link} />
        ))}
      </div>
    </footer>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Button className="text-muted-foreground" variant="link">
      <Link to={href}>{label}</Link>
    </Button>
  );
}
