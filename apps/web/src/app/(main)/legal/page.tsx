import { getStaticPageMetadata, StaticPage } from "../static-page";

export const generateMetadata = () => getStaticPageMetadata("legal");

export default function Page() {
  return <StaticPage slug="legal" />;
}
