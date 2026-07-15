import { getStaticPageMetadata, StaticPage } from "../static-page";

export const generateMetadata = () => getStaticPageMetadata("privacy");

export default function Page() {
  return <StaticPage slug="privacy" />;
}
