import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import tailwindConfig from "../tailwind.config";

type TwoFactorCodeProps = {
  code: string;
};

export const TwoFactorCode = ({ code }: TwoFactorCodeProps) => (
  <Html>
    <Head />
    <Preview>{code} es tu código de verificación de NeXusTC</Preview>
    <Tailwind config={tailwindConfig}>
      <Body className="mx-auto my-0 bg-zinc-950 font-sans text-stone-300">
        <Container className="mx-auto px-5 py-10">
          <Heading className="text-center font-bold text-3xl text-white">
            NeXus<span className="text-amber-400">TC</span>
          </Heading>
          <Text className="text-center text-lg">
            Usa este código para completar tu inicio de sesión:
          </Text>
          <Section className="my-8 text-center">
            <Text className="m-0 font-bold text-4xl text-amber-400 tracking-[0.25em]">
              {code}
            </Text>
          </Section>
          <Text className="text-center text-sm">
            Si no intentaste iniciar sesión, cambia tu contraseña.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

TwoFactorCode.PreviewProps = {
  code: "123456",
} as TwoFactorCodeProps;

export default TwoFactorCode;
