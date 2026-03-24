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
  verificationUrl: string;
};

export const ConfirmEmail = ({ verificationUrl }: ConfirmEmailProps) => (
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
      <Body className="mx-auto my-0 bg-zinc-800 font-sans text-stone-300">
        <Preview>Confirma tu Correo Electrónico</Preview>
        <Container className="mx-auto my-0 px-5 py-0">
          <Section className="mt-8">
            <Heading className="mx-0 my-[30px] p-0 text-center font-bold text-3xl text-pink-500 leading-[42px]">
              NeXusTC
            </Heading>
          </Section>
          <Heading className="mx-0 my-[30px] p-0 font-bold text-3xl leading-[42px]">
            Confirma tu Correo Electrónico
          </Heading>
          <Text className="mb-7.5 text-xl">
            Tu link de confirmación está abajo - Haz click en el link para
            verificar tu correo electrónico
          </Text>

          <Section className="px-0 py-[27px]">
            <Button
              className="block rounded-full bg-pink-600 px-[23px] py-[11px] text-center font-semibold text-[15px] text-white no-underline"
              href={verificationUrl}
            >
              Verificar correo electrónico
            </Button>
          </Section>

          <Text className="text-sm leading-6">
            Si no puedes acceder al link, haz click o copia y pega el siguiente
            en tu navegador:{" "}
            <Link
              className="text-sm text-white leading-6 underline"
              href={verificationUrl}
            >
              {verificationUrl}
            </Link>
          </Text>

          <Text className="text-sm leading-6">
            Si no solicitaste este correo, ignóralo.
          </Text>

          <Section className="mb-8 w-full">
            <Row className="w-full">
              <Column className="text-[#b7b7b7] text-xs leading-[15px]">
                NexusTC © 2025
              </Column>
              <Column className="text-right text-[#b7b7b7] text-xs leading-[15px]">
                Todos los derechos reservados.
              </Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

ConfirmEmail.PreviewProps = {
  verificationUrl: "https://nexustc18.com",
} as ConfirmEmailProps;

export default ConfirmEmail;
