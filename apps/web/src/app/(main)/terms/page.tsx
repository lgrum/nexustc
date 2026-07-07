import { getStaticPageMetadata, StaticPage } from "../static-page";

export const generateMetadata = () => getStaticPageMetadata("terms");

export default function Page() {
  return <StaticPage slug="terms" />;
}
