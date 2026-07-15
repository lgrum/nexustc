import { getStaticPageMetadata, StaticPage } from "../static-page";

export const generateMetadata = () => getStaticPageMetadata("about");

export default function Page() {
  return <StaticPage slug="about" />;
}
