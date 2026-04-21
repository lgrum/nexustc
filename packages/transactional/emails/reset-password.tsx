import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import tailwindConfig from "../tailwind.config";

type ConfirmEmailProps = {
  resetUrl: string;
};

export const ResetPassword = ({ resetUrl }: ConfirmEmailProps) => (
  <Html>
    <Head>
      <Font
        fallbackFontFamily="Verdana"
        fontFamily="Outfit"
        fontStyle="normal"
        fontWeight={400}
        webFont={{
          format: "woff2",
          url: "https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap",
        }}
      />
    </Head>
    <Tailwind config={tailwindConfig}>
      <Body className="mx-auto my-0 bg-slate-950 font-sans text-stone-300">
        <Preview>Reestablece tu contraseña</Preview>
        <Container className="mx-auto my-0 px-5 py-0">
          <Section className="mt-8 text-center">
            <Heading className="mx-0 my-7.5 inline-block p-0 font-bold text-3xl text-white leading-10.5">
              NeXus
              <span className="text-amber-400">TC</span>
            </Heading>
          </Section>
          <Heading className="mx-0 my-7.5 p-0 font-bold text-3xl leading-10.5 text-center text-balance">
            Reestablece tu Contraseña
          </Heading>
          <Text className="mb-7.5 text-center text-xl">
            No te preocupes, solo haz click en el botón de abajo y podrás crear
            una nueva contraseña para tu cuenta.
          </Text>

          <Section className="px-0 py-6.75 text-center">
            <Button
              className="inline-block rounded-full bg-amber-500/10 px-5.75 py-2.75 text-center font-semibold text-[15px] text-amber-400 border border-amber-400 no-underline"
              href={resetUrl}
            >
              Reestablecer Contraseña
            </Button>
          </Section>

          <Section className="" />

          <Text className="text-sm leading-6">
            Si no puedes acceder al link, haz click o copia y pega el siguiente
            en tu navegador:{" "}
            <Link
              className="text-sm text-white leading-6 underline"
              href={resetUrl}
            >
              {resetUrl}
            </Link>
          </Text>

          <Text className="text-sm leading-6">
            Si no solicitaste este correo, ignóralo.
          </Text>

          <Section className="mb-8 w-full">
            <Row className="w-full">
              <Column className="text-[#b7b7b7] text-xs leading-3.75">
                NeXusTC © 2026
              </Column>
              <Column className="text-right text-[#b7b7b7] text-xs leading-3.75">
                Todos los derechos reservados.
              </Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

ResetPassword.PreviewProps = {
  resetUrl: "https://nexustc18.com",
} as ConfirmEmailProps;

export default ResetPassword;
