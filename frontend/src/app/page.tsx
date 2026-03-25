import localFont from "next/font/local";

import { HomePageClient } from "@/components/home/HomePageClient";

const greetingFont = localFont({
  src: "../../public/fonts/Christopher.otf",
  display: "swap",
});

export default function HomePage() {
  return <HomePageClient greetingFontClassName={greetingFont.className} />;
}
